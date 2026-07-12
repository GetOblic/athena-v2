/**
 * Homepage-only Website Intelligence provider for Prospect sources.
 *
 * Designed so a future multi-page crawler can implement the same
 * WebsiteIntelligenceProvider contract without changing Prospect orchestration.
 */

export type HomepageIntelligence = {
  provider: "homepage_only";
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
};

export type WebsiteIntelligenceProvider = {
  readonly id: string;
  extract(websiteUrl: string): Promise<HomepageIntelligence>;
};

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
): HomepageIntelligence {
  return {
    provider: "homepage_only",
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
  };
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
          [title, metaDescription, headings.split("\n")[0]].filter(Boolean) as string[],
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
          ...html.matchAll(
            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
          ),
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

export async function scrapeHomepageIntelligence(
  websiteUrl: string,
  provider: WebsiteIntelligenceProvider = homepageOnlyWebsiteIntelligenceProvider,
): Promise<HomepageIntelligence> {
  return provider.extract(websiteUrl);
}
