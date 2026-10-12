import {
  parseSocialCommunityHttpUrl,
  type NormalizeSocialCommunityUrlResult,
  type SocialCommunityPlatformAdapter,
  type SocialCommunityUrlRejection,
} from "@/services/communityDiscovery/socialCommunityPlatform";

export const FACEBOOK_GROUPS_PLATFORM = "facebook_groups" as const;

export const FACEBOOK_GROUPS_CANONICAL_ORIGIN = "https://www.facebook.com";

/** Hosts that serve a Facebook Groups URL. Shorteners and login redirects are excluded. */
export const FACEBOOK_GROUPS_URL_HOSTS = [
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "mbasic.facebook.com",
  "web.facebook.com",
  "touch.facebook.com",
  "fb.com",
  "www.fb.com",
] as const;

/**
 * First path segments under /groups/ that are Facebook listing pages,
 * not a community key.
 */
export const FACEBOOK_GROUPS_RESERVED_KEYS = [
  "feed",
  "discover",
  "search",
  "create",
  "joins",
  "categories",
  "category",
] as const;

/** Shared with the catalog check. POSIX form, valid in JavaScript as well. */
export const FACEBOOK_GROUPS_IDENTITY_PATTERN =
  "^[a-z0-9]([a-z0-9]|[-.][a-z0-9])*$";

/** 6 to 20 digits, no leading zero. */
export const FACEBOOK_GROUPS_NUMERIC_IDENTITY_PATTERN = "^[1-9][0-9]{5,19}$";

export const FACEBOOK_GROUPS_IDENTITY_MIN_LENGTH = 2;
export const FACEBOOK_GROUPS_IDENTITY_MAX_LENGTH = 80;

const IDENTITY_PATTERN = new RegExp(FACEBOOK_GROUPS_IDENTITY_PATTERN);
const NUMERIC_IDENTITY_PATTERN = new RegExp(
  FACEBOOK_GROUPS_NUMERIC_IDENTITY_PATTERN,
);
const RESERVED_KEYS = new Set<string>(FACEBOOK_GROUPS_RESERVED_KEYS);
const HOSTS = new Set<string>(FACEBOOK_GROUPS_URL_HOSTS);

function reject(
  reason: SocialCommunityUrlRejection,
): NormalizeSocialCommunityUrlResult {
  return { ok: false, reason };
}

function decodePathSegment(segment: string): string | null {
  if (segment.includes("%") === false) return segment;
  try {
    const decoded = decodeURIComponent(segment);
    if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("%")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Collapse a Facebook Groups URL to its public group key.
 * Equivalent hosts, schemes, queries, fragments, and subpages share one key.
 * A numeric id and a vanity slug are different keys.
 */
export function normalizeFacebookGroupsUrl(
  input: string,
): NormalizeSocialCommunityUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return reject("empty");

  const url = parseSocialCommunityHttpUrl(trimmed);
  if (!url) return reject("invalid_url");
  if (!HOSTS.has(url.hostname.toLowerCase())) return reject("not_this_platform");

  const segments: string[] = [];
  for (const segment of url.pathname.split("/")) {
    if (!segment) continue;
    const decoded = decodePathSegment(segment);
    if (decoded === null) return reject("invalid_url");
    segments.push(decoded);
  }

  if (segments.length < 2 || segments[0].toLowerCase() !== "groups") {
    return reject("not_a_community");
  }

  const canonicalIdentity = segments[1].toLowerCase();
  if (
    canonicalIdentity.length < FACEBOOK_GROUPS_IDENTITY_MIN_LENGTH ||
    canonicalIdentity.length > FACEBOOK_GROUPS_IDENTITY_MAX_LENGTH ||
    !IDENTITY_PATTERN.test(canonicalIdentity) ||
    RESERVED_KEYS.has(canonicalIdentity)
  ) {
    return reject("not_a_community");
  }

  const numeric = /^[0-9]+$/.test(canonicalIdentity);
  if (numeric && !NUMERIC_IDENTITY_PATTERN.test(canonicalIdentity)) {
    return reject("not_a_community");
  }

  return {
    ok: true,
    community: {
      platform: FACEBOOK_GROUPS_PLATFORM,
      canonicalIdentity,
      canonicalUrl: `${FACEBOOK_GROUPS_CANONICAL_ORIGIN}/groups/${canonicalIdentity}`,
    },
  };
}

export const facebookGroupsPlatformAdapter: SocialCommunityPlatformAdapter = {
  platform: FACEBOOK_GROUPS_PLATFORM,
  normalizeUrl: normalizeFacebookGroupsUrl,
};
