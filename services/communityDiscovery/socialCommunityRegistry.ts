import { facebookGroupsPlatformAdapter } from "@/services/communityDiscovery/facebookGroupsUrl";
import {
  parseSocialCommunityHttpUrl,
  SOCIAL_COMMUNITY_PLATFORMS,
  type NormalizeSocialCommunityUrlResult,
  type SocialCommunityPlatform,
  type SocialCommunityPlatformAdapter,
} from "@/services/communityDiscovery/socialCommunityPlatform";

/**
 * V1 registry. Facebook Groups is the only adapter.
 * Adding Reddit means adding a platform id and an adapter together.
 */
const adapters: Record<SocialCommunityPlatform, SocialCommunityPlatformAdapter> = {
  facebook_groups: facebookGroupsPlatformAdapter,
};

export function socialCommunityPlatformAdapter(
  platform: SocialCommunityPlatform,
): SocialCommunityPlatformAdapter {
  return adapters[platform];
}

/** Normalize a public community URL with the registered platform adapters. */
export function normalizeSocialCommunityUrl(
  input: string,
): NormalizeSocialCommunityUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (!parseSocialCommunityHttpUrl(trimmed)) return { ok: false, reason: "invalid_url" };

  let notACommunity = false;
  for (const platform of SOCIAL_COMMUNITY_PLATFORMS) {
    const result = socialCommunityPlatformAdapter(platform).normalizeUrl(trimmed);
    if (result.ok) return result;
    if (result.reason === "invalid_url") return result;
    if (result.reason === "not_a_community") notACommunity = true;
  }

  if (notACommunity) return { ok: false, reason: "not_a_community" };
  return { ok: false, reason: "unsupported_platform" };
}
