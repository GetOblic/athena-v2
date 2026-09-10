/**
 * Athena-generated GetOblic directory description.
 *
 * Isolated from full prospect generation, claim/release, KB sync,
 * conversion, and live website scraping.
 *
 * Never mutates prospect.raw_json.observed.description.
 */

import { generateReview } from "@/services/aiService";
import {
  GETOBLIC_DESCRIPTION_MAX_CHARS,
  parseProspectGeneratedListingDescription,
  type ProspectGeneratedListingDescription,
} from "@/services/prospects/prospectGeneratedListingDescription";
import { readImportedSourceDescription } from "@/services/prospects/prospectIntelligenceCompleteness";
import type { Prospect } from "@/services/prospects/prospectService";

export {
  GETOBLIC_DESCRIPTION_MAX_CHARS,
  parseProspectGeneratedListingDescription,
  type ProspectGeneratedListingDescription,
};

export const GETOBLIC_DESCRIPTION_DEPTH_TARGETS = {
  low: { min: 400, max: 700 },
  medium: { min: 700, max: 1100 },
  rich: { min: 900, max: 1500 },
} as const;

export type GetoblicDescriptionEvidenceBand = keyof typeof GETOBLIC_DESCRIPTION_DEPTH_TARGETS;

export type GetoblicDescriptionEvidenceAssessment = {
  band: GetoblicDescriptionEvidenceBand;
  preferredMin: number;
  preferredMax: number;
  websiteIntelligenceFieldCount: number;
  websiteIntelligenceChars: number;
  listingChars: number;
};

