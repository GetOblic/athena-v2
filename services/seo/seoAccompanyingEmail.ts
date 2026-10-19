/**
 * Accompanying email for a Ready SEO report (Option A).
 * One generated subject and body. No edited overlay and no revision history.
 * Structural checks and prompt assembly only. Generated wording is not rejected.
 * No database, provider, or UI locale access.
 */

import {
  isSeoTechnicalPackage,
  type SeoReportPackage,
} from "@/services/seo/seoReportTypes";

export const SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION =
  "seo_accompanying_email_v1" as const;

export const SEO_ACCOMPANYING_EMAIL_STAGE = "seo_accompanying_email" as const;

export const SEO_ACCOMPANYING_EMAIL_SUBJECT_MAX_CHARS = 140 as const;
export const SEO_ACCOMPANYING_EMAIL_BODY_MAX_CHARS = 2_500 as const;

export type SeoAccompanyingEmailText = {
  subject: string;
  body: string;
};

export type SeoAccompanyingEmailGenerationMeta = {
  stage: typeof SEO_ACCOMPANYING_EMAIL_STAGE;
  model: string | null;
  role: "analysis";
};

export type SeoAccompanyingEmailRecord = {
  schemaVersion: typeof SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION;
  generated: SeoAccompanyingEmailText;
  generation: SeoAccompanyingEmailGenerationMeta;
};

export type VerifiedSeoCommercialIdentity = {
  organizationName: string | null;
  legalName: string | null;
  businessEmail: string | null;
  phone: string | null;
  decisionMaker: string | null;
  jobTitle: string | null;
  address: string | null;
  category: string | null;
  industry: string | null;
  website: string | null;
};

export type SeoAccompanyingEmailPromptInput = {
  generationType: "intelligence" | "technical";
  brainAvailable: boolean;
  brainIdentityBlock: string;
  languageCue: string | null;
  voice: string | null;
  positioning: string | null;
  commercialIdentity: VerifiedSeoCommercialIdentity | null;
  grounding: string;
};

const RECORD_KEYS = ["schemaVersion", "generated", "generation"] as const;
const GENERATED_KEYS = ["subject", "body"] as const;
const GENERATION_KEYS = ["stage", "model", "role"] as const;

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function cleanLine(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function matchJsonString(block: string, key: string): string | null {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]{1,300})"`, "i");
  return cleanLine(pattern.exec(block)?.[1]);
}

export function extractTrustedLanguageCue(
  brainIdentityBlock: string,
): string | null {
  return (
    matchJsonString(brainIdentityBlock, "language") ??
    matchJsonString(brainIdentityBlock, "content_language") ??
    matchJsonString(brainIdentityBlock, "preferred_language") ??
    matchJsonString(brainIdentityBlock, "communication_language")
  );
}

export function extractTrustedWebsite(brainIdentityBlock: string): string | null {
  const match = /USER WEBSITE:\s*(\S+)/i.exec(brainIdentityBlock);
  const value = cleanLine(match?.[1]);
  if (!value || /^not\b/i.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  return value;
}

export function extractBrainVoiceAndPositioning(brainIdentityBlock: string): {
  voice: string | null;
  positioning: string | null;
} {
  const voice =
    matchJsonString(brainIdentityBlock, "voice") ??
    matchJsonString(brainIdentityBlock, "brand_voice");
  let positioning = matchJsonString(brainIdentityBlock, "positioning");
  if (!positioning) {
    const array = /"positioning"\s*:\s*\[([^\]]{0,800})\]/i.exec(
      brainIdentityBlock,
    );
    const items = array?.[1]?.match(/"([^"\\]{1,200})"/g) ?? [];
    const joined = items
      .map((item) => item.slice(1, -1).trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("; ");
    positioning = cleanLine(joined);
  }
  return { voice, positioning };
}

