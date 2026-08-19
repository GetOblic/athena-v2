import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  mapSocialPlannerApiError,
  thinkDifferentlySocialCalendarRequest,
} from "../../components/socialPlanner/socialPlannerClient";
import { socialPlannerGenerationModeLabel } from "../../components/socialPlanner/socialPlannerLabels";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L8 Think Differently UI", () => {
  it("shows Think Differently only on Ready calendars with a package", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(detail, /data-ready-actions/);
    assert.match(detail, /Think Differently/);
    assert.match(detail, /Create a materially different version of this week/);
    assert.match(detail, /Create Another Week/);
    assert.match(
      workspace,
      /detail.status === "Ready" && detail.package && !detail.packageUnavailable/,
    );
    assert.doesNotMatch(detail, /Regenerate|Try Again|Alternative Version/);
    assert.doesNotMatch(detail, /confirm\(/);
    assert.match(detail, /SocialPlannerAskAthenaPanel/);
    assert.match(detail, /data-ask-athena-slot/);
    assert.match(
      read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx"),
      /Ask Athena About This Calendar/,
    );
  });

  it("does not show Think Differently on processing, failed, or malformed Ready states", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const processingBlock = detail.slice(
      detail.indexOf("isSocialPlannerInFlight"),
      detail.indexOf("Processing Failed"),
    );
    const failedBlock = detail.slice(
      detail.indexOf("Processing Failed"),
      detail.indexOf("packageUnavailable"),
    );
    const malformedBlock = detail.slice(
      detail.indexOf("packageUnavailable"),
      detail.indexOf("Your Social Week"),
    );
    assert.doesNotMatch(processingBlock, /Think Differently/);
    assert.doesNotMatch(failedBlock, /Think Differently/);
    assert.doesNotMatch(malformedBlock, /Think Differently/);
    assert.match(failedBlock, /Create Another Week/);
    assert.match(malformedBlock, /Create Another Week/);
  });

  it("posts to the source id, disables only while pending, then selects the derivative", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(workspace, /thinkDifferentlySocialCalendarRequest\(detail.id\)/);
    assert.match(workspace, /selectCalendar\(created.id, nextDetail\)/);
    assert.match(workspace, /queuedDetailFromCreate/);
    assert.match(workspace, /thinkDifferentlyPending/);
    assert.match(client, /\/api\/social-planner\/\$\{sourceId\}\/think-differently/);
    assert.match(client, /202/);
    assert.doesNotMatch(workspace, /window.confirm/);
    assert.equal(
      mapSocialPlannerApiError(409, { message: "Not ready." }, ""),
      "Not ready.",
    );
  });

  it("history shows Think Differently and Version n without a family tree", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /Version \$\{calendar.versionNumber\}/);
    assert.match(history, /socialPlannerGenerationModeLabel/);
    assert.doesNotMatch(history, /derived from|family tree|source version/i);
    assert.equal(socialPlannerGenerationModeLabel("think_differently"), "Think Differently");
  });

  it("keeps Create Another Week as an independent standard composer action", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(workspace, /handleCreateAnotherWeek/);
    assert.match(workspace, /composerRef.current\?\.focusComposer/);
    assert.match(workspace, /selectCalendar\(null, null\)/);
    assert.match(workspace, /function handleCreateAnotherWeek/);
    assert.match(workspace, /async function handleThinkDifferently/);
  });

  it("does not add regenerate or a second Social Planner page", () => {
    assert.equal(existsSync(join(ROOT, "app/social-planner/think-differently")), false);
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(detail, /data-ask-athena-slot=""/);
    assert.doesNotMatch(detail, /creativity level|which format|what should change/i);
  });

  it("client helper exists for tests that import the request function", () => {
    assert.equal(typeof thinkDifferentlySocialCalendarRequest, "function");
  });
});
