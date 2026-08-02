/**
 * Strict validation for AdCampaignPackage before persistence.
 * Incomplete packages must never be marked Ready.
 */

import {
  KEYWORD_THEMES_DISCLAIMER,
  KEYWORD_THEMES_LABEL,
  type AdCampaignPackage,
  type AdCampaignStrategy,
  type FacebookAdAssets,
  type GoogleSearchAdAssets,
  type InstagramAdAssets,
  type RecommendedKeywordTheme,
  type RecommendedKeywordThemes,
  type TikTokAdAssets,
} from "@/services/ads/adCampaignTypes";

export class AdCampaignPackageValidationError extends Error {
  readonly code = "INVALID_PACKAGE";
  readonly details: string[];

  constructor(details: string[]) {
    super(details[0] ?? "Ad campaign package validation failed.");
    this.name = "AdCampaignPackageValidationError";
    this.details = details;
  }
}

const FORBIDDEN_KEYWORD_CLAIM_PATTERNS: RegExp[] = [
  /\btrending\b/i,
  /\bcurrently trending\b/i,
  /\bhigh[- ]volume\b/i,
  /\blive search\b/i,
  /\bexternally validated\b/i,
  /\blow competition\b/i,
  /\bhigh competition\b/i,
  /\bhigh cpc\b/i,
  /\blow cpc\b/i,
  /\bsearch volume\b/i,
  /\bavg\.?\s*cpc\b/i,
  /\bcpc\s*[:=]\s*\$?\d/i,
  /\bvolume\s*[:=]\s*\d/i,
  /\bcompetition\s*[:=]\s*\d+%?/i,
  /\btrend score\b/i,
  /\bforecast\b/i,
];

function requireNonEmptyString(
  value: unknown,
  path: string,
  errors: string[],
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty string.`);
    return null;
  }
  return value.trim();
}

function requireStringArray(
  value: unknown,
  path: string,
  errors: string[],
  minLength = 1,
): string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of strings.`);
    return null;
  }
  const items = value
    .map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        errors.push(`${path}[${index}] must be a non-empty string.`);
        return null;
      }
      return item.trim();
    })
    .filter((item): item is string => item != null);

  if (items.length < minLength) {
    errors.push(`${path} must contain at least ${minLength} item(s).`);
    return null;
  }
  return items;
}

function collectKeywordForbiddenClaims(text: string, path: string, errors: string[]) {
  for (const pattern of FORBIDDEN_KEYWORD_CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(
        `${path} contains unsupported keyword metric/trend claim matching ${pattern}.`,
      );
      break;
    }
  }
  if (/\b\d{1,3}(?:,\d{3})+\b/.test(text) && /\b(searches|volume|cpc|\$)\b/i.test(text)) {
    errors.push(`${path} appears to invent numeric search/CPC metrics.`);
  }
}

function validateStrategy(
  value: unknown,
  errors: string[],
): AdCampaignStrategy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("strategy must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const campaignName = requireNonEmptyString(raw.campaignName, "strategy.campaignName", errors);
  const objective = requireNonEmptyString(raw.objective, "strategy.objective", errors);
  const audience = requireNonEmptyString(raw.audience, "strategy.audience", errors);
  const coreOfferOrMessage = requireNonEmptyString(
    raw.coreOfferOrMessage,
    "strategy.coreOfferOrMessage",
    errors,
  );
  const positioningAngle = requireNonEmptyString(
    raw.positioningAngle,
    "strategy.positioningAngle",
    errors,
  );
  const primaryValueProposition = requireNonEmptyString(
    raw.primaryValueProposition,
    "strategy.primaryValueProposition",
    errors,
  );
  const ctaDirection = requireNonEmptyString(
    raw.ctaDirection,
    "strategy.ctaDirection",
    errors,
  );
  const landingPageDirection = requireNonEmptyString(
    raw.landingPageDirection,
    "strategy.landingPageDirection",
    errors,
  );
  const rationale = requireNonEmptyString(raw.rationale, "strategy.rationale", errors);
  const briefMode = raw.briefMode;
  if (briefMode !== "inferred" && briefMode !== "guided") {
    errors.push('strategy.briefMode must be "inferred" or "guided".');
  }

  if (
    !campaignName ||
    !objective ||
    !audience ||
    !coreOfferOrMessage ||
    !positioningAngle ||
    !primaryValueProposition ||
    !ctaDirection ||
    !landingPageDirection ||
    !rationale ||
    (briefMode !== "inferred" && briefMode !== "guided")
  ) {
    return null;
  }

  return {
    campaignName,
    objective,
    audience,
    coreOfferOrMessage,
    positioningAngle,
    primaryValueProposition,
    ctaDirection,
    landingPageDirection,
    rationale,
    briefMode,
  };
}