export const GETOBLIC_DESCRIPTION_SYSTEM_PROMPT = [
  "You are writing the public business description for a GetOblic directory listing.",
  "Write as GetOblic describing the business in finished directory editorial copy.",
  "",
  "GENERATION OBJECTIVE",
  "Create the most useful factual public directory description possible from the verified intelligence currently available for the business.",
  "This is enrichment from verified business and website intelligence, not a safer rewrite of the current GetOblic listing description.",
  "The current GetOblic listing description is ONE source. It is not the ceiling for the generated description.",
  "When stored website intelligence contains useful factual information that is not present in the current listing description, incorporate a meaningful selection of those facts.",
  "Do not remain a polished restatement of a thin listing when richer verified website intelligence is available.",
  "",
  "GENERATION METHOD — reason internally in two stages inside this same request, then return ONLY the finished description.",
  "",
  "STAGE 1 — FACT SELECTION",
  "Identify the useful, public-facing facts explicitly supported by the trusted context.",
  "Prioritize facts that help a directory visitor understand:",
  "- what the business does",
  "- specific services, products, or solutions",
  "- supported methods, processes, specialties, or differentiators",
  "- supported product or material characteristics",
  "- supported customer or audience information",
  "- location",
  "- useful operating information",
  "",
  "STAGE 2 — EDITORIAL SYNTHESIS",
  "Write one polished directory description that incorporates the important selected facts naturally.",
  "This is factual enrichment and synthesis, not a paraphrase of the listing and not a generic category-and-location line.",
  "Return only the final description. Do not expose the fact list, reasoning, stages, or source analysis.",
  "",
  "INFORMATION DENSITY",
  "The goal is not maximum length.",
  "The goal is maximum useful factual information density while remaining readable as directory copy.",
  "Every paragraph should help the visitor understand the business.",
  "Do not add generic marketing filler merely because more source intelligence exists.",
  "Do not add filler merely to increase length.",
  "",
  "FACT PRESERVATION",
  "When the trusted sources contain several useful, distinct, public-facing facts, preserve the important facts rather than compressing the description into only category, location, and one service sentence.",
  "Do not omit useful supported information merely to make the description shorter.",
  "Do not repeat facts solely to increase length.",
  "Excessive compression is a failure when the source is rich.",
  "",
  "SOURCE COVERAGE",
  "For rich verified intelligence, the generated copy should normally represent multiple factual dimensions where available.",
  "These are example dimensions, not mandatory fields:",
  "- primary services, products, or solutions",
  "- additional services",
  "- methods, processes, or specialties",
  "- product or material characteristics",
  "- customer or audience information",
  "- operating model",
  "- hours",
  "- location",
  "- factual differentiators",
  "Do not require a dimension the source does not support. Do not invent missing dimensions.",
  "",
  "ADAPTIVE DEPTH",
  "Output depth should adapt to the amount of verified intelligence available.",
  "If trusted source material is sparse, a shorter description is appropriate.",
  "If stored website intelligence is substantial, a substantially richer description is expected.",
  "Do not force every business into the same length.",
  "Soft editorial targets:",
  `- LOW information (only basic profile/listing information): approximately ${GETOBLIC_DESCRIPTION_DEPTH_TARGETS.low.min}–${GETOBLIC_DESCRIPTION_DEPTH_TARGETS.low.max} characters`,
  "- MEDIUM information (useful listing + some website intelligence): approximately 700–1,100 characters",
  "- RICH information (substantial verified website intelligence / Deep Scrape knowledge): approximately 900–1,500 characters",
  "These are soft editorial targets. Never invent, repeat, or pad information to reach them.",
  "A shorter description is valid when the evidence is thin.",
  `Never exceed ${GETOBLIC_DESCRIPTION_MAX_CHARS} characters.`,
  "",
  "DESCRIPTION STRUCTURE",
  "For richer evidence, allow approximately 2–3 compact paragraphs or 5–8 well-constructed sentences when natural.",
  "Suggested editorial progression — guidance only; do not force empty categories:",
  "1. Business identity + location + core activity",
  "2. Important services, products, or solutions",
  "3. Supported methods, specialties, or differentiators",
  "4. Relevant customer or audience information",
  "5. Useful operational information such as hours when appropriate",
  "",
  "DIRECT FACTUAL LANGUAGE",
  "Prefer direct factual statements over statements of intention, aspiration, commitment, or marketing posture.",
  "Transform supported facts into what the business does or offers.",
  "Avoid unnecessary constructions such as \"aims to\", \"strives to\", \"is committed to\", \"is dedicated to\", or \"focuses on\" when the same supported fact can be stated directly.",
  "Example principle only — do not copy this wording into generated output:",
  "Weak: \"The business aims to address stubborn stains.\"",
  "Direct: \"Cleaning services address stubborn stains and everyday wear.\"",
  "",
  "WEBSITE FACTUALITY",
  "Website-derived intelligence remains subject to the same factual discipline.",
  "Distinguish FACT from MARKETING CLAIM.",
  "Do not convert marketing positioning into an objective factual claim.",
  "Example principle only — do not copy this wording into generated output:",
  "Website says \"We are the #1 carpet cleaner in Los Angeles\" — do not automatically publish \"#1 carpet cleaner\".",
  "Website says \"We use X cleaning system\" — that may be used as a factual service or process statement if the stored intelligence supports it.",
  "",
  "PROMOTIONAL SOURCE LANGUAGE",
  "Distinguish source-supported facts from promotional wording.",
  "Promotional source language may be omitted, neutralized carefully, or included only if it remains appropriate as factual directory copy.",
  "Do not strengthen promotional wording into a stronger claim.",
  "Source-supported product language may be used when explicitly stated, but must not be expanded into certifications or specific benefits the source does not state.",
  "",
  "CUSTOMER CONSIDERATIONS",
  "Supported customer considerations may be included when the trusted source states them.",
  "If the source discusses families, pets, or similar considerations, the description may mention that the business describes its products or processes with those considerations.",
  "Do not strengthen this into an unsupported safety claim.",
  "",
  "SOURCE HIERARCHY — use this trusted evidence, in order:",
  "1. Structured business facts: name, category or industry, verified location, website, relevant business contact facts, and operating hours when provided.",
  "2. Stored website intelligence. This is a major enrichment source. Use factual stored intelligence such as about or business description, services, products, solutions, specialties, positioning, value proposition, differentiators, target audiences, customer groups, business knowledge, service or product details, supported process or method information, relevant messaging facts that describe the business, and other factual Deep Scrape knowledge already stored.",
  "3. The current GetOblic listing description. Use it as factual source and provenance, and to preserve useful facts Athena may not have elsewhere. It is not the ceiling.",
  "4. Trusted operator business facts, when independently supported. Use cautiously.",
  "",
  "WEBSITE INTELLIGENCE MUST ADD VALUE",
  "If the listing is thin and website intelligence verifies specific treatments, technologies, customer groups, consultation models, service characteristics, or supported differentiators, surface those useful facts.",
  "Do not produce a polished version of a one-line listing when richer verified website intelligence is available.",
  "If no website intelligence is available, generate from the remaining trusted sources.",
  "Do not request, assume, or invent a new website scrape.",
  "",
  "GEOGRAPHY — hard rule:",
  "Never expand geography beyond explicitly supported source data.",
  "Use the most specific supported location from the structured address, city, state, or country.",
  "Never infer a service area from city, address, region taxonomy, nearby metro, permalink, or directory hierarchy.",
  "If the sources support Woodland Hills, CA, write Woodland Hills, CA.",
  "Do not infer or repeat Los Angeles, Los Angeles area, Southern California, San Fernando Valley, or any other metro, region, or service radius unless that exact geography appears independently in trusted structured location fields.",
  "Do not treat directory region taxonomy or promotional nearby-area language in listing copy as a license to expand geography.",
  "Do not infer a service radius from a business address.",
  "",
  "WRITING:",
  "Write one cohesive editorial description, not a sequence of independently generated facts.",
  "Combine closely related facts. Vary sentence openings. Use natural transitions sparingly.",
  "Avoid repeating the subject unnecessarily. Avoid one-fact-per-sentence monotony and formulaic AI cadence.",
  "Use specific factual service language where available.",
  "Write for a prospective customer in a confident, non-promotional editorial tone.",
  "Use the business name naturally, usually once in the opening sentence and no more than 2 times in a normal description unless clarity genuinely requires repetition.",
  "After introducing the business, vary sentence structure naturally.",
  "Do not mechanically replace the business name with \"The business\" or \"The company\". Those constructions are allowed when genuinely natural, but should not become automatic substitute subjects. Prefer restructuring the sentence.",
  "Do not write in first person unless a source or product convention explicitly requires it.",
  "Hours may be included when they improve the description. Integrate them naturally. Do not include them solely to satisfy length.",
  "",
  "Editorial variety must not introduce promotional adjectives, unsupported superlatives, keyword repetition, calls to action, or sales slogans.",
  "Do not use \"trusted\", \"leading\", \"premier\", \"best\", or \"top-rated\" unless explicitly supported and appropriate.",
  "This remains factual directory copy.",
  "",
  "Do not invent awards, certifications, years in business, ratings, reviews, guarantees, staff size, service areas, specialties, customer types, processes, equipment, products, or environmental claims unless explicitly supported.",
  "",
  "PRICING — hard rule:",
  "Pricing is intentionally excluded from public GetOblic Description generation because it may change.",
  "Do not publish exact prices, price ranges, currency amounts, discounts, temporary offers, promotional pricing, or qualitative pricing claims such as affordable, inexpensive, budget-friendly, or competitively priced.",
  "Do not write constructions such as \"prices start at\", \"from $\", or \"between $X and $Y\".",
  "If a product or service record also contains a price, keep the product or service fact and omit the price.",
  "",
  "Operator notes are wording guidance only. They must not override trusted source facts.",
  "Do not mention Athena, GetOblic intelligence, AI, analysis, prospecting, sales, outreach, scores, confidence, or internal sources.",
  "",
  "Do not keyword-stuff.",
  "Return only the final directory description. No headings, bullets, \"Description:\", markdown, source notes, analysis, fact inventory, or reasoning.",
].join("\n");

