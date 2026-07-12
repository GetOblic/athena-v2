import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  excludeProspectIntelligenceBridges,
  isProspectIntelligenceBridge,
  PROSPECT_INTELLIGENCE_PLATFORM,
} from "../../services/prospects/prospectBridgeMarker";
import {
  formatProspectOpportunityScore,
  resolveProspectDisplayStatus,
  resolveProspectOpportunityScore,
} from "../../services/prospects/prospectDisplay";

const importerSource = readFileSync(
  path.join(process.cwd(), "services/prospects/prospectImporter.ts"),
  "utf8",
);

describe("prospect scrape execution location", () => {
  it("HTTP enqueue path source does not invoke homepage scraping", () => {
    const enqueueFn = importerSource.slice(
      importerSource.indexOf(
        "export async function ensureProspectGenerationQueued",
      ),
      importerSource.indexOf(
        "export async function prepareProspectBridgeBeforeGeneration",
      ),
    );
    assert.doesNotMatch(enqueueFn, /scrapeHomepageIntelligence/);
    assert.doesNotMatch(enqueueFn, /Learning from Website/);
  });

  it("worker prep path source invokes homepage scraping when website exists", () => {
    const prepFn = importerSource.slice(
      importerSource.indexOf(
        "export async function prepareProspectBridgeBeforeGeneration",
      ),
      importerSource.indexOf(
        "export async function markProspectGenerationReady",
      ),
    );
    assert.match(prepFn, /scrapeHomepageIntelligence/);
    assert.match(prepFn, /Learning from Website/);
  });
});

describe("prospect display status resolution", () => {
  it("maps queued and processing job states", () => {
    assert.equal(
      resolveProspectDisplayStatus({ jobStatus: "queued" }),
      "Queued",
    );
    assert.equal(
      resolveProspectDisplayStatus({ jobStatus: "processing" }),
      "Generating Executive Intelligence",
    );
    assert.equal(
      resolveProspectDisplayStatus({
        jobStatus: "processing",
        jobStage: "website_intelligence",
      }),
      "Learning from Website",
    );
    assert.equal(
      resolveProspectDisplayStatus({ jobStatus: "retryable" }),
      "Processing",
    );
    assert.equal(
      resolveProspectDisplayStatus({ jobStatus: "failed" }),
      "Processing Failed",
    );
  });

  it("shows Ready when no active job and Current Version exists", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Queued",
        hasCurrentVersion: true,
      }),
      "Ready",
    );
  });

  it("keeps Queued when no job and no Current Version", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Queued",
        hasCurrentVersion: false,
      }),
      "Queued",
    );
  });
});

describe("prospect opportunity score resolution", () => {
  it("prefers canonical score and treats zero/missing as empty", () => {
    assert.equal(
      resolveProspectOpportunityScore({
        canonicalScore: 72,
        denormalizedScore: 10,
      }),
      72,
    );
    assert.equal(
      resolveProspectOpportunityScore({
        canonicalScore: null,
        denormalizedScore: 0,
      }),
      null,
    );
    assert.equal(formatProspectOpportunityScore(null), "—");
    assert.equal(formatProspectOpportunityScore(0), "—");
    assert.equal(formatProspectOpportunityScore(88), "88");
  });

  it("historical score stays independent from current denormalized value", () => {
    const historical = resolveProspectOpportunityScore({
      canonicalScore: 41,
      denormalizedScore: 90,
    });
    const current = resolveProspectOpportunityScore({
      canonicalScore: 90,
      denormalizedScore: 90,
    });
    assert.equal(historical, 41);
    assert.equal(current, 90);
  });

  it("original version without score remains empty", () => {
    assert.equal(
      resolveProspectOpportunityScore({
        canonicalScore: null,
        denormalizedScore: null,
      }),
      null,
    );
  });
});

describe("prospect bridge isolation marker", () => {
  it("identifies prospect bridges and excludes them from discussion lists", () => {
    const bridge = {
      id: "b1",
      platform: PROSPECT_INTELLIGENCE_PLATFORM,
      title: "Acme",
    };
    const real = {
      id: "d1",
      platform: "facebook",
      title: "Real discussion",
    };
    const viaRaw = {
      id: "b2",
      platform: "other",
      raw_json: { intelligence_source: "prospect" },
    };

    assert.equal(isProspectIntelligenceBridge(bridge), true);
    assert.equal(isProspectIntelligenceBridge(real), false);
    assert.equal(isProspectIntelligenceBridge(viaRaw), true);

    const filtered = excludeProspectIntelligenceBridges([bridge, real, viaRaw]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "d1");
  });

  it("tenant-scoped marker check does not treat null discussion as bridge", () => {
    assert.equal(isProspectIntelligenceBridge(null), false);
    assert.equal(isProspectIntelligenceBridge(undefined), false);
  });
});
