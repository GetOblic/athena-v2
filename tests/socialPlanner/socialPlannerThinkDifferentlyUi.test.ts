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
    const detailWorkspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    assert.match(detail, /data-ready-actions/);
    assert.match(detail, /copy\.thinkDifferently/);
    assert.match(detail, /copy\.thinkDifferentlyTitle/);
    assert.match(detail, /copy\.createAnotherWeek/);
    assert.match(
      detailWorkspace,
      /detail.status === "Ready" && detail.package && !detail.packageUnavailable/,
    );
    assert.doesNotMatch(detail, /Regenerate|Try Again|Alternative Version/);
    assert.doesNotMatch(detail, /confirm\(/);
    assert.match(detail, /SocialPlannerAskAthenaPanel/);
    assert.match(detail, /data-ask-athena-slot/);
    assert.match(
      read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx"),
      /copy\.askAthenaTitle/,
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
      detail.indexOf("copy.yourSocialWeek"),
    );
    assert.doesNotMatch(processingBlock, /copy\.thinkDifferently/);
    assert.doesNotMatch(failedBlock, /copy\.thinkDifferently/);
    assert.doesNotMatch(malformedBlock, /copy\.thinkDifferently/);
    assert.match(failedBlock, /copy\.createAnotherWeek/);
    assert.match(malformedBlock, /copy\.createAnotherWeek/);
  });

  it("posts to the source id, disables only while pending, then pushes the derivative detail route", () => {
    const detailWorkspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(detailWorkspace, /thinkDifferentlySocialCalendarRequest\(\s*detail.id/);
    assert.match(detailWorkspace, /router.push\(`\/social-planner\/\$\{created.id\}`\)/);
    assert.doesNotMatch(detailWorkspace, /selectCalendar|queuedDetailFromCreate|\?id=/);
    assert.match(detailWorkspace, /thinkDifferentlyPending/);
    assert.match(client, /\/api\/social-planner\/\$\{sourceId\}\/think-differently/);
    assert.match(client, /202/);
    assert.doesNotMatch(detailWorkspace, /window.confirm/);
    assert.equal(
      mapSocialPlannerApiError(409, { message: "Not ready." }, ""),
      "Not ready.",
    );
  });

  it("history shows Think Differently and Version n without a family tree", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /formatSocialPlannerVersionLabel/);
    assert.match(history, /getLocalizedSocialPlannerGenerationModeLabel/);
    assert.doesNotMatch(history, /derived from|family tree|source version/i);
    assert.equal(socialPlannerGenerationModeLabel("think_differently"), "Think Differently");
  });

  it("uses Prospect Think Differently green on the Ready-detail action only", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const prospect = read("components/prospects/ProspectRefreshIntelligenceButton.tsx");
    const thinkStart = detail.indexOf("copy.thinkDifferentlyTitle");
    const thinkBlock = detail.slice(
      detail.lastIndexOf("<button", thinkStart),
      detail.indexOf("</button>", thinkStart),
    );
    const createAnother = detail.slice(
      detail.indexOf("copy.createAnotherWeek") - 400,
      detail.indexOf("copy.createAnotherWeek") + 80,
    );

    const prospectPresentation = read(
      "lib/prospects/prospectDetailPresentation.ts",
    );
    assert.match(prospect, /PROSPECT_SECONDARY_GREEN_ACTION/);
    assert.match(
      prospectPresentation,
      /PROSPECT_SECONDARY_GREEN_ACTION[\s\S]*border border-\[var\(--athena-success\)\]\/30/,
    );
    assert.match(
      prospectPresentation,
      /PROSPECT_SECONDARY_GREEN_ACTION[\s\S]*text-\[var\(--athena-success\)\]/,
    );
    assert.match(thinkBlock, /border-\[var\(--athena-success\)\]\/30/);
    assert.match(thinkBlock, /bg-\[var\(--athena-success\)\]\/15/);
    assert.match(thinkBlock, /text-\[var\(--athena-success\)\]/);
    assert.match(thinkBlock, /hover:border-\[var\(--athena-success\)\]\/45/);
    assert.match(thinkBlock, /hover:bg-\[var\(--athena-success\)\]\/25/);
    assert.match(thinkBlock, /focus-visible:ring-\[var\(--athena-success\)\]\/50/);
    assert.doesNotMatch(thinkBlock, /athena-orange/);
    assert.doesNotMatch(createAnother, /athena-success/);
    assert.match(detail, /onClick=\{onThinkDifferently\}/);
    assert.match(detail, /disabled=\{thinkDifferentlyPending\}/);
    const createForm = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.match(createForm, /copy\.generateMyWeek/);
    assert.match(createForm, /bg-\[var\(--athena-orange\)\]/);
    assert.doesNotMatch(createForm, /Think Differently|athena-success/);
  });

  it("history Think Differently badge is green; Conversation Revision and Ready stay unchanged", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    const prospectWorkspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const presentation = read(
      "lib/socialPlanner/socialPlannerPagePresentation.ts",
    );
    const helperStart = presentation.indexOf(
      "export function socialPlannerGenerationModeBadgeClass",
    );
    const helper = presentation.slice(helperStart);

    assert.match(
      prospectWorkspace,
      /border-\[var\(--athena-success\)\]\/30 bg-\[var\(--athena-success\)\]\/10[\s\S]*text-\[var\(--athena-success\)\]/,
    );
    assert.match(
      presentation,
      /SOCIAL_MODE_THINK_CLASS[\s\S]*border border-\[var\(--athena-success\)\]\/25/,
    );
    assert.match(
      presentation,
      /SOCIAL_MODE_THINK_CLASS[\s\S]*bg-\[var\(--athena-success\)\]\/\[0\.08\]/,
    );
    assert.match(
      presentation,
      /SOCIAL_MODE_THINK_CLASS[\s\S]*text-\[var\(--athena-success\)\]\/80/,
    );
    assert.match(
      presentation,
      /SOCIAL_MODE_BADGE_CLASS[\s\S]*border-white\/10/,
    );
    assert.match(
      presentation,
      /SOCIAL_MODE_BADGE_CLASS[\s\S]*text-white\/40/,
    );
    assert.match(
      helper,
      /generationMode === "think_differently"[\s\S]*return SOCIAL_MODE_THINK_CLASS/,
    );
    assert.match(helper, /return SOCIAL_MODE_BADGE_CLASS/);
    assert.match(
      history,
      /border-emerald-400\/25 bg-emerald-400\/10 text-emerald-200/,
    );
    assert.match(history, /generationMode !== "standard"/);
    assert.doesNotMatch(history, /confirm\(|Regenerate/);
  });

  it("keeps Create Another Week as an independent return to the library composer", () => {
    const detailWorkspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    assert.match(detailWorkspace, /function handleCreateAnotherWeek/);
    assert.match(detailWorkspace, /router.push\("\/social-planner"\)/);
    assert.doesNotMatch(detailWorkspace, /selectCalendar\(null|focusComposer/);
    assert.match(detailWorkspace, /async function handleThinkDifferently/);
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