export function emptyVerifiedSeoCommercialIdentity(): VerifiedSeoCommercialIdentity {
  return {
    organizationName: null,
    legalName: null,
    businessEmail: null,
    phone: null,
    decisionMaker: null,
    jobTitle: null,
    address: null,
    category: null,
    industry: null,
    website: null,
  };
}

export function hasVerifiedSeoCommercialIdentity(
  identity: VerifiedSeoCommercialIdentity | null | undefined,
): boolean {
  if (!identity) return false;
  return Object.values(identity).some((value) => Boolean(cleanLine(value)));
}

export function formatSeoAccompanyingFullEmail(
  email: SeoAccompanyingEmailText,
): string {
  return `Subject: ${email.subject}\n\n${email.body}`;
}

export function buildSeoAccompanyingEmailGrounding(
  reportPackage: SeoReportPackage,
): string {
  if (isSeoTechnicalPackage(reportPackage)) {
    const next = reportPackage.actionPlan.items[0];
    return [
      `Report family: Website Technical Health`,
      `Report name: ${reportPackage.reportName}`,
      `Summary: ${reportPackage.executiveEvaluation.summary}`,
      `Overall assessment: ${reportPackage.executiveEvaluation.overallAssessment}`,
      next
        ? `Report-grounded next step: ${next.title}. ${next.recommendedAction}`
        : "Report-grounded next step: review the technical action plan.",
      "Boundary: do not claim search positions, visitor counts, or promised outcomes.",
    ].join("\n");
  }

  const next =
    reportPackage.ninetyDayRoadmap.items.find((item) => item.priority === "P0") ??
    reportPackage.ninetyDayRoadmap.items[0];
  const opportunity = reportPackage.commercialOpportunities.opportunities[0];
  return [
    `Report family: Visibility Strategy`,
    `Report name: ${reportPackage.reportName}`,
    `Summary: ${reportPackage.executiveAssessment.summary}`,
    `Overall assessment: ${reportPackage.executiveAssessment.overallAssessment}`,
    next
      ? `Report-grounded next step: ${next.recommendation}`
      : "Report-grounded next step: review the visibility roadmap.",
    opportunity ? `Commercial angle: ${opportunity.title}` : "",
    "Boundary: do not claim search positions, visitor counts, or promised outcomes.",
  ]
    .filter(Boolean)
    .join("\n");
}

function textFromModel(value: unknown): SeoAccompanyingEmailText | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.subject !== "string" || typeof record.body !== "string") {
    return null;
  }
  const subject = record.subject.trim();
  const body = record.body.trim();
  if (!subject || !body) return null;
  return { subject, body };
}

export function parseSeoAccompanyingEmailModelJson(
  rawText: string,
): SeoAccompanyingEmailText | null {
  const stripped = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return textFromModel(JSON.parse(stripped));
  } catch {
    return null;
  }
}

export function buildSeoAccompanyingEmailRecord(input: {
  subject: string;
  body: string;
  model: string | null;
}): SeoAccompanyingEmailRecord {
  return {
    schemaVersion: SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION,
    generated: {
      subject: input.subject,
      body: input.body,
    },
    generation: {
      stage: SEO_ACCOMPANYING_EMAIL_STAGE,
      model: cleanLine(input.model),
      role: "analysis",
    },
  };
}

/**
 * Structural stored-record check used before the UI sees an email.
 * Subject and body must be nonempty strings. Wording is not judged.
 */
