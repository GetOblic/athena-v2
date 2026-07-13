/**
 * Website Intelligence providers for Prospect sources.
 *
 * - homepage_only: single-page extract (kept for compatibility / tests)
 * - multi_page_discovery: intelligent discovery of up to 10 high-value pages,
 *   rich extraction, and merged Business Brain knowledge
 */

import { discoverCandidatePages } from "@/services/prospects/prospectWebsiteDiscovery";
import { extractPageContent } from "@/services/prospects/prospectWebsiteExtraction";
import {
  emptyBusinessKnowledge,
  mergeWebsiteKnowledge,
  type BusinessKnowledgePackage,
} from "@/services/prospects/prospectWebsiteKnowledgeMerge";
import {
  pageDisplayLabel,
  rankAndSelectPages,
} from "@/services/prospects/prospectWebsiteRanking";
import {
  normalizeCrawlUrl,
  WEBSITE_INTELLIGENCE_MAX_PAGES,
} from "@/services/prospects/prospectWebsiteUrl";

export type AnalyzedPageSummary = {
  url: string;
  title: string | null;
  label: string;
};

export type HomepageIntelligence = {
  provider: "homepage_only" | "multi_page_discovery";
  url: string;
  scraped_at: string;
  title: string | null;
  headings: string;
  paragraphs: string;
  positioning: string;
  products: string;
  services: string;
  about: string;
  target_audience: string;
  messaging: string;
  value_proposition: string;
  cta: string;
  differentiators: string;
  trust_signals: string;
  contact_information: string;
  brand_tone: string;
  error?: string;
  /** Multi-page discovery metadata (optional for legacy homepage_only rows). */
  pages_analyzed?: number;
  pages_limit?: number;
  pages?: AnalyzedPageSummary[];
  business_knowledge?: BusinessKnowledgePackage;
  crawl_partial?: boolean;
  crawl_timeout?: boolean;
};

export type WebsiteIntelligenceProvider = {
  readonly id: string;
  extract(websiteUrl: string): Promise<HomepageIntelligence>;
};

const PER_PAGE_TIMEOUT_MS = 8_000;
const OVERALL_CRAWL_TIMEOUT_MS = 28_000;
const FETCH_CONCURRENCY = 3;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function extractMatches(html: string, pattern: RegExp): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const text = stripTags(match[1] ?? "");
    if (text.length >= 3) {
      values.push(text);
    }
  }
  return values;
}

function uniqueJoin(values: string[], limit = 12): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out.join("\n");
}

function sectionByKeywords(paragraphs: string[], keywords: string[]): string {
  const matched = paragraphs.filter((paragraph) =>
    keywords.some((keyword) => paragraph.toLowerCase().includes(keyword)),
  );
  return uniqueJoin(matched, 6);
}

function emptyResult(
  websiteUrl: string,
  scrapedAt: string,
  error?: string,
  provider: HomepageIntelligence["provider"] = "homepage_only",
): HomepageIntelligence {
  return {
    provider,
    url: websiteUrl,
    scraped_at: scrapedAt,
    title: null,
    headings: "",
    paragraphs: "",
    positioning: "",
    products: "",
    services: "",
    about: "",
    target_audience: "",
    messaging: "",
    value_proposition: "",
    cta: "",
    differentiators: "",
    trust_signals: "",
    contact_information: "",
    brand_tone: "",
    error,
    pages_analyzed: 0,
    pages_limit: WEBSITE_INTELLIGENCE_MAX_PAGES,
    pages: [],
    business_knowledge: emptyBusinessKnowledge(),
    crawl_partial: Boolean(error),
  };
}

async function fetchHtml(
  url: string,
  signal: AbortSignal,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; error: string }> {
  try {
    const pageController = new AbortController();
    const onAbort = () => pageController.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const pageTimeout = setTimeout(
      () => pageController.abort(),
      PER_PAGE_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: pageController.signal,
        headers: {
          "User-Agent": "AthenaProspectIntelligence/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (
        contentType &&
        !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)
      ) {
        return { ok: false, error: `Unsupported content-type ${contentType}` };
      }

      const html = await response.text();
      return { ok: true, html, finalUrl: response.url || url };
    } finally {
      clearTimeout(pageTimeout);
      signal.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop: () => boolean,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      if (shouldStop()) return;
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  );
  await Promise.all(runners);
  return results;
}

