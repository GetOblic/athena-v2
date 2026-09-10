/**
 * Deterministic Identity Brain completeness score.
 * Coverage only — never prose quality, LLM confidence, or card presence.
 */

import { hasUsableStoredHomepageLearning } from "@/services/identity/identityHomepageLearning";
import { readIdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import type { AthenaIdentity } from "@/services/identity/identityService";
import { isDeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export const IDENTITY_KNOWLEDGE_SCORE_WEIGHTS = {
  businessCore: 35,
  voice: 20,
  website: 20,
  brand: 15,
  calibration: 10,
} as const;

/** Same primary understanding keys shown on What Athena knows. */
const BUSINESS_CORE_MODEL_KEYS = [
  "business_overview",
  "primary_audience",
  "products_and_services",
  "positioning",
  "value_proposition",
] as const;

const TRIVIAL_PLACEHOLDERS = new Set([
  "na",
  "tbd",
  "todo",
  "none",
  "null",
  "undefined",
  "xxx",
  "placeholder",
]);

export type IdentityKnowledgeScoreBrandInput = {
  brand_logo_storage_path?: string | null;
  brand_profile_picture_storage_path?: string | null;
  brand_primary_color?: string | null;
  brand_font?: string | null;
};

export type IdentityKnowledgeScoreBreakdown = {
  businessCore: number;
  voice: number;
  website: number;
  brand: number;
  calibration: number;
};

export type IdentityKnowledgeScoreResult = {
  score: number;
  breakdown: IdentityKnowledgeScoreBreakdown;
};

export type IdentityKnowledgeScoreBand =
  | "knowledgeScoreLow"
  | "knowledgeScoreMedium"
  | "knowledgeScoreStrong"
  | "knowledgeScoreExcellent";

export function isMeaningfullyPopulated(
  value: string | null | undefined,
): boolean {
  const text = value?.trim() ?? "";
  if (text.length < 2) return false;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return false;
  return !TRIVIAL_PLACEHOLDERS.has(normalized);
}

export function identityKnowledgeScoreBand(
  score: number,
): IdentityKnowledgeScoreBand {
  if (score <= 39) return "knowledgeScoreLow";
  if (score <= 69) return "knowledgeScoreMedium";
  if (score <= 89) return "knowledgeScoreStrong";
  return "knowledgeScoreExcellent";
}

function ratio(filled: number, total: number): number {
  if (total <= 0) return 0;
  return filled / total;
}

function hasStoredPath(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function computeIdentityKnowledgeScore(input: {
  identity: AthenaIdentity | null;
  brand?: IdentityKnowledgeScoreBrandInput | null;
}): IdentityKnowledgeScoreResult {
  const identity = input.identity;
  const brand = input.brand ?? null;
  const executive = readIdentityExecutiveIntelligence(identity?.master_profile);
  const model = executive?.business_model ?? {};

  const taughtBusinessKnowledge = isMeaningfullyPopulated(identity?.expertise);
  const structuredCoreFilled = BUSINESS_CORE_MODEL_KEYS.filter((key) =>
    isMeaningfullyPopulated(model[key]),
  ).length;
  const businessCore =
    (taughtBusinessKnowledge ? 0.5 : 0) +
    0.5 * ratio(structuredCoreFilled, BUSINESS_CORE_MODEL_KEYS.length);

  const taughtVoice = isMeaningfullyPopulated(identity?.about_you);
  const storedCommunicationStyle = isMeaningfullyPopulated(
    model.communication_style,
  );
  const voice = (taughtVoice ? 0.75 : 0) + (storedCommunicationStyle ? 0.25 : 0);

  const hasWebsiteUrl = Boolean(identity?.website?.trim());
  const hasHomepageLearning = hasUsableStoredHomepageLearning(
    identity?.master_profile,
  );
  const hasDeepIntelligence = isDeepWebsiteIntelligence(
    identity?.website_intelligence,
  );
  const website =
    (hasWebsiteUrl ? 0.4 : 0) +
    (hasHomepageLearning ? 0.4 : 0) +
    (hasDeepIntelligence ? 0.2 : 0);

  const brandChecks = [
    hasStoredPath(brand?.brand_logo_storage_path),
    hasStoredPath(brand?.brand_profile_picture_storage_path),
    hasStoredPath(brand?.brand_primary_color),
    hasStoredPath(brand?.brand_font),
  ];
  const brandScore = ratio(
    brandChecks.filter(Boolean).length,
    brandChecks.length,
  );

  const hasMaterialGap = Boolean(
    executive?.calibration_gaps.some((gap) => gap.what_is_unclear.trim()),
  );
  const calibration = executive && !hasMaterialGap ? 1 : 0;

  const breakdown: IdentityKnowledgeScoreBreakdown = {
    businessCore,
    voice,
    website,
    brand: brandScore,
    calibration,
  };

  const weighted =
    breakdown.businessCore * IDENTITY_KNOWLEDGE_SCORE_WEIGHTS.businessCore +
    breakdown.voice * IDENTITY_KNOWLEDGE_SCORE_WEIGHTS.voice +
    breakdown.website * IDENTITY_KNOWLEDGE_SCORE_WEIGHTS.website +
    breakdown.brand * IDENTITY_KNOWLEDGE_SCORE_WEIGHTS.brand +
    breakdown.calibration * IDENTITY_KNOWLEDGE_SCORE_WEIGHTS.calibration;

  const score = Math.min(100, Math.max(0, Math.round(weighted)));

  return { score, breakdown };
}