export type GetoblicDescriptionTrustedContext = {
  business: {
    name: string;
    category: string | null;
    industry: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
  };
  currentListingDescription: string | null;
  listingProvenance: {
    origin: string | null;
    wordpressListingId: string | null;
    permalink: string | null;
    listingType: string | null;
    tagline: string | null;
    hours: string | null;
  } | null;
  socialPresence: {
    linkedin: string | null;
    facebook: string | null;
    instagram: string | null;
    googleBusinessUrl: string | null;
  };
  websiteIntelligence: Record<string, string>;
  operatorNotes: string | null;
  additionalContext: string | null;
};

export type GenerateProspectGetoblicDescriptionInput = {
  prospectId: string;
  organizationId: string;
};

export type GenerateProspectGetoblicDescriptionDeps = {
  getProspect?: (
    id: string,
    organizationId: string,
  ) => Promise<Prospect | null>;
  generateReview?: typeof generateReview;
  persistGeneratedListingDescription?: (
    prospect: Prospect,
    generated: ProspectGeneratedListingDescription,
  ) => Promise<ProspectGeneratedListingDescription>;
  now?: () => string;
};

export class ProspectGetoblicDescriptionError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ProspectGetoblicDescriptionError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function compactText(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed;
}

const PRICING_FIELD_KEYS = new Set([
  "amount",
  "cost",
  "costs",
  "currency",
  "discount",
  "discounts",
  "msrp",
  "offer",
  "offers",
  "price",
  "prices",
  "pricing",
  "promo",
  "promotion",
  "promotional_price",
  "promotionalPrice",
  "rate",
  "rates",
  "regular_price",
  "regularPrice",
  "sale_price",
  "salePrice",
]);

