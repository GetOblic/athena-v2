/**
 * Deterministic creative fingerprints for L5 historical comparison.
 * Generated here; never trusted from the model.
 */

import {
  SOCIAL_PLANNER_ASSET_TYPE_FAMILY,
  type SocialCalendarAssetV1,
  type SocialPlannerAssetFingerprint,
  type SocialPlannerCtaType,
  type SocialPlannerHookType,
  type SocialPlannerProductionSpec,
  type SocialPlannerWeekFingerprint,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";

export function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyHookType(hook: string | null): SocialPlannerHookType {
  if (!hook || !hook.trim()) return "none";
  const trimmed = hook.trim();
  if (trimmed.includes("?")) return "question";
  if (/^\s*[\d$%]/.test(trimmed)) return "statistic";
  if (/^\s*(stop|start|try|book|don'?t|never|always|look|watch|save|join)\b/i.test(trimmed)) {
    return "command";
  }
  return "statement";
}

export function classifyCtaType(cta: string | null): SocialPlannerCtaType {
  if (!cta || !cta.trim()) return "none";
  const normalized = normalizeComparableText(cta);
  if (/\b(book|schedule|appoint|reserve)\b/.test(normalized)) return "book";
  if (/\b(buy|shop|order|purchase|checkout)\b/.test(normalized)) return "purchase";
  if (/\b(learn|read|download|see|discover|guide)\b/.test(normalized)) return "learn";
  if (/\b(comment|share|tag|vote|reply|tell)\b/.test(normalized)) return "engage";
  return "other";
}

export function hookPrefix(hook: string | null, words = 3): string | null {
  if (!hook) return null;
  const tokens = normalizeComparableText(hook).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.slice(0, words).join(" ");
}

function visualStyleFromSpec(spec: SocialPlannerProductionSpec): string {
  if (spec.kind === "static") {
    return normalizeComparableText(`${spec.visualTone} ${spec.composition}`).slice(0, 80);
  }
  if (spec.kind === "carousel") {
    return normalizeComparableText(spec.visualDirection).slice(0, 80);
  }
  if (spec.kind === "video") {
    return normalizeComparableText(spec.visualTone).slice(0, 80);
  }
  if (spec.kind === "document") {
    return normalizeComparableText(spec.designPrompt).slice(0, 80);
  }
  return normalizeComparableText(spec.visualSupport ?? spec.engagementType).slice(0, 80);
}

export function buildAssetCreativeFingerprint(
  asset: Omit<SocialCalendarAssetV1, "creativeFingerprint">,
): SocialPlannerAssetFingerprint {
  return {
    assetType: asset.assetType,
    family: SOCIAL_PLANNER_ASSET_TYPE_FAMILY[asset.assetType],
    contentArchetype: asset.contentArchetype,
    topic: normalizeComparableText(asset.topic),
    angle: normalizeComparableText(asset.angle),
    hookType: classifyHookType(asset.hook),
    hookNormalized: asset.hook ? normalizeComparableText(asset.hook) : null,
    objective: asset.primaryObjective,
    audience: normalizeComparableText(asset.audience),
    personaIds: [...asset.personaIds].sort(),
    ctaType: classifyCtaType(asset.cta),
    visualStyle: visualStyleFromSpec(asset.productionSpec),
    calendarAnchorIds: asset.calendarAnchors
      .map((anchor) => anchor.sourceCandidateId)
      .sort(),
  };
}

export function buildWeekFingerprint(
  assets: Array<Pick<SocialCalendarAssetV1, "creativeFingerprint">>,
): SocialPlannerWeekFingerprint {
  const unique = <T,>(values: T[]): T[] => [...new Set(values)];
  return {
    assetTypes: unique(assets.map((asset) => asset.creativeFingerprint.assetType)),
    families: unique(assets.map((asset) => asset.creativeFingerprint.family)),
    objectives: unique(assets.map((asset) => asset.creativeFingerprint.objective)),
    archetypes: unique(
      assets.map((asset) => asset.creativeFingerprint.contentArchetype),
    ),
    personaIds: unique(
      assets.flatMap((asset) => asset.creativeFingerprint.personaIds),
    ).sort(),
    topics: unique(assets.map((asset) => asset.creativeFingerprint.topic)),
    calendarAnchorIds: unique(
      assets.flatMap((asset) => asset.creativeFingerprint.calendarAnchorIds),
    ).sort(),
  };
}
