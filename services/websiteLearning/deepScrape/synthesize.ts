/**
 * Gemini 2.5 Flash synthesis of Deep Website Intelligence.
 */

import { generateReview } from "@/services/aiService";
import {
  type DeepBusinessKnowledge,
  type DeepCrawledPage,
  type DeepCrawlSummary,
  type DeepWebsiteIntelligence,
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
  flattenDeepIntelligenceForCompat,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mergeKnowledge(
  parsed: Record<string, unknown>,
): DeepBusinessKnowledge {
  const base = emptyBusinessKnowledge();
  for (const key of Object.keys(base) as Array<keyof DeepBusinessKnowledge>) {
    base[key] = asString(parsed[key]);
  }
  return base;
}

type SynthesisPageRecord = {
  url: string;
  title: string | null;
  pageType: string;
  text: string;
  metaDescription?: string | null;
  headingEntries?: Array<{ level: number; text: string }>;
  declaredCanonicalUrl?: string | null;
  selfCanonical?: boolean;
  httpStatus?: number;
  redirectCount?: number;
  htmlLanguage?: string | null;
  contentChars?: number;
  schemaSummary?: { types: string[]; rawJsonLdCount: number } | null;
  internalLinkCount?: number;
  internalLinksSample?: Array<{
    url: string;
    anchor: string | null;
    provenance: string | null;
  }>;
  robotsMeta?: string | null;
  imageAltCoverage?: {
    total: number;
    withAlt: number;
    missingAlt: number;
  } | null;
  hreflangAlternates?: Array<{ hreflang: string; href: string }>;
};

/** Map crawl synthesis pages to persisted DeepCrawledPage records (additive technical fields). */
export function mapSynthesisPagesToDeepCrawledPages(
  pages: SynthesisPageRecord[],
): DeepCrawledPage[] {
  return pages.map((page) => {
    const record: DeepCrawledPage = {
      url: page.url,
      title: page.title,
      page_type: page.pageType,
      excerpt: page.text.slice(0, 400),
    };

    if (page.metaDescription !== undefined) {
      record.meta_description = page.metaDescription;
    }
    if (page.headingEntries && page.headingEntries.length > 0) {
      record.headings = page.headingEntries.map((entry) => ({
        level: entry.level,
        text: entry.text,
      }));
    }
    if (page.declaredCanonicalUrl !== undefined) {
      record.canonical_url = page.declaredCanonicalUrl;
    }
    if (typeof page.selfCanonical === "boolean") {
      record.self_canonical = page.selfCanonical;
    }
    if (typeof page.httpStatus === "number") {
      record.http_status = page.httpStatus;
    }
    if (typeof page.redirectCount === "number") {
      record.redirect_count = page.redirectCount;
    }
    if (page.htmlLanguage !== undefined) {
      record.html_language = page.htmlLanguage;
    }
    if (typeof page.contentChars === "number") {
      record.content_chars = page.contentChars;
    }
    if (page.schemaSummary) {
      record.schema_summary = {
        types: page.schemaSummary.types,
        raw_json_ld_count: page.schemaSummary.rawJsonLdCount,
      };
    }
    if (typeof page.internalLinkCount === "number") {
      record.internal_link_count = page.internalLinkCount;
    }
    if (page.internalLinksSample && page.internalLinksSample.length > 0) {
      record.internal_links_sample = page.internalLinksSample.map((link) => ({
        url: link.url,
        anchor: link.anchor,
        provenance: link.provenance,
      }));
    }
    if (page.robotsMeta !== undefined) {
      record.robots_meta = page.robotsMeta;
    }
    if (page.imageAltCoverage) {
      record.image_alt = {
        total: page.imageAltCoverage.total,
        with_alt: page.imageAltCoverage.withAlt,
        missing_alt: page.imageAltCoverage.missingAlt,
      };
    }
    if (page.hreflangAlternates && page.hreflangAlternates.length > 0) {
      record.hreflang = page.hreflangAlternates.map((entry) => ({
        hreflang: entry.hreflang,
        href: entry.href,
      }));
    }

    return record;
  });
}

export function buildDeepSynthesisPrompt(input: {
  rootUrl: string;
  pages: SynthesisPageRecord[];
}): string {
  const pageBlocks = input.pages
    .map((page, index) => {
      return [
        `PAGE ${index + 1}`,
        `URL: ${page.url}`,
        `TYPE: ${page.pageType}`,
        `TITLE: ${page.title ?? ""}`,
        `CONTENT:`,
        page.text.slice(0, 6_000),
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return `
You are Athena's website intelligence synthesizer.

Given crawled pages from ONE business website, extract structured business knowledge.
Do not invent facts. If unknown, use an empty string.
Prefer concrete offers, audiences, differentiators, and commercial language.

Return ONLY valid JSON with exactly these string fields:
{
  "positioning": "",
  "about": "",
  "products": "",
  "services": "",
  "solutions": "",
  "pricing": "",
  "training": "",
  "faq": "",
  "team": "",
  "testimonials": "",
  "case_studies": "",
  "target_audience": "",
  "messaging": "",
  "value_proposition": "",
  "differentiators": "",
  "trust_signals": "",
  "contact_information": "",
  "brand_tone": "",
  "cta": ""
}

ROOT URL:
${input.rootUrl}

CRAWLED PAGES:
${pageBlocks}
`.trim();
}

export async function synthesizeDeepWebsiteIntelligence(input: {
  rootUrl: string;
  pages: SynthesisPageRecord[];
  crawlSummary: DeepCrawlSummary;
}): Promise<DeepWebsiteIntelligence> {
  if (input.pages.length === 0) {
    throw new Error("INSUFFICIENT_USEFUL_CONTENT");
  }

  const prompt = buildDeepSynthesisPrompt({
    rootUrl: input.rootUrl,
    pages: input.pages,
  });

  const raw = await generateReview(prompt, {
    stage: "deep_scrape.synthesize",
    promptSource: "services/websiteLearning/deepScrape/synthesize.ts",
    generationKind: "identity_profile",
    athenaStage: "identity_profile",
    reasoningProfile: "FAST",
  });

  let knowledge: DeepBusinessKnowledge;
  try {
    knowledge = mergeKnowledge(parseJsonObject(raw));
  } catch {
    throw new Error("SYNTHESIS_PARSE_FAILED");
  }

  const usable = Object.values(knowledge).some((value) => value.trim().length > 0);
  if (!usable) {
    throw new Error("INSUFFICIENT_USEFUL_CONTENT");
  }

  const pageRecords = mapSynthesisPagesToDeepCrawledPages(input.pages);

  const flat = flattenDeepIntelligenceForCompat(knowledge, pageRecords);

  return {
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: input.rootUrl,
    scraped_at: new Date().toISOString(),
    pages_analyzed: input.pages.length,
    pages: pageRecords,
    business_knowledge: knowledge,
    crawl_summary: input.crawlSummary,
    ...flat,
  };
}
