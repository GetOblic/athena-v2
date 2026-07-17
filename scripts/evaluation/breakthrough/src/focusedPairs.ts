/**
 * Frozen Phase 2E focused re-test pair selection (exactly 32 unique pairs).
 */

import type { PilotAssetKey } from "./constants";
import { PILOT_ASSET_KEYS, PILOT_ASSET_META } from "./constants";

export type FocusedPairSpec = {
  pairId: string;
  prospectId: string;
  assetKey: PilotAssetKey;
  stage: "deployment_assets" | "strategic_blueprint";
};

/** Exact frozen 32-pair list — order is stable for reporting. */
export const FOCUSED_V2_PAIR_IDS = [
  "p1_local_service_medium__NEWSLETTER_IDEA",
  "p1_local_service_medium__image_prompt",
  "p1_local_service_medium__social_prompt",
  "p2_aesthetic_provider_medium_rich__NEWSLETTER_IDEA",
  "p2_aesthetic_provider_medium_rich__image_prompt",
  "p2_aesthetic_provider_medium_rich__social_prompt",
  "p3_academy_rich__NEWSLETTER_IDEA",
  "p3_academy_rich__PERSONALIZED_OUTREACH_EMAIL",
  "p3_academy_rich__image_prompt",
  "p3_academy_rich__social_prompt",
  "p4_b2b_service_medium__NEWSLETTER_IDEA",
  "p4_b2b_service_medium__image_prompt",
  "p4_b2b_service_medium__social_prompt",
  "p5_software_medium__NEWSLETTER_IDEA",
  "p5_software_medium__image_prompt",
  "p5_software_medium__social_prompt",
  "p6_personal_brand_medium__NEWSLETTER_IDEA",
  "p6_personal_brand_medium__image_prompt",
  "p6_personal_brand_medium__social_prompt",
  "p7_multi_offer_rich__NEWSLETTER_IDEA",
  "p7_multi_offer_rich__image_prompt",
  "p7_multi_offer_rich__social_prompt",
  "p8_thin_site_sparse__HIDDEN_GEMS",
  "p8_thin_site_sparse__LINKEDIN_CONNECTION",
  "p8_thin_site_sparse__NEWSLETTER_IDEA",
  "p8_thin_site_sparse__OBJECTION_ANTICIPATION",
  "p8_thin_site_sparse__PERSONALIZED_OUTREACH_EMAIL",
  "p8_thin_site_sparse__PERSONALIZED_VALUE_PROPOSITION",
  "p8_thin_site_sparse__SHORT_VIDEO_PROMPT",
  "p8_thin_site_sparse__SOCIAL_VOICE_POST",
  "p8_thin_site_sparse__image_prompt",
  "p8_thin_site_sparse__social_prompt",
] as const;

export type FocusedV2PairId = (typeof FOCUSED_V2_PAIR_IDS)[number];

function parsePairId(pairId: string): FocusedPairSpec {
  const sep = pairId.indexOf("__");
  if (sep <= 0) {
    throw new Error(`Invalid focused pair id: ${pairId}`);
  }
  const prospectId = pairId.slice(0, sep);
  const assetKey = pairId.slice(sep + 2) as PilotAssetKey;
  if (!(PILOT_ASSET_KEYS as readonly string[]).includes(assetKey)) {
    throw new Error(`Focused pair ${pairId}: unknown asset key ${assetKey}`);
  }
  return {
    pairId,
    prospectId,
    assetKey,
    stage: PILOT_ASSET_META[assetKey].stage,
  };
}

/**
 * Return the frozen focused set. Throws if count/uniqueness invariants break.
 */
export function getFocusedV2Pairs(): FocusedPairSpec[] {
  if (FOCUSED_V2_PAIR_IDS.length !== 32) {
    throw new Error(
      `Focused v2 set must contain exactly 32 pairs; found ${FOCUSED_V2_PAIR_IDS.length}.`,
    );
  }
  const unique = new Set<string>(FOCUSED_V2_PAIR_IDS);
  if (unique.size !== 32) {
    throw new Error("Focused v2 set contains duplicate pair IDs.");
  }
  return FOCUSED_V2_PAIR_IDS.map((pairId) => parsePairId(pairId));
}

export function uniqueFocusedProspectIds(): string[] {
  return [...new Set(getFocusedV2Pairs().map((pair) => pair.prospectId))].sort();
}

export function focusedStagesForProspect(
  prospectId: string,
): Array<"deployment_assets" | "strategic_blueprint"> {
  const stages = new Set<"deployment_assets" | "strategic_blueprint">();
  for (const pair of getFocusedV2Pairs()) {
    if (pair.prospectId === prospectId) stages.add(pair.stage);
  }
  return [...stages];
}