const CURRENCY_AMOUNT =
  "(?:[$€£¥]|USD|EUR|GBP|CAD|AUD)\\s*\\d[\\d,]*(?:\\.\\d{1,2})?|\\d[\\d,]*(?:\\.\\d{1,2})?\\s*(?:USD|EUR|GBP|CAD|AUD|[$€£¥])";

function tidyStrippedCopy(text: string): string {
  return text
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*[-–—:/]\s*(?=[,.;)]|$)/g, "")
    .replace(/\s+[-–—]\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/([,;:]){2,}/g, "$1")
    .replace(/^[,;:\s-–—]+|[,\s;:\-–—]+$/g, "")
    .trim();
}

/** Strip volatile price facts while preserving product/service names and other copy. */
export function stripVolatilePricing(value: string): string {
  let next = String(value ?? "");
  if (!next.trim()) return "";

  next = next.replace(
    new RegExp(
      `\\b(?:with\\s+)?(?:prices?|pricing|costs?|rates?)\\s+(?:ranging\\s+from|range(?:s)?\\s+from|start(?:ing)?\\s+at|from|between)\\s+(?:${CURRENCY_AMOUNT})(?:\\s*(?:to|-|–|—|and)\\s*(?:${CURRENCY_AMOUNT}))?`,
      "gi",
    ),
    " ",
  );
  next = next.replace(
    new RegExp(
      `\\b(?:from|between)\\s+(?:${CURRENCY_AMOUNT})(?:\\s*(?:to|-|–|—|and)\\s*(?:${CURRENCY_AMOUNT}))`,
      "gi",
    ),
    " ",
  );
  next = next.replace(
    new RegExp(`\\s*(?:for|at|only|from)\\s+(?:${CURRENCY_AMOUNT})\\b`, "gi"),
    " ",
  );
  next = next.replace(
    new RegExp(`\\s*(?:—|--|-|–|:)\\s*(?:${CURRENCY_AMOUNT})\\b`, "gi"),
    " ",
  );
  next = next.replace(new RegExp(CURRENCY_AMOUNT, "gi"), " ");
  next = next.replace(/\b\d+\s*%\s*off\b/gi, " ");
  next = next.replace(
    /\b(?:(?:save|saved)\s+\d+|discount(?:ed)?(?:\s+price)?|promotional\s+pricing|sale\s+price|special\s+offer|limited[-\s]time\s+offer)\b/gi,
    " ",
  );
  next = next.replace(
    /\b(?:affordable|inexpensive|budget(?:-|\s)friendly|competitively\s+priced|reasonably\s+priced)\b/gi,
    " ",
  );

  return tidyStrippedCopy(next);
}

function compactPublicCopy(value: unknown, max = 2000): string | null {
  const text = compactText(value, max);
  if (!text) return null;
  const stripped = compactText(stripVolatilePricing(text), max);
  return stripped;
}