function validateFacebook(
  value: unknown,
  errors: string[],
): FacebookAdAssets | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("facebook must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const fields = [
    "primaryText",
    "headline",
    "description",
    "ctaRecommendation",
    "audienceDirection",
    "creativeConcept",
    "imagePrompt",
  ] as const;
  const out: Partial<FacebookAdAssets> = {};
  for (const field of fields) {
    const v = requireNonEmptyString(raw[field], `facebook.${field}`, errors);
    if (v) out[field] = v;
  }
  if (fields.some((f) => !out[f])) return null;
  return out as FacebookAdAssets;
}

function validateInstagram(
  value: unknown,
  errors: string[],
): InstagramAdAssets | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("instagram must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const required = [
    "feedCaption",
    "openingHook",
    "reelOrStoryScript",
    "onScreenText",
    "cta",
    "creativeConcept",
    "imageOrShortVideoPrompt",
  ] as const;
  const out: Partial<InstagramAdAssets> = {};
  for (const field of required) {
    const v = requireNonEmptyString(raw[field], `instagram.${field}`, errors);
    if (v) out[field] = v;
  }
  let hashtagDirection: string | null = null;
  if (raw.hashtagDirection == null || raw.hashtagDirection === "") {
    hashtagDirection = null;
  } else if (typeof raw.hashtagDirection === "string") {
    hashtagDirection = raw.hashtagDirection.trim() || null;
  } else {
    errors.push("instagram.hashtagDirection must be a string or null.");
  }
  if (required.some((f) => !out[f])) return null;
  return { ...(out as Omit<InstagramAdAssets, "hashtagDirection">), hashtagDirection };
}

function validateTikTok(value: unknown, errors: string[]): TikTokAdAssets | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("tiktok must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const fields = [
    "openingHook",
    "shortVideoScript",
    "sceneDirection",
    "onScreenText",
    "caption",
    "cta",
    "creatorOrProductionDirection",
  ] as const;
  const out: Partial<TikTokAdAssets> = {};
  for (const field of fields) {
    const v = requireNonEmptyString(raw[field], `tiktok.${field}`, errors);
    if (v) out[field] = v;
  }
  if (fields.some((f) => !out[f])) return null;
  return out as TikTokAdAssets;
}

