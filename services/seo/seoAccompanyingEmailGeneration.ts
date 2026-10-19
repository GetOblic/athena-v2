/**
 * One analysis-model call for an SEO accompanying email.
 * Provider failure and unparseable output soft-fail to null.
 * Generated wording is kept. There is no second call and no paid retry.
 * Generated language follows trusted Brain context, never UI translations.
 */

import { resolveModelForStage } from "@/lib/llm/modelRouting";
import { generateReview, type GenerateReviewOptions } from "@/services/aiService";
import type { OrganizationCommercialIdentity } from "@/services/organization/organizationCommercialIdentity";
import {
  buildSeoAccompanyingEmailGrounding,
  buildSeoAccompanyingEmailPrompt,
  buildSeoAccompanyingEmailRecord,
  extractBrainVoiceAndPositioning,
  extractTrustedLanguageCue,
  extractTrustedWebsite,
  parseSeoAccompanyingEmailModelJson,
  type SeoAccompanyingEmailRecord,
  type VerifiedSeoCommercialIdentity,
} from "@/services/seo/seoAccompanyingEmail";
import type { SeoOrganizationContext } from "@/services/seo/seoContextComposer";
import type { SeoReportPackage } from "@/services/seo/seoReportTypes";

export type SeoAccompanyingEmailGenerationReason =
  | "generated"
  | "model_failed"
  | "invalid_email";

export type SeoAccompanyingEmailGenerationResult = {
  record: SeoAccompanyingEmailRecord | null;
  reason: SeoAccompanyingEmailGenerationReason;
};

const SYSTEM_PROMPT = [
  "You write one accompanying email for a completed SEO report.",
  "Return strict JSON only with subject and body.",
  "The recipient is unknown.",
  "Do not invent recipient names, recipient addresses, sender names, phone numbers, signatures, rankings, traffic numbers, or SEO guarantees.",
  "Use only verified commercial identity fields that are provided.",
  "Follow the trusted Brain voice, positioning, and language.",
  "Ground the next step in the validated report.",
].join(" ");

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toVerifiedSeoCommercialIdentity(
  row: OrganizationCommercialIdentity | null | undefined,
  website?: string | null,
): VerifiedSeoCommercialIdentity | null {
  if (!row) return null;
  const address = [
    row.address,
    row.address_line2,
    row.city,
    row.state,
    row.postal_code,
    row.country,
  ]
    .map((part) => clean(part))
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return {
    organizationName: clean(row.name),
    legalName: clean(row.legal_name),
    businessEmail: clean(row.business_email),
    phone: clean(row.phone),
    decisionMaker: clean(row.decision_maker),
    jobTitle: clean(row.job_title),
    address: address || null,
    category: clean(row.category),
    industry: clean(row.industry),
    website: clean(website),
  };
}

async function defaultLoadCommercialIdentity(
  organizationId: string,
): Promise<VerifiedSeoCommercialIdentity | null> {
  const { getOrganizationCommercialIdentity } = await import(
    "@/services/organization/organizationCommercialIdentity"
  );
  const row = await getOrganizationCommercialIdentity(organizationId);
  if (!row || row.organization_id !== organizationId) return null;
  return toVerifiedSeoCommercialIdentity(row);
}

export async function generateSeoAccompanyingEmail(input: {
  organizationId: string;
  reportPackage: SeoReportPackage;
  context: Pick<
    SeoOrganizationContext,
    "organizationId" | "brainIdentityBlock" | "meta"
  >;
  commercialIdentity?: VerifiedSeoCommercialIdentity | null;
  loadCommercialIdentity?: (
    organizationId: string,
  ) => Promise<VerifiedSeoCommercialIdentity | null>;
  generate?: (
    prompt: string,
    options: GenerateReviewOptions,
  ) => Promise<string>;
}): Promise<SeoAccompanyingEmailGenerationResult> {
  const organizationId = input.organizationId.trim();
  const brainTrusted =
    input.context.organizationId === organizationId &&
    input.context.meta.brainAvailable;
  const brainIdentityBlock = brainTrusted
    ? input.context.brainIdentityBlock
    : "";
  const personalization = brainTrusted
    ? extractBrainVoiceAndPositioning(brainIdentityBlock)
    : { voice: null, positioning: null };
  const website = brainTrusted ? extractTrustedWebsite(brainIdentityBlock) : null;

  let identity: VerifiedSeoCommercialIdentity | null;
  if (input.commercialIdentity !== undefined) {
    identity = input.commercialIdentity;
  } else {
    try {
      const load =
        input.loadCommercialIdentity ?? defaultLoadCommercialIdentity;
      identity = await load(organizationId);
    } catch (error) {
      console.error("[ATHENA_SEO] accompanying_email_context_failed", {
        organizationId,
        error: error instanceof Error ? error.name : "context_failed",
      });
      identity = null;
    }
  }
  if (identity && !identity.website && website) {
    identity = { ...identity, website };
  }
  if (!identity && website) {
    identity = {
      organizationName: null,
      legalName: null,
      businessEmail: null,
      phone: null,
      decisionMaker: null,
      jobTitle: null,
      address: null,
      category: null,
      industry: null,
      website,
    };
  }

  const prompt = buildSeoAccompanyingEmailPrompt({
    generationType:
      input.reportPackage.generationType === "technical"
        ? "technical"
        : "intelligence",
    brainAvailable: brainTrusted,
    brainIdentityBlock,
    languageCue: brainTrusted
      ? extractTrustedLanguageCue(brainIdentityBlock)
      : null,
    voice: personalization.voice,
    positioning: personalization.positioning,
    commercialIdentity: identity,
    grounding: buildSeoAccompanyingEmailGrounding(input.reportPackage),
  });

  const generate = input.generate ?? generateReview;
  let raw: string;
  try {
    raw = await generate(prompt, {
      stage: "seo.accompanying_email",
      promptSource: "services/seo/seoAccompanyingEmailGeneration.ts",
      athenaStage: "seo_accompanying_email",
      reasoningProfile: "BALANCED",
      systemPrompt: SYSTEM_PROMPT,
    });
  } catch (error) {
    console.error("[ATHENA_SEO] accompanying_email_model_failed", {
      organizationId,
      error: error instanceof Error ? error.name : "model_failed",
    });
    return { record: null, reason: "model_failed" };
  }

  const parsed = parseSeoAccompanyingEmailModelJson(raw);
  if (!parsed) {
    return { record: null, reason: "invalid_email" };
  }

  const route = resolveModelForStage("seo_accompanying_email");
  return {
    record: buildSeoAccompanyingEmailRecord({
      subject: parsed.subject,
      body: parsed.body,
      model: route.model,
    }),
    reason: "generated",
  };
}