function publicLabelFromRecord(record: Record<string, unknown>): string | null {
  const preferred =
    record.name ?? record.title ?? record.label ?? record.product ?? record.service;
  const fromPreferred = compactPublicCopy(preferred, 160);
  if (fromPreferred) return fromPreferred;

  const leftovers = Object.entries(record)
    .filter(([key]) => !PRICING_FIELD_KEYS.has(key) && !PRICING_FIELD_KEYS.has(key.toLowerCase()))
    .map(([, field]) => (typeof field === "string" ? compactPublicCopy(field, 160) : null))
    .filter((item): item is string => Boolean(item));
  if (leftovers.length === 0) return null;
  return compactPublicCopy(leftovers.join(", "), 160);
}

function compactList(value: unknown, max = 800): string | null {
  if (typeof value === "string") return compactPublicCopy(value, max);
  if (!Array.isArray(value)) return null;
  const parts = value
    .map((item) => {
      if (typeof item === "string") return compactPublicCopy(item, 160);
      const record = asRecord(item);
      return record ? publicLabelFromRecord(record) : null;
    })
    .filter((item): item is string => Boolean(item));
  if (parts.length === 0) return null;
  return compactPublicCopy(parts.join(", "), max);
}

export function readObservedListingDescription(
  rawJson?: Record<string, unknown> | null,
): string | null {
  const observed = asRecord(asRecord(rawJson)?.observed);
  return compactText(observed?.description, GETOBLIC_DESCRIPTION_MAX_CHARS);
}

const WEBSITE_INTELLIGENCE_KEYS = [
  "about",
  "services",
  "products",
  "solutions",
  "specialties",
  "positioning",
  "value_proposition",
  "differentiators",
  "target_audience",
  "customer_groups",
  "messaging",
  "process",
  "methods",
  "categories",
] as const;

const WEBSITE_INTELLIGENCE_LIST_KEYS = new Set([
  "categories",
  "services",
  "products",
  "solutions",
  "specialties",
  "customer_groups",
  "methods",
]);

const BUSINESS_KNOWLEDGE_KEYS = [
  "about",
  "services",
  "products",
  "solutions",
  "specialties",
  "positioning",
  "value_proposition",
  "differentiators",
  "target_audience",
  "customer_groups",
  "messaging",
  "process",
  "methods",
] as const;

const LISTING_PLACEHOLDER_TEXT =
  /^(your(?:\s+business)?\s+tagline(?:\s+here)?|your\s+service|your\s+value|your\s+difference|lorem ipsum|placeholder|n\/a|tbd)$/i;

function isUsablePublicListingText(value: string | null): value is string {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(normalized) && !LISTING_PLACEHOLDER_TEXT.test(normalized);
}

export function extractUsableWebsiteIntelligence(
  websiteIntelligence?: Record<string, unknown> | null,
): Record<string, string> {
  const source = asRecord(websiteIntelligence);
  if (!source) return {};

  const extracted: Record<string, string> = {};

  for (const key of WEBSITE_INTELLIGENCE_KEYS) {
    if (PRICING_FIELD_KEYS.has(key)) continue;
    const value = WEBSITE_INTELLIGENCE_LIST_KEYS.has(key)
      ? compactList(source[key], 1600)
      : compactPublicCopy(source[key], 1600);
    if (value) extracted[key] = value;
  }

  const knowledge = asRecord(source.business_knowledge);
  if (knowledge) {
    const knowledgeParts: string[] = [];
    for (const key of BUSINESS_KNOWLEDGE_KEYS) {
      if (PRICING_FIELD_KEYS.has(key)) continue;
      const value = WEBSITE_INTELLIGENCE_LIST_KEYS.has(key)
        ? compactList(knowledge[key], 1200)
        : compactPublicCopy(knowledge[key], 1200);
      if (value) knowledgeParts.push(`${key}: ${value}`);
    }
    if (knowledgeParts.length > 0) {
      extracted.business_knowledge = knowledgeParts.join("\n");
    }
  }

  return extracted;
}