export const homepageOnlyWebsiteIntelligenceProvider: WebsiteIntelligenceProvider =
  {
    id: "homepage_only",
    async extract(websiteUrl: string): Promise<HomepageIntelligence> {
      const scrapedAt = new Date().toISOString();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);

        const response = await fetch(websiteUrl, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": "AthenaProspectIntelligence/1.0",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return emptyResult(websiteUrl, scrapedAt, `HTTP ${response.status}`);
        }

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? stripTags(titleMatch[1]) : null;
        const metaDescriptionMatch = html.match(
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
        );
        const metaDescription = metaDescriptionMatch
          ? decodeEntities(metaDescriptionMatch[1])
          : "";

        const headings = uniqueJoin([
          ...extractMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi),
          ...extractMatches(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi),
          ...extractMatches(html, /<h3[^>]*>([\s\S]*?)<\/h3>/gi),
        ]);

        const paragraphs = uniqueJoin(
          extractMatches(html, /<p[^>]*>([\s\S]*?)<\/p>/gi).filter(
            (value) => value.length >= 40 && value.length <= 600,
          ),
          20,
        );
        const paragraphList = paragraphs
          ? paragraphs.split("\n").filter(Boolean)
          : [];

        const about = sectionByKeywords(paragraphList, [
          "about",
          "we are",
          "our mission",
          "our story",
          "who we",
        ]);
        const services = sectionByKeywords(paragraphList, [
          "service",
          "solution",
          "offer",
          "platform",
        ]);
        const products = sectionByKeywords(paragraphList, [
          "product",
          "suite",
          "software",
          "tool",
        ]);
        const valueProposition = sectionByKeywords(paragraphList, [
          "help",
          "enable",
          "transform",
          "value",
          "benefit",
          "why",
        ]);
        const targetAudience = sectionByKeywords(paragraphList, [
          "for teams",
          "for companies",
          "customers",
          "clients",
          "who we serve",
          "built for",
        ]);
        const differentiators = sectionByKeywords(paragraphList, [
          "unlike",
          "different",
          "only",
          "unique",
          "advantage",
          "better",
        ]);
        const trustSignals = sectionByKeywords(paragraphList, [
          "trusted",
          "customers",
          "award",
          "certified",
          "reviewed",
          "partners",
          "featured",
        ]);
        const messaging = uniqueJoin(
          [metaDescription, ...paragraphList.slice(0, 3)].filter(Boolean),
          4,
        );
        const positioning = uniqueJoin(
          [title, metaDescription, headings.split("\n")[0]].filter(
            Boolean,
          ) as string[],
          3,
        );
        const brandTone = messaging
          ? messaging.length > 180
            ? "Professional / commercial"
            : "Concise / direct"
          : "";

        const ctaCandidates = extractMatches(
          html,
          /<(?:a|button)[^>]*>([\s\S]*?(?:book|demo|contact|get started|talk|schedule|learn more)[\s\S]*?)<\/(?:a|button)>/gi,
        );
        const emails = [
          ...html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
        ].map((match) => match[0]);
        const phones = [
          ...html.matchAll(
            /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g,
          ),
        ].map((match) => match[0]);

        return {
          provider: "homepage_only",
          url: websiteUrl,
          scraped_at: scrapedAt,
          title,
          headings,
          paragraphs,
          positioning,
          products,
          services,
          about,
          target_audience: targetAudience,
          messaging,
          value_proposition: valueProposition,
          cta: uniqueJoin(ctaCandidates, 8),
          differentiators,
          trust_signals: trustSignals,
          contact_information: uniqueJoin([...emails, ...phones], 8),
          brand_tone: brandTone,
          pages_analyzed: 1,
          pages_limit: WEBSITE_INTELLIGENCE_MAX_PAGES,
          pages: [
            {
              url: websiteUrl,
              title,
              label: "Home",
            },
          ],
          business_knowledge: {
            ...emptyBusinessKnowledge(),
            overview: about || positioning,
            products,
            services,
            contact: uniqueJoin([...emails, ...phones], 8),
          },
        };
      } catch (error) {
        return emptyResult(
          websiteUrl,
          scrapedAt,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };

export const multiPageWebsiteIntelligenceProvider: WebsiteIntelligenceProvider =
  {
    id: "multi_page_discovery",
    async extract(websiteUrl: string): Promise<HomepageIntelligence> {
      const scrapedAt = new Date().toISOString();
      const rootUrl =
        normalizeCrawlUrl(websiteUrl, websiteUrl) ?? websiteUrl.trim();

      const overallController = new AbortController();
      const overallTimeout = setTimeout(
        () => overallController.abort(),
        OVERALL_CRAWL_TIMEOUT_MS,
      );

      let crawlTimeout = false;

      try {
        const homepageFetch = await fetchHtml(
          rootUrl,
          overallController.signal,
        );
        if (!homepageFetch.ok) {
          return emptyResult(
            rootUrl,
            scrapedAt,
            homepageFetch.error,
            "multi_page_discovery",
          );
        }

        const candidates = discoverCandidatePages(
          homepageFetch.html,
          homepageFetch.finalUrl || rootUrl,
        );
        const selected = rankAndSelectPages(
          candidates,
          WEBSITE_INTELLIGENCE_MAX_PAGES,
        );

        // Ensure homepage is present even if discovery returned empty.
        if (selected.length === 0) {
          selected.push({
            url: normalizeCrawlUrl(rootUrl, rootUrl) ?? rootUrl,
            source: "homepage",
            anchorText: "Home",
          });
        }

        console.log(
          "[ATHENA_PROSPECT_GEN] website_pages_selected",
          JSON.stringify({
            event: "website_pages_selected",
            pagesSelected: selected.length,
            urls: selected.map((page) => page.url).slice(0, 10),
          }),
        );

        const extracts = await mapWithConcurrency(
          selected,
          FETCH_CONCURRENCY,
          async (candidate) => {
            if (overallController.signal.aborted) {
              crawlTimeout = true;
              return null;
            }

            // Reuse already-fetched homepage HTML when URL matches.
            const homepageNormalized =
              normalizeCrawlUrl(
                homepageFetch.finalUrl || rootUrl,
                homepageFetch.finalUrl || rootUrl,
              ) ?? rootUrl;
            const candidateNormalized =
              normalizeCrawlUrl(candidate.url, rootUrl) ?? candidate.url;

            let html = "";
            if (candidateNormalized === homepageNormalized) {
              html = homepageFetch.html;
            } else {
              const pageFetch = await fetchHtml(
                candidate.url,
                overallController.signal,
              );
              if (!pageFetch.ok) {
                return null;
              }
              html = pageFetch.html;
            }

            const label = pageDisplayLabel(candidate);
            return extractPageContent(html, candidate.url, label);
          },
          () => {
            if (overallController.signal.aborted) {
              crawlTimeout = true;
              return true;
            }
            return false;
          },
        );

        const successful = extracts.filter(
          (value): value is NonNullable<typeof value> => Boolean(value),
        );

        if (successful.length === 0) {
          return emptyResult(
            rootUrl,
            scrapedAt,
            crawlTimeout
              ? "Website crawl timed out before pages could be extracted"
              : "No pages could be extracted",
            "multi_page_discovery",
          );
        }

        const merged = mergeWebsiteKnowledge(successful);
        const pages: AnalyzedPageSummary[] = successful.map((page) => ({
          url: page.url,
          title: page.title,
          label: page.label,
        }));

        return {
          provider: "multi_page_discovery",
          url: rootUrl,
          scraped_at: scrapedAt,
          title: successful[0]?.title ?? null,
          headings: merged.headings,
          paragraphs: merged.paragraphs,
          positioning: merged.positioning,
          products: merged.products,
          services: merged.services,
          about: merged.about,
          target_audience: merged.target_audience,
          messaging: merged.messaging,
          value_proposition: merged.value_proposition,
          cta: merged.cta,
          differentiators: merged.differentiators,
          trust_signals: merged.trust_signals,
          contact_information: merged.contact_information,
          brand_tone: merged.brand_tone,
          pages_analyzed: successful.length,
          pages_limit: WEBSITE_INTELLIGENCE_MAX_PAGES,
          pages,
          business_knowledge: merged.business_knowledge,
          crawl_partial:
            crawlTimeout || successful.length < selected.length,
          crawl_timeout: crawlTimeout,
          error: crawlTimeout
            ? "Partial website learning — crawl timeout; continuing with extracted pages"
            : undefined,
        };
      } catch (error) {
        return emptyResult(
          rootUrl,
          scrapedAt,
          error instanceof Error ? error.message : String(error),
          "multi_page_discovery",
        );
      } finally {
        clearTimeout(overallTimeout);
      }
    },
  };

/**
 * Default Prospect website intelligence extract.
 * Uses multi-page discovery; callers may inject homepage_only for tests.
 */
export async function scrapeHomepageIntelligence(
  websiteUrl: string,
  provider: WebsiteIntelligenceProvider = multiPageWebsiteIntelligenceProvider,
): Promise<HomepageIntelligence> {
  return provider.extract(websiteUrl);
}
