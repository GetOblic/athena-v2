import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { socialPlannerGenerationModeLabel } from "../../components/socialPlanner/socialPlannerLabels";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L9 Ask Athena UI", () => {
  it("renders Ask Athena in the reserved slot on Ready calendars only", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const panel = read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx");
    assert.match(detail, /data-ask-athena-slot/);
    assert.match(detail, /SocialPlannerAskAthenaPanel/);
    assert.doesNotMatch(detail, /Ask Athena About This Calendar/);
    assert.match(panel, /Ask Athena About This Calendar/);
    assert.match(panel, /Send/);
    assert.match(panel, /Apply Athena&apos;s Suggestions/);
    assert.match(panel, /messages.length > 0 && onApply/);
    assert.doesNotMatch(panel, /sessionStorage/);
    const processingBlock = detail.slice(
      detail.indexOf("if (isSocialPlannerInFlight"),
      detail.indexOf("Processing Failed"),
    );
    assert.doesNotMatch(processingBlock, /<SocialPlannerAskAthenaPanel/);
    assert.match(detail, /onDiscussWithAthena=\{handleDiscussWithAthena\}/);
    assert.match(panel, /data-social-planner-discuss-focus/);
    assert.match(panel, /id="social-planner-conversation"/);
    assert.match(panel, /id="social-planner-conversation-input"/);
    assert.match(panel, /assetReference: \{ date: assetReference\.date \}/);
    assert.match(panel, /key=\{props\.calendarId\}/);
    assert.doesNotMatch(panel, /key=\{.*assetReference/);
  });

  it("Apply posts to conversation/apply, then pushes the revision detail route", () => {
    const detailWorkspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(detailWorkspace, /applySocialPlannerConversationRequest\(detail.id\)/);
    assert.match(detailWorkspace, /router.push\(`\/social-planner\/\$\{created.id\}`\)/);
    assert.doesNotMatch(detailWorkspace, /selectCalendar|\?id=|history.replaceState/);
    assert.match(client, /\/api\/social-planner\/\$\{sourceId\}\/conversation\/apply/);
    assert.match(client, /202/);
    assert.doesNotMatch(detailWorkspace, /applySocialPlannerConversationRequest\(.*message/);
  });

  it("labels conversation_revision as Conversation Revision and keeps history flat", () => {
    assert.equal(
      socialPlannerGenerationModeLabel("conversation_revision"),
      "Conversation Revision",
    );
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /socialPlannerGenerationModeLabel/);
    assert.doesNotMatch(history, /family tree|derived from/i);
    assert.equal(existsSync(join(ROOT, "app/social-planner/conversation")), false);
  });
});