export function classifyGetoblicDescriptionEvidence(
  context: Pick<
    GetoblicDescriptionTrustedContext,
    "currentListingDescription" | "websiteIntelligence"
  >,
): GetoblicDescriptionEvidenceAssessment {
  const websiteIntelligenceChars = Object.values(context.websiteIntelligence).reduce(
    (total, value) => total + value.length,
    0,
  );
  const websiteIntelligenceFieldCount = Object.keys(context.websiteIntelligence).length;
  const listingChars = context.currentListingDescription?.length ?? 0;
  const hasBusinessKnowledge = Boolean(context.websiteIntelligence.business_knowledge);
  const substantialWebsiteIntelligence =
    websiteIntelligenceChars >= 400 &&
    (websiteIntelligenceFieldCount >= 4 ||
      (hasBusinessKnowledge && websiteIntelligenceFieldCount >= 3));
  const someWebsiteIntelligence = websiteIntelligenceChars >= 80;
  const usefulListing = listingChars >= 200;

  const band: GetoblicDescriptionEvidenceBand = substantialWebsiteIntelligence
    ? "rich"
    : someWebsiteIntelligence || usefulListing
      ? "medium"
      : "low";
  const target = GETOBLIC_DESCRIPTION_DEPTH_TARGETS[band];

  return {
    band,
    preferredMin: target.min,
    preferredMax: target.max,
    websiteIntelligenceFieldCount,
    websiteIntelligenceChars,
    listingChars,
  };
}

function extractListingProvenance(
  rawJson?: Record<string, unknown> | null,
): GetoblicDescriptionTrustedContext["listingProvenance"] {
  const root = asRecord(rawJson);
  if (!root) return null;
  const observed = asRecord(root.observed);
  const origin = compactText(root.origin, 120);
  const listingId = compactText(
    root.wordpress_listing_id ?? observed?.wordpress_listing_id,
    80,
  );
  const permalink = compactText(observed?.permalink ?? root.permalink, 400);
  const listingType = compactText(observed?.listing_type, 120);
  const taglineRaw = compactPublicCopy(observed?.tagline, 240);
  const tagline = isUsablePublicListingText(taglineRaw) ? taglineRaw : null;
  const hours = compactText(observed?.text_hours, 400);
  if (!origin && !listingId && !permalink && !listingType && !tagline && !hours) {
    return null;
  }
  return {
    origin,
    wordpressListingId: listingId,
    permalink,
    listingType,
    tagline,
    hours,
  };
}

export function buildGetoblicDescriptionContext(
  prospect: Pick<
    Prospect,
    | "business_name"
    | "category"
    | "industry"
    | "website"
    | "address"
    | "city"
    | "state"
    | "country"
    | "phone"
    | "email"
    | "linkedin"
    | "facebook"
    | "instagram"
    | "google_business_url"
    | "notes"
    | "additional_context"
    | "website_intelligence"
    | "raw_json"
    | "opportunity_score"
  >,
): GetoblicDescriptionTrustedContext {
  return {
    business: {
      name: prospect.business_name.trim(),
      category: compactText(prospect.category, 160),
      industry: compactText(prospect.industry, 160),
      website: compactText(prospect.website, 400),
      address: compactText(prospect.address, 240),
      city: compactText(prospect.city, 120),
      state: compactText(prospect.state, 120),
      country: compactText(prospect.country, 120),
      phone: compactText(prospect.phone, 80),
      email: compactText(prospect.email, 160),
    },
    currentListingDescription: compactPublicCopy(
      readObservedListingDescription(prospect.raw_json) ??
        readImportedSourceDescription(prospect.raw_json),
      GETOBLIC_DESCRIPTION_MAX_CHARS,
    ),
    listingProvenance: extractListingProvenance(prospect.raw_json),
    socialPresence: {
      linkedin: compactText(prospect.linkedin, 400),
      facebook: compactText(prospect.facebook, 400),
      instagram: compactText(prospect.instagram, 400),
      googleBusinessUrl: compactText(prospect.google_business_url, 400),
    },
    websiteIntelligence: extractUsableWebsiteIntelligence(
      prospect.website_intelligence,
    ),
    operatorNotes: compactPublicCopy(prospect.notes, 1200),
    additionalContext: compactPublicCopy(prospect.additional_context, 1200),
  };
}

