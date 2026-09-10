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
import type { Prospect } from "@/services/prospects/prospectService";
import type { HomepageIntelligence } from "@/services/prospects/prospectWebsiteIntelligence";

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
};

export const GETOBLIC_DESCRIPTION_SYSTEM_PROMPT = [
  "You are writing the public business description for a GetOblic directory listing.",
  "Write as GetOblic describing the business in finished directory editorial copy.",
  "Return only the finished customer-facing description.",
  "",
  "GENERATION OBJECTIVE",
  "Create the most useful factual public directory description possible from stored Website Intelligence only.",
  "Stored Website Intelligence is the sole descriptive evidence source.",
  "Do not use, rewrite, compare against, or fall back to any current or imported GetOblic listing description.",
  "Do not treat listing copy, listing facts, operator notes, contact details, social links, or category or industry labels as evidence.",
  "",
  "IDENTITY ANCHORS",
  "The business name and verified city, state, and country identify who and where the business is.",
  "They are not descriptive evidence.",
  "Do not use identity anchors to establish or imply services, products, category, industry, operating hours, specialties, customer types, methods, materials, claims, differentiators, or service area.",
  "If Website Intelligence does not independently support a descriptive fact, do not include it.",
  "",
  "INFORMATION DENSITY",
  "The goal is not maximum length.",
  "The goal is maximum useful factual information density while remaining readable as directory copy.",
  "Every paragraph should help the visitor understand the business.",
  "Do not add generic marketing filler merely because more source intelligence exists.",
  "Do not add filler merely to increase length.",
  "",
  "FACT PRESERVATION",
  "When Website Intelligence contains several useful, distinct, public-facing facts, preserve the important facts rather than compressing the description into only location and one service sentence.",
  "Do not omit useful supported information merely to make the description shorter.",
  "Do not repeat facts solely to increase length.",
  "Excessive compression is a failure when the source is rich.",
  "",
  "SOURCE COVERAGE",
  "For rich Website Intelligence, the generated copy should normally represent multiple factual dimensions where available.",
  "These are example dimensions, not mandatory fields:",
  "- primary services, products, or solutions",
  "- additional services",
  "- methods, processes, or specialties",
  "- product or material characteristics",
  "- customer or audience information",
  "- operating model",
  "- factual differentiators",
  "Do not require a dimension Website Intelligence does not support. Do not invent missing dimensions.",
  "",
  "ADAPTIVE DEPTH",
  "Output depth should adapt to the amount of usable stored Website Intelligence available.",
  "If Website Intelligence is sparse, a shorter description is appropriate.",
  "If stored website intelligence is substantial, a substantially richer description is expected.",
  "Do not force every business into the same length.",
  "Soft editorial targets:",
  `- LOW information (limited usable Website Intelligence): approximately ${GETOBLIC_DESCRIPTION_DEPTH_TARGETS.low.min}–${GETOBLIC_DESCRIPTION_DEPTH_TARGETS.low.max} characters`,
  "- MEDIUM information (useful Website Intelligence): approximately 700–1,100 characters",
  "- RICH information (substantial stored Website Intelligence / Deep Scrape knowledge): approximately 900–1,500 characters",
  "These are soft editorial targets. Never invent, repeat, or pad information to reach them.",
  "A shorter description is valid when the evidence is thin.",
  `Never exceed ${GETOBLIC_DESCRIPTION_MAX_CHARS} characters.`,
  "",
  "DESCRIPTION STRUCTURE",
  "For richer evidence, allow approximately 2–3 compact paragraphs or 5–8 well-constructed sentences when natural.",
  "Suggested editorial progression — guidance only; do not force empty categories:",
  "1. Business identity + location + core activity supported by Website Intelligence",
  "2. Important services, products, or solutions",
  "3. Supported methods, specialties, or differentiators",
  "4. Relevant customer or audience information",
  "5. Useful operational information only when Website Intelligence supports it",
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
  "Supported customer considerations may be included when Website Intelligence states them.",
  "If Website Intelligence discusses families, pets, or similar considerations, the description may mention that the business describes its products or processes with those considerations.",
  "Do not strengthen this into an unsupported safety claim.",
  "",
  "WEBSITE INTELLIGENCE ONLY",
  "Use factual stored Website Intelligence such as about or business description, services, products, solutions, specialties, positioning, value proposition, differentiators, target audiences, customer groups, business knowledge, service or product details, supported process or method information, relevant messaging facts that describe the business, and other factual Deep Scrape knowledge already stored.",
  "Do not request, assume, or invent a new website scrape.",
  "If a descriptive fact is not present in Website Intelligence, omit it.",
  "",
  "GEOGRAPHY — hard rule:",
  "Never expand geography beyond the identity city, state, and country, or a more specific place Website Intelligence independently states.",
  "Never infer a service area from city, address, region taxonomy, nearby metro, permalink, or directory hierarchy.",
  "If the identity supports Woodland Hills, CA, write Woodland Hills, CA.",
  "Do not infer or repeat Los Angeles, Los Angeles area, Southern California, San Fernando Valley, or any other metro, region, or service radius unless that exact geography appears independently in Website Intelligence or the identity city, state, or country.",
  "Do not infer a service radius from a business address.",
  "",
  "WRITING:",
  "Write one cohesive editorial description, not a sequence of independently generated facts.",
  "Combine closely related facts. Vary sentence openings. Use natural transitions sparingly.",
  "Avoid repeating the subject unnecessarily. Avoid one-fact-per-sentence monotony and formulaic AI cadence.",
  "Use specific factual service language where Website Intelligence supports it.",
  "Write for a prospective customer in a confident, non-promotional editorial tone.",
  "Use the business name naturally, usually once in the opening sentence and no more than 2 times in a normal description unless clarity genuinely requires repetition.",
  "After introducing the business, vary sentence structure naturally.",
  "Do not mechanically replace the business name with \"The business\" or \"The company\". Those constructions are allowed when genuinely natural, but should not become automatic substitute subjects. Prefer restructuring the sentence.",
  "Do not write in first person unless Website Intelligence or a product convention explicitly requires it.",
  "",
  "Editorial variety must not introduce promotional adjectives, unsupported superlatives, keyword repetition, calls to action, or sales slogans.",
  "Do not use \"trusted\", \"leading\", \"premier\", \"best\", or \"top-rated\" unless explicitly supported and appropriate.",
  "This remains factual directory copy.",
  "",
  "Do not invent awards, certifications, years in business, ratings, reviews, guarantees, staff size, service areas, specialties, customer types, processes, equipment, products, or environmental claims unless explicitly supported by Website Intelligence.",
  "",
  "PRICING — hard rule:",
  "Pricing is intentionally excluded from public GetOblic Description generation because it may change.",
  "Do not publish exact prices, price ranges, currency amounts, discounts, temporary offers, promotional pricing, or qualitative pricing claims such as affordable, inexpensive, budget-friendly, or competitively priced.",
  "Do not write constructions such as \"prices start at\", \"from $\", or \"between $X and $Y\".",
  "If a product or service record also contains a price, keep the product or service fact and omit the price.",
  "",
  "Do not mention Athena, GetOblic intelligence, AI, analysis, prospecting, sales, outreach, scores, confidence, or internal sources.",
  "",
  "Do not keyword-stuff.",
  "HARD OUTPUT CONTRACT:",
  "Return only the final customer-facing directory description.",
  "No headings, markdown, bullets, \"Description:\", analysis, source notes, fact lists, confidence scores, strategy, reasoning, stage labels, or meta commentary.",
].join("\n");

