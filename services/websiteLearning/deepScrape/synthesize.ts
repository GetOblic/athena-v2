/**
 * Gemini 2.5 Flash synthesis of Deep Website Intelligence.
 */

import { generateReview } from "@/services/aiService";
import {
  type DeepBusinessKnowledge,
  type DeepCrawlSummary,
  type DeepWebsiteIntelligence,
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  emptyBusinessKnowledge,
  flattenDeepIntelligenceForCompat,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { toCompactDeepCrawledPages } from "@/services/websiteLearning/deepScrape/deepScrapePageContract";

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

export function buildDeepSynthesisPrompt(input: {
  rootUrl: string;
  pages: Array<{
    url: string;
    title: string | null;
    pageType: string;
    text: string;
  }>;
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
  pages: Array<{
    url: string;
    title: string | null;
    pageType: string;
    text: string;
  }>;
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

  const pageRecords = toCompactDeepCrawledPages(input.pages);
  const flat = flattenDeepIntelligenceForCompat(knowledge, pageRecords);

  // Build payload without trailing spreads that could overwrite `pages`.
  const intelligence: DeepWebsiteIntelligence = {
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    url: input.rootUrl,
    scraped_at: new Date().toISOString(),
    pages_analyzed: pageRecords.length,
    pages: pageRecords,
    business_knowledge: knowledge,
    crawl_summary: {
      ...input.crawlSummary,
      pages_analyzed: pageRecords.length,
    },
    positioning: flat.positioning,
    products: flat.products,
    services: flat.services,
    about: flat.about,
    target_audience: flat.target_audience,
    messaging: flat.messaging,
    value_proposition: flat.value_proposition,
    cta: flat.cta,
    differentiators: flat.differentiators,
    trust_signals: flat.trust_signals,
    contact_information: flat.contact_information,
    brand_tone: flat.brand_tone,
    headings: flat.headings,
    paragraphs: flat.paragraphs,
  };

  return intelligence;
}