function formatOptionalBlock(
  title: string,
  lines: Array<[string, string | null | undefined]>,
): string {
  const body = lines
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([label, value]) => `- ${label}: ${value!.trim()}`)
    .join("\n");
  if (!body) return "";
  return `${title}\n${body}`;
}

export function formatGetoblicDescriptionUserPrompt(
  context: GetoblicDescriptionTrustedContext,
): string {
  const location = [context.business.city, context.business.state, context.business.country]
    .filter(Boolean)
    .join(", ");
  const evidence = classifyGetoblicDescriptionEvidence(context);
  const depthLabel = evidence.band.toUpperCase();

  const sections = [
    [
      "Create the most useful factual public GetOblic directory description from the verified intelligence below.",
      "This is enrichment from verified business and website intelligence, not a rewrite of the current listing description.",
      "Internally select the useful supported facts, then write editorial synthesis. Return only the finished description.",
      "The current GetOblic listing description is one factual source and provenance. It is not the ceiling.",
      "When stored website intelligence contains useful facts that are not in the current listing, incorporate a meaningful selection of those facts.",
      "Preserve important supported facts. Represent multiple factual dimensions when the intelligence is rich. Do not compress rich website intelligence into category, location, and one service sentence.",
      `Evidence available for this business is ${depthLabel}. Soft editorial target: approximately ${evidence.preferredMin}–${evidence.preferredMax} characters. Never invent, repeat, or pad to reach it.`,
      "The goal is maximum useful factual information density, not maximum length.",
      "Use the business name naturally, usually once in the opening sentence and no more than twice unless clarity requires it. After introducing the business, vary sentence openings; do not repeat the business name as the subject of every sentence.",
      "Prefer restructuring sentences over mechanically substituting The business or The company as the subject.",
      "For richer evidence, allow about 2–3 compact paragraphs or 5–8 well-constructed sentences when natural. Do not force empty categories.",
      "Prefer direct factual language. State what the business does or offers, not what it aims, strives, or is committed to do.",
      "Distinguish FACT from MARKETING CLAIM. Do not automatically publish ranking or #1 claims from website positioning.",
      "Pricing is intentionally excluded because it may change. Do not include prices, price ranges, discounts, or qualitative pricing claims.",
      "Hours may be included when they improve the description; integrate them naturally rather than appending them to pad length.",
      "Do not expand geography beyond the structured address, city, state, and country. Never infer a service area from city, address, region taxonomy, nearby metro, permalink, or directory hierarchy.",
      "Do not scrape or request new website intelligence. Use only the stored sources below.",
    ].join("\n"),
    formatOptionalBlock("Structured business facts:", [
      ["Name", context.business.name],
      ["Category", context.business.category],
      ["Industry", context.business.industry],
      ["Location", location || null],
      ["Address", context.business.address],
      ["Website", context.business.website],
      ["Phone", context.business.phone],
      ["Email", context.business.email],
      ["Hours", context.listingProvenance?.hours ?? null],
    ]),
    formatOptionalBlock(
      "Stored website intelligence (major enrichment source; use useful facts not already in the listing):",
      Object.entries(context.websiteIntelligence).map(([key, value]) => [
        key,
        value,
      ]),
    ),
    `Current GetOblic listing description (factual source/provenance; not the ceiling):\n${
      context.currentListingDescription ?? "None available"
    }`,
    formatOptionalBlock("GetOblic listing facts:", [
      ["Origin", context.listingProvenance?.origin ?? null],
      ["Listing id", context.listingProvenance?.wordpressListingId ?? null],
      ["Permalink", context.listingProvenance?.permalink ?? null],
      ["Listing type", context.listingProvenance?.listingType ?? null],
      ["Tagline", context.listingProvenance?.tagline ?? null],
      ["Hours", context.listingProvenance?.hours ?? null],
    ]),
    formatOptionalBlock("Social / Google Business presence (evidence of presence only):", [
      ["LinkedIn", context.socialPresence.linkedin],
      ["Facebook", context.socialPresence.facebook],
      ["Instagram", context.socialPresence.instagram],
      ["Google Business", context.socialPresence.googleBusinessUrl],
    ]),
    formatOptionalBlock("Operator guidance (wording only; do not override trusted source facts):", [
      ["Operator notes", context.operatorNotes],
      ["Additional operator context", context.additionalContext],
    ]),
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function sanitizeGeneratedListingDescription(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/^```(?:[a-z]+)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  } else {
    text = text.replace(/^```(?:[a-z]+)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  text = text.replace(/^(?:final\s+)?(?:directory\s+)?description\s*:\s*/i, "").trim();
  return text.replace(/\s+\n/g, "\n").trim();
}

export function validateGeneratedListingDescription(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ProspectGetoblicDescriptionError(
      "INVALID_OUTPUT",
      "Athena returned an unusable GetOblic description.",
      502,
    );
  }

  const sanitized = sanitizeGeneratedListingDescription(raw);
  if (!sanitized) {
    throw new ProspectGetoblicDescriptionError(
      "INVALID_OUTPUT",
      "Athena returned an empty GetOblic description.",
      502,
    );
  }

  return sanitized.length > GETOBLIC_DESCRIPTION_MAX_CHARS
    ? sanitized.slice(0, GETOBLIC_DESCRIPTION_MAX_CHARS).trim()
    : sanitized;
}

async function defaultGetProspect(
  id: string,
  organizationId: string,
): Promise<Prospect | null> {
  const { getProspectById } = await import("@/services/prospects/prospectService");
  return getProspectById(id, organizationId);
}

export async function persistGeneratedListingDescription(
  prospect: Pick<Prospect, "id" | "organization_id">,
  generated: ProspectGeneratedListingDescription,
): Promise<ProspectGeneratedListingDescription> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin
    .from("prospects")
    .update({
      generated_listing_description: generated,
      updated_at: generated.generatedAt,
    })
    .eq("id", prospect.id)
    .eq("organization_id", prospect.organization_id)
    .select("generated_listing_description")
    .single();

  if (error || !data) {
    throw new ProspectGetoblicDescriptionError(
      "PERSIST_FAILED",
      "Athena could not save the GetOblic description.",
      500,
    );
  }

  const saved = parseProspectGeneratedListingDescription(
    (data as { generated_listing_description?: unknown }).generated_listing_description,
  );
  if (!saved) {
    throw new ProspectGetoblicDescriptionError(
      "PERSIST_FAILED",
      "Athena could not save the GetOblic description.",
      500,
    );
  }

  return saved;
}