export function readStoredSeoAccompanyingEmail(
  value: unknown,
): SeoAccompanyingEmailRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!exactKeys(value, RECORD_KEYS)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION) {
    return null;
  }
  if (
    !record.generated ||
    typeof record.generated !== "object" ||
    Array.isArray(record.generated) ||
    !exactKeys(record.generated, GENERATED_KEYS)
  ) {
    return null;
  }
  if (
    !record.generation ||
    typeof record.generation !== "object" ||
    Array.isArray(record.generation) ||
    !exactKeys(record.generation, GENERATION_KEYS)
  ) {
    return null;
  }

  const generated = record.generated as Record<string, unknown>;
  const generation = record.generation as Record<string, unknown>;
  if (typeof generated.subject !== "string" || typeof generated.body !== "string") {
    return null;
  }
  const subject = generated.subject.trim();
  const body = generated.body.trim();
  if (!subject || !body) return null;
  if (generation.stage !== SEO_ACCOMPANYING_EMAIL_STAGE) return null;
  if (generation.role !== "analysis") return null;
  if (!(generation.model == null || typeof generation.model === "string")) {
    return null;
  }
  if (typeof generation.model === "string" && !generation.model.trim()) {
    return null;
  }

  return {
    schemaVersion: SEO_ACCOMPANYING_EMAIL_SCHEMA_VERSION,
    generated: { subject, body },
    generation: {
      stage: SEO_ACCOMPANYING_EMAIL_STAGE,
      model:
        typeof generation.model === "string" ? generation.model.trim() : null,
      role: "analysis",
    },
  };
}

function commercialLines(
  identity: VerifiedSeoCommercialIdentity | null,
): string[] {
  if (!hasVerifiedSeoCommercialIdentity(identity) || !identity) {
    return [
      "No verified commercial identity fields were available.",
      "Do not add a sender name, phone number, email address, postal address, website, or signature.",
    ];
  }
  const lines = ["Use only these verified nonempty fields. Omit every field that is not listed."];
  const entries: Array<[string, string | null]> = [
    ["Organization name", identity.organizationName],
    ["Legal name", identity.legalName],
    ["Business email", identity.businessEmail],
    ["Phone", identity.phone],
    ["Decision maker", identity.decisionMaker],
    ["Job title", identity.jobTitle],
    ["Address", identity.address],
    ["Category", identity.category],
    ["Industry", identity.industry],
    ["Website", identity.website],
  ];
  for (const [label, value] of entries) {
    const cleaned = cleanLine(value);
    if (cleaned) lines.push(`- ${label}: ${cleaned}`);
  }
  return lines;
}

export function buildSeoAccompanyingEmailPrompt(
  input: SeoAccompanyingEmailPromptInput,
): string {
  const languageLine = input.languageCue
    ? `Trusted Brain language cue: ${input.languageCue}. Write the subject and body in that language.`
    : "No separate language code was provided. Write in the language of the trusted Brain context below. Do not switch to an application UI language.";
  const voiceLine = input.voice
    ? `Trusted voice, use it: ${input.voice}`
    : "No separate voice field was available. Follow the voice already present in the trusted Brain context, or stay plain and professional when that context is absent.";
  const positioningLine = input.positioning
    ? `Organization positioning, use it: ${input.positioning}`
    : "No separate positioning field was available. Use positioning only when the trusted Brain context states it.";
  const brainBlock = input.brainAvailable
    ? input.brainIdentityBlock.trim()
    : "No trusted Brain identity was available for this organization. Do not invent brand voice, positioning, sender details, or commercial facts.";

  return [
    "Write one accompanying email for the validated SEO report below.",
    "Return strict JSON only: {\"subject\":\"...\",\"body\":\"...\"}.",
    "The recipient name and recipient email address are unknown. Do not greet a named person.",
    "Do not invent recipient names, recipient addresses, sender names, phone numbers, signatures, rankings, traffic numbers, or SEO guarantees.",
    "Do not mention Athena, the model, or that this text was generated.",
    `Subject maximum ${SEO_ACCOMPANYING_EMAIL_SUBJECT_MAX_CHARS} characters, one line.`,
    `Body maximum ${SEO_ACCOMPANYING_EMAIL_BODY_MAX_CHARS} characters, plain text, with one clear next step taken from the report.`,
    languageLine,
    voiceLine,
    positioningLine,
    "",
    "TRUSTED BRAIN CONTEXT:",
    brainBlock,
    "",
    "VERIFIED COMMERCIAL IDENTITY:",
    ...commercialLines(input.commercialIdentity),
    "",
    "VALIDATED SEO REPORT:",
    input.grounding,
  ].join("\n");
}
