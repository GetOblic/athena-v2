/**
 * Presentation-only grouping of already-parsed Prospect deployment assets.
 * Does not rename keys, alter packages, or invent assets.
 */

export type ProspectOutreachAssetLike = {
  assetKey?: string;
  title: string;
  objective: string;
  content: string;
};

const OUTREACH_KEYS = new Set([
  "personalized_outreach_email",
  "email_outreach",
  "cold_email",
  "follow_up_email",
  "linkedin_connection",
  "linkedin_follow_up",
  "cold_call_opening",
  "discovery_questions",
  "personalized_value_proposition",
  "objection_anticipation",
  "objection_handling",
  "meeting_preparation",
  "recommended_cta",
  "follow_up_sequence",
  "personalized_video_script",
  "whatsapp_outreach",
]);

const OTHER_KEYS = new Set([
  "newsletter_idea",
  "blog_post_idea",
  "knowledge_base_enhancement",
  "hidden_gems",
  "substack_post",
  "substack_note",
  "reddit_post",
  "skool_post",
  "skool_course_idea",
  "social_voice_post",
  "social_post",
  "short_video_prompt",
  "visual_message_prompt",
  "local_outreach_image_prompt",
  "community_reply",
  "private_message",
  "follow_up",
  "call_to_action",
]);

function normalizeAssetIdentity(asset: ProspectOutreachAssetLike): string {
  return (asset.assetKey ?? asset.title).trim().toLowerCase().replace(
    /\s+/g,
    "_",
  );
}

function hasContent(asset: ProspectOutreachAssetLike): boolean {
  return Boolean(asset.content?.trim());
}

export function groupProspectOutreachAssets<T extends ProspectOutreachAssetLike>(
  assets: readonly T[],
): { outreach: T[]; other: T[] } {
  const outreach: T[] = [];
  const other: T[] = [];

  for (const asset of assets) {
    if (!hasContent(asset)) {
      continue;
    }
    const key = normalizeAssetIdentity(asset);
    if (OUTREACH_KEYS.has(key)) {
      outreach.push(asset);
    } else if (OTHER_KEYS.has(key)) {
      other.push(asset);
    } else {
      other.push(asset);
    }
  }

  return { outreach, other };
}

export function findProspectAssetByKeys<T extends ProspectOutreachAssetLike>(
  assets: readonly T[],
  keys: readonly string[],
): T | null {
  const wanted = new Set(keys.map((key) => key.trim().toLowerCase()));
  for (const asset of assets) {
    if (!hasContent(asset)) {
      continue;
    }
    if (wanted.has(normalizeAssetIdentity(asset))) {
      return asset;
    }
  }
  return null;
}
