/**
 * Deterministic Social Planner intelligence budgets (L3).
 * Precedents: Ads 36k / SEO 48k total, 8 persona/prospect caps, 220 field truncate.
 */

export const SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION =
  "social_planner_generation_context_v1" as const;

export const SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION =
  "social_planner_l3_v1" as const;

/** Matches Ads/SEO compact field excerpts. */
export const SOCIAL_PLANNER_FIELD_TRUNCATE_CHARS = 220 as const;

/** Slightly longer than field truncate for campaign/blueprint fingerprints. */
export const SOCIAL_PLANNER_FINGERPRINT_CHARS = 240 as const;

/**
 * Trend Social has no Super Admin product character cap (unlike Estimate 6_000).
 * L3 still bounds the instruction body using the Estimate governed-instruction precedent.
 */
export const SOCIAL_PLANNER_TREND_SOCIAL_INSTRUCTION_MAX_CHARS = 6_000 as const;

export const SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS = {
  personas: 8,
  prospects: 8,
  discussions: 6,
  opportunities: 8,
  seoReports: 2,
  adsCampaigns: 3,
  blueprints: 6,
  websitePages: 12,
  domains: 8,
  hiddenSignals: 4,
} as const;

export const SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS = {
  personas: 40,
  prospects: 40,
  discussions: 16,
  opportunities: 16,
  seoReports: 12,
  adsCampaigns: 12,
  blueprints: 12,
} as const;

export const SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS = {
  organization: 1_200,
  brain: 8_000,
  identityExecutiveIntelligence: 4_000,
  websiteIntelligence: 8_000,
  seoIntelligence: 6_000,
  discussions: 6_000,
  personas: 6_000,
  prospects: 6_000,
  opportunities: 3_000,
  ads: 4_000,
  strategicAssetBlueprints: 6_000,
  trendSocialPrompt: 6_000,
  calendarContext: 2_400,
} as const;

/** SEO composer total — leaves room for later L4 generation instructions. */
export const SOCIAL_PLANNER_INTELLIGENCE_COMPOSED_TEXT_MAX_CHARS =
  48_000 as const;

/** Structured object hard cap after per-section clamps (includes full L2 calendar). */
export const SOCIAL_PLANNER_INTELLIGENCE_STRUCTURED_MAX_CHARS = 96_000 as const;

export const SOCIAL_PLANNER_INTELLIGENCE_LIMITS = {
  fieldTruncate: SOCIAL_PLANNER_FIELD_TRUNCATE_CHARS,
  fingerprintTruncate: SOCIAL_PLANNER_FINGERPRINT_CHARS,
  trendSocialInstructionMaxChars:
    SOCIAL_PLANNER_TREND_SOCIAL_INSTRUCTION_MAX_CHARS,
  items: SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS,
  consider: SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS,
  sections: SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS,
  composedTextMaxChars: SOCIAL_PLANNER_INTELLIGENCE_COMPOSED_TEXT_MAX_CHARS,
  structuredMaxChars: SOCIAL_PLANNER_INTELLIGENCE_STRUCTURED_MAX_CHARS,
} as const;

export function truncateSocialPlannerText(
  value: string,
  max: number,
): { text: string; truncated: boolean } {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return { text: trimmed, truncated: false };
  }
  return {
    text: `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`,
    truncated: true,
  };
}

export function clampSocialPlannerBlock(
  value: string,
  max: number,
): { text: string; truncated: boolean } {
  if (value.length <= max) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`,
    truncated: true,
  };
}

export function optionalTruncatedText(
  value: string | null | undefined,
  max: number = SOCIAL_PLANNER_FIELD_TRUNCATE_CHARS,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return truncateSocialPlannerText(trimmed, max).text;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function shrinkStringLeaves(node: unknown, maxLen: number): void {
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      const entry = node[index];
      if (typeof entry === "string" && entry.length > maxLen) {
        node[index] = truncateSocialPlannerText(entry, maxLen).text;
      } else {
        shrinkStringLeaves(entry, maxLen);
      }
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string" && entry.length > maxLen) {
      record[key] = truncateSocialPlannerText(entry, maxLen).text;
    } else {
      shrinkStringLeaves(entry, maxLen);
    }
  }
}

function dropTrailingArrayItems(node: unknown): boolean {
  if (Array.isArray(node)) {
    if (node.length === 0) return false;
    node.pop();
    return true;
  }
  if (!node || typeof node !== "object") return false;
  const arrays = Object.values(node).filter(Array.isArray) as unknown[][];
  for (let index = arrays.length - 1; index >= 0; index -= 1) {
    if (arrays[index].length > 0) {
      arrays[index].pop();
      return true;
    }
  }
  return false;
}

/**
 * Keep structured sections valid JSON while enforcing a character budget.
 * Drops trailing array items last; never slices through a JSON token.
 */
export function fitStructuredSection<T>(
  value: T,
  maxChars: number,
): { value: T; truncated: boolean; chars: number } {
  if (JSON.stringify(value).length <= maxChars) {
    return { value, truncated: false, chars: JSON.stringify(value).length };
  }

  const next = cloneJson(value);
  let maxLen = SOCIAL_PLANNER_FIELD_TRUNCATE_CHARS;
  while (JSON.stringify(next).length > maxChars && maxLen >= 40) {
    shrinkStringLeaves(next, maxLen);
    maxLen -= 40;
  }
  while (JSON.stringify(next).length > maxChars && dropTrailingArrayItems(next)) {
    // continue dropping
  }

  return {
    value: next,
    truncated: true,
    chars: JSON.stringify(next).length,
  };
}