export type GetoblicDescriptionIdentityAnchors = {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type GetoblicDescriptionTrustedContext = {
  identity: GetoblicDescriptionIdentityAnchors;
  websiteIntelligence: Record<string, string>;
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

const PLACEHOLDER_ONLY_VALUES = new Set([
  "na",
  "n/a",
  "tbd",
  "todo",
  "none",
  "null",
  "undefined",
  "xxx",
  "placeholder",
]);

function isPlaceholderOnly(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return true;
  const normalized = trimmed.replace(/[^a-z0-9]+/g, "");
  if (!normalized) return true;
  return (
    PLACEHOLDER_ONLY_VALUES.has(trimmed) ||
    PLACEHOLDER_ONLY_VALUES.has(normalized)
  );
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
  if (!text || isPlaceholderOnly(text)) return null;
  const stripped = compactText(stripVolatilePricing(text), max);
  if (!stripped || isPlaceholderOnly(stripped)) return null;
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

/**
 * Descriptive HomepageIntelligence sections already presented as Website research.
 * Excludes scrape metadata (provider/url/scraped_at/error) and raw dumps
 * (title/headings/paragraphs) that are not Website research sections.
 */
const HOMEPAGE_WEBSITE_INTELLIGENCE_KEYS = [
  "about",
  "services",
  "products",
  "positioning",
  "value_proposition",
  "differentiators",
  "target_audience",
  "messaging",
  "cta",
  "trust_signals",
  "contact_information",
  "brand_tone",
] as const satisfies ReadonlyArray<keyof HomepageIntelligence>;

/** Additional stored website-derived fields used by Deep WI / compat readers. */
const ADDITIONAL_WEBSITE_INTELLIGENCE_KEYS = [
  "solutions",
  "specialties",
  "customer_groups",
  "process",
  "methods",
  "categories",
] as const;

const WEBSITE_INTELLIGENCE_KEYS = [
  ...HOMEPAGE_WEBSITE_INTELLIGENCE_KEYS,
  ...ADDITIONAL_WEBSITE_INTELLIGENCE_KEYS,
] as const;

const WEBSITE_INTELLIGENCE_LIST_KEYS = new Set<string>([
  "categories",
  "services",
  "products",
  "solutions",
  "specialties",
  "customer_groups",
  "methods",
  "cta",
  "trust_signals",
  "contact_information",
]);

const BUSINESS_KNOWLEDGE_KEYS = [
  ...HOMEPAGE_WEBSITE_INTELLIGENCE_KEYS,
  "solutions",
  "specialties",
  "customer_groups",
  "process",
  "methods",
  "training",
  "faq",
  "team",
  "case_studies",
] as const;

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

export function hasUsableWebsiteIntelligence(
  websiteIntelligence: Record<string, string>,
): boolean {
  return Object.values(websiteIntelligence).some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

export function classifyGetoblicDescriptionEvidence(
  context: Pick<GetoblicDescriptionTrustedContext, "websiteIntelligence">,
): GetoblicDescriptionEvidenceAssessment {
  const websiteIntelligenceChars = Object.values(context.websiteIntelligence).reduce(
    (total, value) => total + value.length,
    0,
  );
  const websiteIntelligenceFieldCount = Object.keys(context.websiteIntelligence).length;
  const hasBusinessKnowledge = Boolean(context.websiteIntelligence.business_knowledge);
  const substantialWebsiteIntelligence =
    websiteIntelligenceChars >= 400 &&
    (websiteIntelligenceFieldCount >= 4 ||
      (hasBusinessKnowledge && websiteIntelligenceFieldCount >= 3));
  const someWebsiteIntelligence = websiteIntelligenceChars >= 80;

  const band: GetoblicDescriptionEvidenceBand = substantialWebsiteIntelligence
    ? "rich"
    : someWebsiteIntelligence
      ? "medium"
      : "low";
  const target = GETOBLIC_DESCRIPTION_DEPTH_TARGETS[band];

  return {
    band,
    preferredMin: target.min,
    preferredMax: target.max,
    websiteIntelligenceFieldCount,
    websiteIntelligenceChars,
  };
}

export function buildGetoblicDescriptionContext(
  prospect: Pick<
    Prospect,
    "business_name" | "city" | "state" | "country" | "website_intelligence"
  >,
): GetoblicDescriptionTrustedContext {
  return {
    identity: {
      name: prospect.business_name.trim(),
      city: compactText(prospect.city, 120),
      state: compactText(prospect.state, 120),
      country: compactText(prospect.country, 120),
    },
    websiteIntelligence: extractUsableWebsiteIntelligence(
      prospect.website_intelligence,
    ),
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
  const location = [context.identity.city, context.identity.state, context.identity.country]
    .filter(Boolean)
    .join(", ");
  const evidence = classifyGetoblicDescriptionEvidence(context);
  const depthLabel = evidence.band.toUpperCase();

  const sections = [
    [
      "Create the most useful factual public GetOblic directory description from the stored Website Intelligence below.",
      "Website Intelligence is the sole descriptive evidence. Return only the finished customer-facing description.",
      "Identity anchors identify who and where. They are not descriptive evidence and must not imply services, products, category, industry, hours, specialties, or service area.",
      "Preserve important supported Website Intelligence facts. Represent multiple factual dimensions when the intelligence is rich. Do not compress rich website intelligence into location and one service sentence.",
      `Website Intelligence available for this business is ${depthLabel}. Soft editorial target: approximately ${evidence.preferredMin}–${evidence.preferredMax} characters. Never invent, repeat, or pad to reach it.`,
      "The goal is maximum useful factual information density, not maximum length.",
      "Use the business name naturally, usually once in the opening sentence and no more than twice unless clarity requires it. After introducing the business, vary sentence openings; do not repeat the business name as the subject of every sentence.",
      "Prefer restructuring sentences over mechanically substituting The business or The company as the subject.",
      "For richer evidence, allow about 2–3 compact paragraphs or 5–8 well-constructed sentences when natural. Do not force empty categories.",
      "Prefer direct factual language. State what the business does or offers, not what it aims, strives, or is committed to do.",
      "Distinguish FACT from MARKETING CLAIM. Do not automatically publish ranking or #1 claims from website positioning.",
      "Pricing is intentionally excluded because it may change. Do not include prices, price ranges, discounts, or qualitative pricing claims.",
      "Do not expand geography beyond the identity city, state, and country, or a more specific place Website Intelligence independently states. Never infer a service area from city, address, region taxonomy, nearby metro, permalink, or directory hierarchy.",
      "Do not scrape or request new website intelligence. Use only the stored Website Intelligence below.",
    ].join("\n"),
    formatOptionalBlock("Identity anchors (who and where only; not descriptive evidence):", [
      ["Name", context.identity.name],
      ["City", context.identity.city],
      ["State", context.identity.state],
      ["Country", context.identity.country],
      ["Location", location || null],
    ]),
    formatOptionalBlock(
      "Stored Website Intelligence (sole descriptive evidence):",
      Object.entries(context.websiteIntelligence).map(([key, value]) => [
        key,
        value,
      ]),
    ),
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

const CONTAMINATED_OUTPUT_MARKERS: RegExp[] = [
  /\bSTAGE\s*1\b/i,
  /\bSTAGE\s*2\b/i,
  /\bFACT\s+SELECTION\b/i,
  /\bEDITORIAL\s+SYNTHESIS\b/i,
  /\bSynthesized\s+Fact\s+List\b/i,
  /\bConfidence\s+Score\b/i,
  /\bStrategizing\s+for\s+Synthesis\b/i,
  /\bsource\s+analysis\b/i,
  /\bfact\s+inventory\b/i,
  /\bsource\s+inventory\b/i,
  /\bgeneration\s+method\b/i,
  /\bmeta[- ]analysis\b/i,
];

export function containsGetoblicDescriptionContamination(text: string): boolean {
  return CONTAMINATED_OUTPUT_MARKERS.some((pattern) => pattern.test(text));
}

export function validateGeneratedListingDescription(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ProspectGetoblicDescriptionError(
      "INVALID_OUTPUT",
      "Athena returned an unusable GetOblic description.",
      502,
    );
  }

  if (containsGetoblicDescriptionContamination(raw)) {
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

  if (containsGetoblicDescriptionContamination(sanitized)) {
    throw new ProspectGetoblicDescriptionError(
      "INVALID_OUTPUT",
      "Athena returned an unusable GetOblic description.",
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
  if (!hasUsableWebsiteIntelligence(context.websiteIntelligence)) {
    throw new ProspectGetoblicDescriptionError(
      "WEBSITE_INTELLIGENCE_REQUIRED",
      "Athena needs stored Website Intelligence before generating a GetOblic description.",
      422,
    );
  }

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
