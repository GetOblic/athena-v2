import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { excludeReleasedOnlyGetOblicProspectsFromLibrary } from "../../services/prospects/prospectLibraryEnrichment";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const MANUAL = "manual-1";
const LINKED = "linked-1";
const CLAIMING = "claiming-1";
const REMOTE_MISSING = "remote-missing-1";
const RELEASED = "released-1";

function presence(input: {
  history: string[];
  active: string[];
}) {
  return {
    historyProspectIds: new Set(input.history),
    activeProspectIds: new Set(input.active),
  };
}

describe("Prospects library released GetOblic visibility", () => {
  it("hides a released-only GetOblic Prospect from the library", () => {
    const visible = excludeReleasedOnlyGetOblicProspectsFromLibrary(
      [{ id: RELEASED }],
      presence({
        history: [RELEASED],
        active: [],
      }),
    );
    assert.deepEqual(visible.map((row) => row.id), []);
  });

  it("keeps an active linked GetOblic Prospect visible", () => {
    const visible = excludeReleasedOnlyGetOblicProspectsFromLibrary(
      [{ id: LINKED }],
      presence({
        history: [LINKED],
        active: [LINKED],
      }),
    );
    assert.deepEqual(visible.map((row) => row.id), [LINKED]);
  });

  it("keeps a claiming GetOblic Prospect visible", () => {
    const visible = excludeReleasedOnlyGetOblicProspectsFromLibrary(
      [{ id: CLAIMING }],
      presence({
        history: [CLAIMING],
        active: [CLAIMING],
      }),
    );
    assert.deepEqual(visible.map((row) => row.id), [CLAIMING]);
  });

  it("keeps a remote_missing GetOblic Prospect visible", () => {
    const visible = excludeReleasedOnlyGetOblicProspectsFromLibrary(
      [{ id: REMOTE_MISSING }],
      presence({
        history: [REMOTE_MISSING],
        active: [REMOTE_MISSING],
      }),
    );
    assert.deepEqual(visible.map((row) => row.id), [REMOTE_MISSING]);
  });

  it("keeps a manual Prospect with no GetOblic relationship visible", () => {
    const visible = excludeReleasedOnlyGetOblicProspectsFromLibrary(
      [{ id: MANUAL }],
      presence({
        history: [],
        active: [],
      }),
    );
    assert.deepEqual(visible.map((row) => row.id), [MANUAL]);
  });

  it("filters only released-only GetOblic Prospects from a mixed library", () => {
    const visible = excludeReleasedOnlyGetOblicProspectsFromLibrary(
      [
        { id: MANUAL },
        { id: LINKED },
        { id: CLAIMING },
        { id: REMOTE_MISSING },
        { id: RELEASED },
      ],
      presence({
        history: [LINKED, CLAIMING, REMOTE_MISSING, RELEASED],
        active: [LINKED, CLAIMING, REMOTE_MISSING],
      }),
    );
    assert.deepEqual(
      visible.map((row) => row.id),
      [MANUAL, LINKED, CLAIMING, REMOTE_MISSING],
    );
  });

  it("loads the /prospects library through the bounded filter, not shared getProspects()", () => {
    const page = read("app/prospects/page.tsx");
    const enrichment = read("services/prospects/prospectLibraryEnrichment.ts");
    const estimate = read("services/estimate/athenaEstimateOrchestration.ts");
    const ads = read("services/ads/adsContextComposer.ts");
    const social = read(
      "services/socialPlanner/intelligence/socialPlannerIntelligenceSources.ts",
    );
    assert.match(page, /loadProspectsForLibrary/);
    assert.doesNotMatch(page, /getProspects\(/);
    assert.match(enrichment, /excludeReleasedOnlyGetOblicProspectsFromLibrary/);
    assert.match(enrichment, /getGetOblicProspectLinkPresence/);
    assert.match(estimate, /getProspects\(organizationId\)/);
    assert.match(ads, /getProspects\(organizationId\)/);
    assert.match(social, /getProspects\(assertOrganizationId\(organizationId\)\)/);
  });
});