export async function generateProspectGetoblicDescription(
  input: GenerateProspectGetoblicDescriptionInput,
  deps: GenerateProspectGetoblicDescriptionDeps = {},
): Promise<ProspectGeneratedListingDescription> {
  const loadProspect = deps.getProspect ?? defaultGetProspect;
  const generate = deps.generateReview ?? generateReview;
  const persist =
    deps.persistGeneratedListingDescription ?? persistGeneratedListingDescription;
  const now = deps.now ?? (() => new Date().toISOString());

  const prospect = await loadProspect(input.prospectId, input.organizationId);
  if (!prospect) {
    throw new ProspectGetoblicDescriptionError(
      "NOT_FOUND",
      "Prospect not found.",
      404,
    );
  }

  const context = buildGetoblicDescriptionContext(prospect);
  const userPrompt = formatGetoblicDescriptionUserPrompt(context);

  let rawOutput: string;
  try {
    rawOutput = await generate(userPrompt, {
      systemPrompt: GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      generationKind: "generic_review",
      athenaStage: "generic_review",
      stage: "prospect.getoblic_description",
      promptSource: "services/prospects/prospectGetoblicDescription.ts",
    });
  } catch (error) {
    if (error instanceof ProspectGetoblicDescriptionError) throw error;
    throw new ProspectGetoblicDescriptionError(
      "GENERATION_FAILED",
      "Athena could not generate this GetOblic description.",
      502,
    );
  }

  const description = validateGeneratedListingDescription(rawOutput);
  const generated: ProspectGeneratedListingDescription = {
    description,
    generatedAt: now(),
  };

  return persist(prospect, generated);
}