function validateGoogleSearch(
  value: unknown,
  errors: string[],
): GoogleSearchAdAssets | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("googleSearch must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const campaignTheme = requireNonEmptyString(
    raw.campaignTheme,
    "googleSearch.campaignTheme",
    errors,
  );
  const landingPageDirection = requireNonEmptyString(
    raw.landingPageDirection,
    "googleSearch.landingPageDirection",
    errors,
  );
  const adGroupThemes = requireStringArray(
    raw.adGroupThemes,
    "googleSearch.adGroupThemes",
    errors,
    2,
  );
  const headlines = requireStringArray(
    raw.headlines,
    "googleSearch.headlines",
    errors,
    3,
  );
  const descriptions = requireStringArray(
    raw.descriptions,
    "googleSearch.descriptions",
    errors,
    2,
  );
  const sitelinkIdeas = requireStringArray(
    raw.sitelinkIdeas,
    "googleSearch.sitelinkIdeas",
    errors,
    2,
  );
  const calloutIdeas = requireStringArray(
    raw.calloutIdeas,
    "googleSearch.calloutIdeas",
    errors,
    2,
  );
  const structuredSnippetIdeas = requireStringArray(
    raw.structuredSnippetIdeas,
    "googleSearch.structuredSnippetIdeas",
    errors,
    2,
  );
  const negativeKeywordSuggestions = requireStringArray(
    raw.negativeKeywordSuggestions,
    "googleSearch.negativeKeywordSuggestions",
    errors,
    1,
  );

  if (
    !campaignTheme ||
    !landingPageDirection ||
    !adGroupThemes ||
    !headlines ||
    !descriptions ||
    !sitelinkIdeas ||
    !calloutIdeas ||
    !structuredSnippetIdeas ||
    !negativeKeywordSuggestions
  ) {
    return null;
  }

  return {
    campaignTheme,
    adGroupThemes,
    headlines,
    descriptions,
    sitelinkIdeas,
    calloutIdeas,
    structuredSnippetIdeas,
    negativeKeywordSuggestions,
    landingPageDirection,
  };
}

function validateKeywordThemes(
  value: unknown,
  errors: string[],
): RecommendedKeywordThemes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("keywordThemes must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.label !== KEYWORD_THEMES_LABEL) {
    errors.push(
      `keywordThemes.label must be exactly "${KEYWORD_THEMES_LABEL}".`,
    );
  }
  const disclaimer = requireNonEmptyString(
    raw.disclaimer,
    "keywordThemes.disclaimer",
    errors,
  );
  if (disclaimer) {
    const lower = disclaimer.toLowerCase();
    if (
      !(
        lower.includes("inferred") &&
        (lower.includes("not based on live") ||
          lower.includes("not based on live search") ||
          (lower.includes("not") && lower.includes("volume")))
      )
    ) {
      errors.push(
        "keywordThemes.disclaimer must explain themes are inferred and not live volume/trend data.",
      );
    }
    // Do not run trend/metric claim scanners on the fixed disclaimer itself —
    // it may mention "live search volume" while negating those claims.
  }

  if (!Array.isArray(raw.themes) || raw.themes.length < 3) {
    errors.push("keywordThemes.themes must contain at least 3 themes.");
    return null;
  }

  const themes: RecommendedKeywordTheme[] = [];
  for (let i = 0; i < raw.themes.length; i += 1) {
    const themeRaw = raw.themes[i];
    if (!themeRaw || typeof themeRaw !== "object" || Array.isArray(themeRaw)) {
      errors.push(`keywordThemes.themes[${i}] must be an object.`);
      continue;
    }
    const t = themeRaw as Record<string, unknown>;
    const theme = requireNonEmptyString(t.theme, `keywordThemes.themes[${i}].theme`, errors);
    const intentClassification = requireNonEmptyString(
      t.intentClassification,
      `keywordThemes.themes[${i}].intentClassification`,
      errors,
    );
    const audienceRelevance = requireNonEmptyString(
      t.audienceRelevance,
      `keywordThemes.themes[${i}].audienceRelevance`,
      errors,
    );
    const suggestedMessageAngle = requireNonEmptyString(
      t.suggestedMessageAngle,
      `keywordThemes.themes[${i}].suggestedMessageAngle`,
      errors,
    );
    const suggestedLandingPageDirection = requireNonEmptyString(
      t.suggestedLandingPageDirection,
      `keywordThemes.themes[${i}].suggestedLandingPageDirection`,
      errors,
    );

    let negativeKeywordTheme: string | null | undefined = undefined;
    if (t.negativeKeywordTheme != null && t.negativeKeywordTheme !== "") {
      if (typeof t.negativeKeywordTheme !== "string") {
        errors.push(
          `keywordThemes.themes[${i}].negativeKeywordTheme must be a string or null.`,
        );
      } else {
        negativeKeywordTheme = t.negativeKeywordTheme.trim() || null;
      }
    } else if (t.negativeKeywordTheme === null || t.negativeKeywordTheme === "") {
      negativeKeywordTheme = null;
    }

    const blob = [
      theme,
      intentClassification,
      audienceRelevance,
      suggestedMessageAngle,
      suggestedLandingPageDirection,
      negativeKeywordTheme,
    ]
      .filter(Boolean)
      .join(" ");
    collectKeywordForbiddenClaims(blob, `keywordThemes.themes[${i}]`, errors);

    if (
      theme &&
      intentClassification &&
      audienceRelevance &&
      suggestedMessageAngle &&
      suggestedLandingPageDirection
    ) {
      themes.push({
        theme,
        intentClassification,
        audienceRelevance,
        suggestedMessageAngle,
        suggestedLandingPageDirection,
        negativeKeywordTheme: negativeKeywordTheme ?? null,
      });
    }
  }

  if (raw.label !== KEYWORD_THEMES_LABEL || !disclaimer || themes.length < 3) {
    return null;
  }

  return {
    label: KEYWORD_THEMES_LABEL,
    themes,
    disclaimer: disclaimer.includes("not based on live")
      ? disclaimer
      : KEYWORD_THEMES_DISCLAIMER,
  };
}

