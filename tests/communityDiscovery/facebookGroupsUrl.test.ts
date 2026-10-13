/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3A — Facebook Groups URL identity.
 * Pure functions. No network and no database.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FACEBOOK_GROUPS_RESERVED_KEYS,
  FACEBOOK_GROUPS_URL_HOSTS,
  facebookGroupsPlatformAdapter,
  facebookGroupsListingKind,
  normalizeFacebookGroupsUrl,
} from "../../services/communityDiscovery/facebookGroupsUrl";
import {
  normalizeSocialCommunityUrl,
  socialCommunityPlatformAdapter,
} from "../../services/communityDiscovery/socialCommunityRegistry";
import {
  SOCIAL_COMMUNITY_PLATFORMS,
  type CanonicalSocialCommunity,
} from "../../services/communityDiscovery/socialCommunityPlatform";

const GROUP_ID = "123456789012345";
const GROUP_SLUG = "independent-retailers";

function communityFrom(input: string): CanonicalSocialCommunity {
  const result = normalizeSocialCommunityUrl(input);
  assert.equal(result.ok, true, input);
  if (!result.ok) throw new Error(input);
  return result.community;
}

describe("Facebook Groups URL identity", () => {
  it("registers Facebook Groups only", () => {
    assert.deepEqual(SOCIAL_COMMUNITY_PLATFORMS, ["facebook_groups"]);
    assert.equal(facebookGroupsPlatformAdapter.platform, "facebook_groups");
    assert.equal(
      facebookGroupsPlatformAdapter.normalizeUrl,
      normalizeFacebookGroupsUrl,
    );
    assert.equal(
      socialCommunityPlatformAdapter("facebook_groups"),
      facebookGroupsPlatformAdapter,
    );
  });

  it("collapses host, scheme, slash, query, fragment, and subpages to one key", () => {
    const expected = communityFrom(
      `https://www.facebook.com/groups/${GROUP_ID}`,
    );
    const equivalents = [
      `http://facebook.com/groups/${GROUP_ID}`,
      `https://m.facebook.com/groups/${GROUP_ID}/`,
      `https://mbasic.facebook.com/groups/${GROUP_ID}/about`,
      `https://web.facebook.com/groups/${GROUP_ID}?ref=share&locale=fr_FR`,
      `https://touch.facebook.com/groups/${GROUP_ID}#members`,
      `https://www.fb.com/groups/${GROUP_ID}/permalink/999999`,
      `HTTPS://WWW.FACEBOOK.COM/groups/${GROUP_ID}/posts/42/`,
      `  https://www.facebook.com/groups/${GROUP_ID}/members?hoisted_section_header_type=recently_seen  `,
    ];

    for (const input of equivalents) {
      assert.deepEqual(communityFrom(input), expected, input);
    }

    assert.equal(expected.platform, "facebook_groups");
    assert.equal(expected.canonicalIdentity, GROUP_ID);
    assert.equal(
      expected.canonicalUrl,
      `https://www.facebook.com/groups/${GROUP_ID}`,
    );
    assert.deepEqual(communityFrom(expected.canonicalUrl), expected);
    assert.deepEqual(
      communityFrom("https://www.facebook.com/groups/Independent%2DRetailers"),
      communityFrom("https://www.facebook.com/groups/independent-retailers"),
    );
  });

  it("case-folds a vanity slug and keeps it distinct from a numeric id", () => {
    const slug = communityFrom(
      `https://www.facebook.com/groups/${GROUP_SLUG.toUpperCase()}`,
    );
    const byId = communityFrom(
      `https://m.facebook.com/groups/${GROUP_ID}/`,
    );

    assert.equal(slug.canonicalIdentity, GROUP_SLUG);
    assert.equal(
      slug.canonicalUrl,
      `https://www.facebook.com/groups/${GROUP_SLUG}`,
    );
    assert.notEqual(slug.canonicalIdentity, byId.canonicalIdentity);
    assert.notEqual(slug.canonicalUrl, byId.canonicalUrl);
  });

  it("accepts a dotted slug and a minimum-length numeric id", () => {
    const dotted = communityFrom(
      "https://facebook.com/groups/My.Group-Name/",
    );
    assert.equal(dotted.canonicalIdentity, "my.group-name");

    const shortId = communityFrom("https://www.facebook.com/groups/123456");
    assert.equal(shortId.canonicalIdentity, "123456");

    const maxSlug = `a${"b".repeat(79)}`;
    assert.equal(
      communityFrom(`https://www.facebook.com/groups/${maxSlug}`).canonicalIdentity,
      maxSlug,
    );
  });

  it("rejects non-communities, reserved group routes, and unsafe URLs", () => {
    const cases: Array<[string, string]> = [
      ["", "empty"],
      ["   ", "empty"],
      ["not a url", "invalid_url"],
      ["javascript:alert(1)", "invalid_url"],
      ["ftp://facebook.com/groups/123456789012345", "invalid_url"],
      [
        "https://user:pass@www.facebook.com/groups/123456789012345",
        "invalid_url",
      ],
      [
        "https://www.facebook.com:444/groups/123456789012345",
        "invalid_url",
      ],
      ["https://www.reddit.com/r/smallbusiness", "unsupported_platform"],
      [
        "https://lm.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Fgroups%2F123456789012345",
        "unsupported_platform",
      ],
      ["https://www.facebook.com/getoblic", "not_a_community"],
      ["https://www.facebook.com/groups", "not_a_community"],
      ["https://www.facebook.com/groups/feed", "not_a_community"],
      ["https://www.facebook.com/groups/discover/", "not_a_community"],
      ["https://www.facebook.com/groups/12345", "not_a_community"],
      ["https://www.facebook.com/groups/012345678901234", "not_a_community"],
      ["https://www.facebook.com/groups/my_group", "not_a_community"],
      ["https://facebook.com.evil.example/groups/123456789012345", "unsupported_platform"],
      ["https://www.facebook.com/groups/123456789012345/../../pages", "not_a_community"],
      [`https://www.facebook.com/groups/${"a".repeat(81)}`, "not_a_community"],
      ["https://www.facebook.com/groups/my..group", "not_a_community"],
    ];

    for (const [input, reason] of cases) {
      const result = normalizeSocialCommunityUrl(input);
      assert.equal(result.ok, false, input);
      if (!result.ok) assert.equal(result.reason, reason, input);
    }
  });

  it("does not treat a Facebook page as another platform", () => {
    const direct = normalizeFacebookGroupsUrl("https://www.facebook.com/getoblic");
    assert.deepEqual(direct, { ok: false, reason: "not_a_community" });
  });

  it("keeps every accepted host on the canonical facebook.com group URL", () => {
    for (const host of FACEBOOK_GROUPS_URL_HOSTS) {
      const community = communityFrom(
        `https://${host}/groups/${GROUP_SLUG}/about?ref=1`,
      );
      assert.equal(
        community.canonicalUrl,
        `https://www.facebook.com/groups/${GROUP_SLUG}`,
        host,
      );
    }
  });

  it("distinguishes a group root from post and permalink URLs", () => {
    assert.equal(
      facebookGroupsListingKind(`https://www.facebook.com/groups/${GROUP_ID}`),
      "group_root",
    );
    assert.equal(
      facebookGroupsListingKind(
        `https://m.facebook.com/groups/${GROUP_SLUG}/?ref=share`,
      ),
      "group_root",
    );
    assert.equal(
      facebookGroupsListingKind(
        `HTTPS://WWW.FACEBOOK.COM/groups/${GROUP_ID}/posts/42/`,
      ),
      "post",
    );
    assert.equal(
      facebookGroupsListingKind(
        `https://www.fb.com/groups/${GROUP_ID}/permalink/999999`,
      ),
      "post",
    );
    assert.equal(
      facebookGroupsListingKind(
        `https://mbasic.facebook.com/groups/${GROUP_ID}/about`,
      ),
      "subpage",
    );
    assert.equal(facebookGroupsListingKind("https://www.reddit.com/r/retail"), null);

    const postUrl = `https://www.facebook.com/groups/${GROUP_ID}/posts/42/?ref=share`;
    assert.equal(facebookGroupsListingKind(postUrl), "post");
    assert.deepEqual(
      communityFrom(postUrl),
      communityFrom(`https://www.facebook.com/groups/${GROUP_ID}`),
    );
  });

  it("reserves Facebook listing keys", () => {
    for (const key of FACEBOOK_GROUPS_RESERVED_KEYS) {
      const result = normalizeFacebookGroupsUrl(
        `https://www.facebook.com/groups/${key}`,
      );
      assert.deepEqual(result, { ok: false, reason: "not_a_community" }, key);
    }
  });
});
