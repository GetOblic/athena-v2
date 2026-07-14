import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDiscussionWorkflowSteps } from "../../lib/discussionWorkflow";

const ROOT = join(process.cwd());

function stubAnalysis(partial?: Record<string, unknown>) {
  return {
    id: "analysis-1",
    organization_id: "org-1",
    discussion_id: "disc-1",
    community_id: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    suggested_cta: null,
    raw_json: null,
    status: "completed",
    ...partial,
  } as never;
}

describe("Sprint 2A — Workflow Progress Current Status", () => {
  it("Discussion final node uses Discussion client status, not readiness", () => {
    const steps = buildDiscussionWorkflowSteps({
      analysis: stubAnalysis(),
      opportunity: { id: "opp-1" } as never,
      briefing: { id: "brief-1" } as never,
      assetBlueprint: { id: "bp-1" } as never,
      clientStatusLabel: "Reviewing",
    });

    const final = steps[steps.length - 1];
    assert.equal(final.key, "outcome");
    assert.equal(final.label, "Current Status: Reviewing");
    assert.equal(final.complete, false);
    assert.ok(!steps.some((step) => step.label === "Outcome"));
  });

  it("Prospect final node uses lifecycle_status, not intelligence readiness", () => {
    const steps = buildDiscussionWorkflowSteps({
      analysis: stubAnalysis(),
      opportunity: null,
      briefing: null,
      assetBlueprint: null,
      clientStatusLabel: "Meeting Scheduled",
    });

    assert.equal(
      steps[steps.length - 1].label,
      "Current Status: Meeting Scheduled",
    );
    assert.ok(
      !steps.some((step) =>
        ["Queued", "Processing", "Ready", "Processing Failed"].includes(
          step.label,
        ),
      ),
    );
  });

  it("status label updates when clientStatusLabel changes", () => {
    const first = buildDiscussionWorkflowSteps({
      analysis: null,
      opportunity: null,
      briefing: null,
      assetBlueprint: null,
      clientStatusLabel: "New",
    });
    const second = buildDiscussionWorkflowSteps({
      analysis: null,
      opportunity: null,
      briefing: null,
      assetBlueprint: null,
      clientStatusLabel: "Qualified",
    });

    assert.equal(first[first.length - 1].label, "Current Status: New");
    assert.equal(second[second.length - 1].label, "Current Status: Qualified");
  });

  it("Discussion and Prospect pages pass client-controlled status into workflow", () => {
    const discussionPage = readFileSync(
      join(ROOT, "app/discussions/[id]/page.tsx"),
      "utf8",
    );
    const prospectPage = readFileSync(
      join(ROOT, "app/prospects/[id]/page.tsx"),
      "utf8",
    );

    assert.match(discussionPage, /clientStatusLabel:\s*discussion\.status/);
    assert.match(prospectPage, /clientStatusLabel:\s*lifecycleStatus/);
    assert.doesNotMatch(
      prospectPage,
      /clientStatusLabel:\s*(?:prospect\.status|intelligenceReadiness)/,
    );
  });
});
