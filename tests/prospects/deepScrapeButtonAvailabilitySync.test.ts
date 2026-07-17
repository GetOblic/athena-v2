/**
 * Deep Scrape button: sync server initiallyAvailable into sticky client state
 * so the button appears after generation without navigate-away remount.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * Mirrors the one-way promote rule used by both Deep Scrape buttons
 * (adjust state during render when the server prop flips).
 */
function nextAvailableFromPropSync(input: {
  currentAvailable: boolean;
  syncedInitiallyAvailable: boolean;
  nextInitiallyAvailable: boolean;
}): { available: boolean; syncedInitiallyAvailable: boolean } {
  if (input.nextInitiallyAvailable === input.syncedInitiallyAvailable) {
    return {
      available: input.currentAvailable,
      syncedInitiallyAvailable: input.syncedInitiallyAvailable,
    };
  }
  return {
    syncedInitiallyAvailable: input.nextInitiallyAvailable,
    available: input.nextInitiallyAvailable
      ? true
      : input.currentAvailable,
  };
}

const PROSPECT_BUTTON =
  "components/prospects/ProspectDeepScrapeWebsiteButton.tsx";
const IDENTITY_BUTTON = "components/identity/DeepScrapeWebsiteButton.tsx";
const PROSPECT_PAGE = "app/prospects/[id]/page.tsx";
const PROSPECT_STATUS =
  "app/api/prospects/[id]/deep-scrape/status/route.ts";
const IDENTITY_STATUS = "app/api/identity/deep-scrape/status/route.ts";

const PROP_SYNC_PATTERN =
  /if \(props\.initiallyAvailable !== syncedInitiallyAvailable\) \{\s*setSyncedInitiallyAvailable\(props\.initiallyAvailable\);\s*if \(props\.initiallyAvailable\) \{\s*setAvailable\(true\);\s*\}\s*\}/s;

describe("Deep Scrape button availability sync — sync rule", () => {
  it("false → prop true becomes available without remount semantics", () => {
    const next = nextAvailableFromPropSync({
      currentAvailable: false,
      syncedInitiallyAvailable: false,
      nextInitiallyAvailable: true,
    });
    assert.equal(next.available, true);
    assert.equal(next.syncedInitiallyAvailable, true);
  });

  it("initial true stays available", () => {
    const next = nextAvailableFromPropSync({
      currentAvailable: true,
      syncedInitiallyAvailable: true,
      nextInitiallyAvailable: true,
    });
    assert.equal(next.available, true);
  });

  it("initial false remains hidden when the prop remains false", () => {
    const next = nextAvailableFromPropSync({
      currentAvailable: false,
      syncedInitiallyAvailable: false,
      nextInitiallyAvailable: false,
    });
    assert.equal(next.available, false);
  });

  it("does not demote true → false from a stale/false prop", () => {
    const next = nextAvailableFromPropSync({
      currentAvailable: true,
      syncedInitiallyAvailable: true,
      nextInitiallyAvailable: false,
    });
    assert.equal(next.available, true);
    assert.equal(next.syncedInitiallyAvailable, false);
  });
});

describe("Deep Scrape button availability sync — Prospect component", () => {
  const src = read(PROSPECT_BUTTON);

  it("synchronizes initiallyAvailable true into available state during render", () => {
    assert.match(src, /useState\(props\.initiallyAvailable\)/);
    assert.match(src, /syncedInitiallyAvailable/);
    assert.match(src, PROP_SYNC_PATTERN);
  });

  it("keeps return-null gate and does not auto-start deep scrape", () => {
    assert.match(src, /if \(!available\) \{\s*return null;\s*\}/s);
    assert.match(src, /onClick=\{\(\) => void startDeepScrape\(\)\}/);
  });

  it("status polling still begins only once available is true", () => {
    assert.match(
      src,
      /useEffect\(\(\) => \{\s*if \(!available\) return;/s,
    );
    assert.match(
      src,
      /useEffect\(\(\) => \{\s*if \(!available \|\| !isActive\) return;\s*const timer = setInterval/s,
    );
  });

  it("interval cleanup prevents duplicate polling after rerenders", () => {
    assert.match(src, /return \(\) => clearInterval\(timer\);/);
    assert.match(
      src,
      /return \(\) => \{\s*cancelled = true;\s*clearTimeout\(initial\);/s,
    );
  });

  it("busy/progress state fields are independent of prop sync", () => {
    assert.match(src, /const \[isActive, setIsActive\]/);
    assert.match(src, /const \[label, setLabel\]/);
    assert.match(src, /const \[queuing, setQueuing\]/);
    const syncBlock = src.match(PROP_SYNC_PATTERN);
    assert.ok(syncBlock);
    assert.doesNotMatch(syncBlock[0], /setIsActive|setLabel|setQueuing|setError/);
  });
});

describe("Deep Scrape button availability sync — Identity component", () => {
  const src = read(IDENTITY_BUTTON);

  it("has the same unavailable → available synchronization", () => {
    assert.match(src, /useState\(props\.initiallyAvailable\)/);
    assert.match(src, /syncedInitiallyAvailable/);
    assert.match(src, PROP_SYNC_PATTERN);
  });

  it("preserves Identity polling guard and interval cleanup", () => {
    assert.match(src, /if \(!available\) return;/);
    assert.match(src, /if \(!available \|\| !isActive\) return;/);
    assert.match(src, /return \(\) => clearInterval\(timer\);/);
  });
});

describe("Deep Scrape button availability sync — backend eligibility untouched", () => {
  it("Prospect page eligibility predicate unchanged", () => {
    const page = read(PROSPECT_PAGE);
    assert.match(
      page,
      /initiallyAvailable=\{hasCurrentVersion && Boolean\(prospect\.website\)\}/,
    );
  });

  it("Prospect and Identity status API eligibility predicates unchanged", () => {
    const prospectStatus = read(PROSPECT_STATUS);
    const identityStatus = read(IDENTITY_STATUS);
    assert.match(
      prospectStatus,
      /available:\s*Boolean\(currentVersion\) && Boolean\(prospect\.website\?\.trim\(\)\)/,
    );
    assert.match(identityStatus, /available:/);
    assert.doesNotMatch(prospectStatus, /initiallyAvailable/);
    assert.doesNotMatch(identityStatus, /initiallyAvailable/);
  });

  it("does not add continuous poll for permanently ineligible records", () => {
    const prospect = read(PROSPECT_BUTTON);
    const identity = read(IDENTITY_BUTTON);
    assert.match(prospect, /if \(!available\) return;/);
    assert.match(identity, /if \(!available\) return;/);
    assert.match(prospect, /if \(!available \|\| !isActive\) return;/);
    assert.match(identity, /if \(!available \|\| !isActive\) return;/);
    assert.equal((prospect.match(/setInterval/g) || []).length, 1);
    assert.equal((identity.match(/setInterval/g) || []).length, 1);
  });
});