/** Soft structural distinctness — platforms must not be near-identical copies. */
function assertPlatformDistinctness(pkg: AdCampaignPackage, errors: string[]) {
  const facebookBlob = [
    pkg.facebook.primaryText,
    pkg.facebook.headline,
    pkg.facebook.creativeConcept,
  ]
    .join(" ")
    .toLowerCase();
  const instagramBlob = [
    pkg.instagram.feedCaption,
    pkg.instagram.openingHook,
    pkg.instagram.creativeConcept,
  ]
    .join(" ")
    .toLowerCase();
  const tiktokBlob = [
    pkg.tiktok.openingHook,
    pkg.tiktok.shortVideoScript,
    pkg.tiktok.caption,
  ]
    .join(" ")
    .toLowerCase();

  if (facebookBlob === instagramBlob) {
    errors.push("facebook and instagram packages must be structurally distinct.");
  }
  if (facebookBlob === tiktokBlob) {
    errors.push("facebook and tiktok packages must be structurally distinct.");
  }
  if (instagramBlob === tiktokBlob) {
    errors.push("instagram and tiktok packages must be structurally distinct.");
  }
}

/**
 * Validate and normalize a complete AdCampaignPackage.
 * Throws AdCampaignPackageValidationError when incomplete or unsafe.
 */
export function validateAdCampaignPackage(input: unknown): AdCampaignPackage {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdCampaignPackageValidationError([
      "package must be a non-null object.",
    ]);
  }
  const raw = input as Record<string, unknown>;

  const strategy = validateStrategy(raw.strategy, errors);
  const facebook = validateFacebook(raw.facebook, errors);
  const instagram = validateInstagram(raw.instagram, errors);
  const tiktok = validateTikTok(raw.tiktok, errors);
  const googleSearch = validateGoogleSearch(raw.googleSearch, errors);
  const keywordThemes = validateKeywordThemes(raw.keywordThemes, errors);

  if (
    !strategy ||
    !facebook ||
    !instagram ||
    !tiktok ||
    !googleSearch ||
    !keywordThemes
  ) {
    throw new AdCampaignPackageValidationError(
      errors.length > 0 ? errors : ["Incomplete ad campaign package."],
    );
  }

  const pkg: AdCampaignPackage = {
    strategy,
    facebook,
    instagram,
    tiktok,
    googleSearch,
    keywordThemes,
  };

  assertPlatformDistinctness(pkg, errors);
  if (errors.length > 0) {
    throw new AdCampaignPackageValidationError(errors);
  }

  return pkg;
}

export function isCompleteAdCampaignPackage(
  input: unknown,
): input is AdCampaignPackage {
  try {
    validateAdCampaignPackage(input);
    return true;
  } catch {
    return false;
  }
}
