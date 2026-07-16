/**
 * Structured Deep Website Intelligence shape shared by Brain and Prospects.
 */

export const DEEP_WEBSITE_INTELLIGENCE_PROVIDER = "deep_v1" as const;

export type DeepCrawledPage = {
  url: string;
  title: string | null;
  page_type: string;
  excerpt: string;
};

export type DeepBusinessKnowledge = {
  positioning: string;
  about: string;
  products: string;
  services: string;
  solutions: string;
  pricing: string;
  training: string;
  faq: string;
  team: string;
  testimonials: string;
  case_studies: string;
  target_audience: string;
  messaging: string;
  value_proposition: string;
  differentiators: string;
  trust_signals: string;
  contact_information: string;
  brand_tone: string;
  cta: string;
};

export type DeepCrawlSummary = {
  pages_analyzed: number;
  services_discovered: number;
  faqs_discovered: number;
  testimonials_discovered: number;
  team_pages_discovered: number;
  commercial_pages_discovered: number;
};

export type DeepWebsiteIntelligence = {
  provider: typeof DEEP_WEBSITE_INTELLIGENCE_PROVIDER;
  url: string;
  scraped_at: string;
  pages_analyzed: number;
  pages: DeepCrawledPage[];
  business_knowledge: DeepBusinessKnowledge;
  crawl_summary: DeepCrawlSummary;
  /** Flat section mirrors for Prospect bridge / homepage-compat readers. */
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
  headings: string;
  paragraphs: string;
};

export function emptyBusinessKnowledge(): DeepBusinessKnowledge {
  return {
    positioning: "",
    about: "",
    products: "",
    services: "",
    solutions: "",
    pricing: "",
    training: "",
    faq: "",
    team: "",
    testimonials: "",
    case_studies: "",
    target_audience: "",
    messaging: "",
    value_proposition: "",
    differentiators: "",
    trust_signals: "",
    contact_information: "",
    brand_tone: "",
    cta: "",
  };
}

export function isDeepWebsiteIntelligence(
  value: unknown,
): value is DeepWebsiteIntelligence {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.provider === DEEP_WEBSITE_INTELLIGENCE_PROVIDER &&
    typeof record.url === "string" &&
    typeof record.pages_analyzed === "number" &&
    record.pages_analyzed > 0 &&
    record.business_knowledge != null &&
    typeof record.business_knowledge === "object"
  );
}

export function deepIntelligenceHasUsableContent(
  value: unknown,
): boolean {
  if (!isDeepWebsiteIntelligence(value)) return false;
  const knowledge = value.business_knowledge;
  return Object.values(knowledge).some(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  );
}

/** Compact text block for Brain compile prompt. */
export function formatDeepIntelligenceForBrainPrompt(
  intelligence: DeepWebsiteIntelligence,
): string {
  const k = intelligence.business_knowledge;
  const sections = [
    ["Positioning", k.positioning],
    ["About", k.about],
    ["Products", k.products],
    ["Services", k.services],
    ["Solutions", k.solutions],
    ["Pricing", k.pricing],
    ["Training", k.training],
    ["FAQ", k.faq],
    ["Team", k.team],
    ["Testimonials", k.testimonials],
    ["Case Studies", k.case_studies],
    ["Target Audience", k.target_audience],
    ["Messaging", k.messaging],
    ["Value Proposition", k.value_proposition],
    ["Differentiators", k.differentiators],
    ["Trust Signals", k.trust_signals],
    ["Contact", k.contact_information],
    ["Brand Tone", k.brand_tone],
    ["CTA", k.cta],
  ]
    .filter(([, text]) => typeof text === "string" && text.trim())
    .map(([label, text]) => `${label}:\n${String(text).trim()}`);

  const header = [
    `DEEP WEBSITE INTELLIGENCE (${intelligence.pages_analyzed} pages analyzed)`,
    `Root URL: ${intelligence.url}`,
  ].join("\n");

  return `${header}\n\n${sections.join("\n\n")}`.slice(0, 48_000);
}

export function flattenDeepIntelligenceForCompat(
  knowledge: DeepBusinessKnowledge,
  pages: DeepCrawledPage[],
): Omit<
  DeepWebsiteIntelligence,
  | "provider"
  | "url"
  | "scraped_at"
  | "pages_analyzed"
  | "pages"
  | "business_knowledge"
  | "crawl_summary"
> {
  return {
    positioning: knowledge.positioning,
    products: knowledge.products,
    services: knowledge.services,
    about: knowledge.about,
    target_audience: knowledge.target_audience,
    messaging: knowledge.messaging,
    value_proposition: knowledge.value_proposition,
    cta: knowledge.cta,
    differentiators: knowledge.differentiators,
    trust_signals: knowledge.trust_signals,
    contact_information: knowledge.contact_information,
    brand_tone: knowledge.brand_tone,
    headings: pages
      .map((page) => page.title)
      .filter(Boolean)
      .join("\n"),
    paragraphs: [
      knowledge.about,
      knowledge.services,
      knowledge.products,
      knowledge.positioning,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
