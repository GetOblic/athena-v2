import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveProspectDisplayStatus } from "../../services/prospects/prospectDisplay";
import {
  buildHomePipelineData,
  homeIntelligenceBucket,
  isHomeHighCompleteness,
  type HomeProspectProjection,
} from "../../lib/home/homePipeline";

const ROOT = process.cwd();

function row(
  partial: Partial<HomeProspectProjection> & { id: string },
): HomeProspectProjection {
  return {
    displayStatus: "Queued",
    lifecycleStatus: "New",
    completeness: 20,
    getoblicStatus: null,
    ...partial,
  };
}

describe("Home pipeline aggregation", () => {
  it("applies library released-only exclusion before Home totals", () => {
    const helper = readFileSync(
      join(ROOT, "services/home/homeReadService.ts"),
      "utf8",
    );
    assert.match(helper, /excludeReleasedOnlyGetOblicProspectsFromLibrary/);
    assert.match(helper, /getGetOblicProspectLinkPresence/);
    const data = buildHomePipelineData([
      row({
        id: "keep-active",
        displayStatus: "Ready",
        completeness: 80,
      }),
      row({
        id: "never-held",
        displayStatus: "Ready",
        completeness: 80,
      }),
    ]);
    assert.equal(data.libraryCount, 2);
    assert.equal(data.workingCount, 2);
  });

  it("uses display status, not raw prospect status, for Ready", () => {
    const displayReady = resolveProspectDisplayStatus({
      prospectStatus: "Queued",
      hasCurrentVersion: true,
      hasCompleteCurrentVersion: true,
    });
    const displayNotReady = resolveProspectDisplayStatus({
      prospectStatus: "Ready",
      hasCurrentVersion: true,
      hasCompleteCurrentVersion: false,
    });
    assert.equal(displayReady, "Ready");
    assert.notEqual(displayNotReady, "Ready");

    const data = buildHomePipelineData([
      row({ id: "complete", displayStatus: displayReady, completeness: 40 }),
      row({
        id: "incomplete",
        displayStatus: displayNotReady,
        completeness: 90,
      }),
    ]);
    assert.equal(data.readyCount, 1);
    assert.deepEqual(data.readyIds, ["complete"]);
    assert.equal(data.strongCount, 1);
    assert.equal(data.strongNotProgressingCount, 0);
  });

  it("does not treat high completeness as Ready", () => {
    assert.equal(isHomeHighCompleteness(70), true);
    const data = buildHomePipelineData([
      row({
        id: "strong-queued",
        displayStatus: "Queued",
        completeness: 92,
      }),
    ]);
    assert.equal(data.strongCount, 1);
    assert.equal(data.readyCount, 0);
    assert.equal(homeIntelligenceBucket("Queued"), "in_progress");
  });

  it("excludes Not a Fit and Completed from working totals", () => {
    const data = buildHomePipelineData([
      row({ id: "new", lifecycleStatus: "New", displayStatus: "Ready" }),
      row({
        id: "fit",
        lifecycleStatus: "Not a Fit",
        displayStatus: "Ready",
        completeness: 88,
      }),
      row({
        id: "done",
        lifecycleStatus: "Completed",
        displayStatus: "Processing Failed",
      }),
    ]);
    assert.equal(data.libraryCount, 3);
    assert.equal(data.workingCount, 1);
    assert.equal(data.terminalCount, 2);
    assert.equal(data.readyCount, 1);
    assert.equal(data.failedCount, 0);
    assert.equal(data.strongCount, 0);
  });

  it("buckets intelligence with Saved as missing", () => {
    const data = buildHomePipelineData([
      row({ id: "ready", displayStatus: "Ready" }),
      row({ id: "queued", displayStatus: "Queued" }),
      row({ id: "processing", displayStatus: "Processing" }),
      row({
        id: "learning",
        displayStatus: "Learning from Website",
      }),
      row({
        id: "generating",
        displayStatus: "Generating Executive Intelligence",
      }),
      row({ id: "failed", displayStatus: "Processing Failed" }),
      row({ id: "saved", displayStatus: "Saved" }),
    ]);
    assert.equal(data.readyCount, 1);
    assert.equal(data.inProgressCount, 4);
    assert.equal(data.failedCount, 1);
    assert.equal(data.missingCount, 1);
    assert.deepEqual(data.missingIds, ["saved"]);
  });

  it("counts held listings without ready intelligence", () => {
    const data = buildHomePipelineData([
      row({
        id: "held-ready",
        displayStatus: "Ready",
        getoblicStatus: "linked",
      }),
      row({
        id: "held-queued",
        displayStatus: "Queued",
        getoblicStatus: "claiming",
      }),
      row({
        id: "held-missing-remote",
        displayStatus: "Saved",
        getoblicStatus: "remote_missing",
      }),
    ]);
    assert.equal(data.heldWithoutReadyCount, 2);
    assert.deepEqual(data.heldWithoutReadyIds, [
      "held-queued",
      "held-missing-remote",
    ]);
  });
});
