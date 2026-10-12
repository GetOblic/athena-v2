/**
 * Platform-neutral community identity contract.
 * V1 registers Facebook Groups only. A later Reddit adapter can satisfy the
 * same interface. This contract does not search, join, post, or call a provider.
 */

export const SOCIAL_COMMUNITY_PLATFORMS = ["facebook_groups"] as const;

export type SocialCommunityPlatform = (typeof SOCIAL_COMMUNITY_PLATFORMS)[number];

export const SOCIAL_COMMUNITY_URL_REJECTIONS = [
  "empty",
  "invalid_url",
  "not_this_platform",
  "not_a_community",
  "unsupported_platform",
] as const;

export type SocialCommunityUrlRejection =
  (typeof SOCIAL_COMMUNITY_URL_REJECTIONS)[number];

/** Public identity produced by a platform adapter. No organization data. */
export type CanonicalSocialCommunity = {
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
};

export type NormalizeSocialCommunityUrlResult =
  | { ok: true; community: CanonicalSocialCommunity }
  | { ok: false; reason: SocialCommunityUrlRejection };

/**
 * Pure identity adapter. Implementations normalize a public URL.
 * They do not perform network I/O.
 */
export interface SocialCommunityPlatformAdapter {
  readonly platform: SocialCommunityPlatform;
  normalizeUrl(input: string): NormalizeSocialCommunityUrlResult;
}

export function parseSocialCommunityHttpUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.port) return null;
  return url;
}
