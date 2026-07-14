/**
 * Client-selectable usage tags for Deployment Assets and Blueprint prompts.
 * Tracking metadata only — never consumed by Brain, prompts, generation, or publication.
 */

export const ASSET_USAGE_TAGS = [
  "selected",
  "scheduled",
  "sent",
  "published",
  "used",
] as const;

export type AssetUsageTag = (typeof ASSET_USAGE_TAGS)[number];

export const ASSET_USAGE_TAG_LABELS: Record<AssetUsageTag, string> = {
  selected: "Selected",
  scheduled: "Scheduled",
  sent: "Sent",
  published: "Published",
  used: "Used",
};

const USAGE_TAG_SET = new Set<string>(ASSET_USAGE_TAGS);

/** Durable Done remains interaction_type = copied. */
export const COPIED_INTERACTION_TYPE = "copied" as const;

export function isAssetUsageTag(
  value: string | null | undefined,
): value is AssetUsageTag {
  return Boolean(value && USAGE_TAG_SET.has(value));
}

export function parseAssetUsageTag(
  value: unknown,
): AssetUsageTag | null {
  const tag = String(value ?? "")
    .trim()
    .toLowerCase();
  return isAssetUsageTag(tag) ? tag : null;
}
