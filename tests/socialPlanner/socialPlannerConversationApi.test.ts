import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SOCIAL_PLANNER_CONVERSATION_LIMITS } from "../../services/socialPlanner/conversation/socialPlannerConversationTypes";
import { ATHENA_CONVERSATION_LIMITS } from "../../services/athenaConversation/athenaConversationTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_FORBIDDEN_KEYS,
  normalizeConversationApplyRequest,
  validateSocialPlannerConversationRequest,
} from "../../services/socialPlanner/conversation/socialPlannerConversationValidation";
import { SocialPlannerConversationError } from "../../services/socialPlanner/conversation/socialPlannerConversationTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L9 conversation API", () => {
  it("reuses shared Athena conversation limits", () => {
    assert.equal(
      SOCIAL_PLANNER_CONVERSATION_LIMITS.maxUserMessageLength,
      ATHENA_CONVERSATION_LIMITS.maxUserMessageLength,
    );
    assert.equal(SOCIAL_PLANNER_CONVERSATION_LIMITS.maxUserMessageLength, 4_000);
    assert.equal(SOCIAL_PLANNER_CONVERSATION_LIMITS.maxAssistantMessageLength, 8_000);
    assert.equal(SOCIAL_PLANNER_CONVERSATION_LIMITS.maxHistoryMessageCount, 20);
    assert.equal(SOCIAL_PLANNER_CONVERSATION_LIMITS.maxHistoryMessageLength, 8_000);
    assert.equal(SOCIAL_PLANNER_CONVERSATION_LIMITS.maxHistoryTotalChars, 40_000);
    assert.equal(SOCIAL_PLANNER_CONVERSATION_LIMITS.maxTotalPromptChars, 100_000);
  });

  it("exposes GET/POST conversation and POST apply routes with org context", () => {
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/conversation/route.ts")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/conversation/apply/route.ts")),
      true,
    );
    const conversation = read("app/api/social-planner/[id]/conversation/route.ts");
    const apply = read("app/api/social-planner/[id]/conversation/apply/route.ts");
    assert.match(conversation, /requireCurrentOrganizationContext/);
    assert.match(conversation, /export async function GET/);
    assert.match(conversation, /export async function POST/);
    assert.match(conversation, /maxDuration = 60/);
    assert.match(apply, /requireCurrentOrganizationContext/);
    assert.match(apply, /export async function POST/);
    assert.match(apply, /202/);
    assert.doesNotMatch(conversation, /requireLicensee|licensee_account_id/);
    assert.doesNotMatch(apply, /requireLicensee|licensee_account_id/);
  });

  it("POST conversation accepts message and optional date-only assetReference", () => {
    const request = validateSocialPlannerConversationRequest({
      message: "Why is Monday a carousel?",
    });
    assert.equal(request.message, "Why is Monday a carousel?");
    assert.equal(request.assetReference, undefined);

    const targeted = validateSocialPlannerConversationRequest({
      message: "Critique this asset.",
      assetReference: { date: "2026-05-10" },
    });
    assert.deepEqual(targeted.assetReference, { date: "2026-05-10" });

    assert.throws(
      () => validateSocialPlannerConversationRequest({ message: "" }),
      SocialPlannerConversationError,
    );
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          history: [],
        }),
      SocialPlannerConversationError,
    );
    assert.throws(
      () =>
        validateSocialPlannerConversationRequest({
          message: "ok",
          assetReference: { date: "2026-05-10", socialCopy: "client body" },
        }),
      SocialPlannerConversationError,
    );
    assert.ok(SOCIAL_PLANNER_CONVERSATION_FORBIDDEN_KEYS.includes("package"));
    assert.ok(SOCIAL_PLANNER_CONVERSATION_FORBIDDEN_KEYS.includes("intelligence"));
    assert.ok(SOCIAL_PLANNER_CONVERSATION_FORBIDDEN_KEYS.includes("role"));
    assert.equal(
      (SOCIAL_PLANNER_CONVERSATION_FORBIDDEN_KEYS as readonly string[]).includes(
        "assetReference",
      ),
      false,
    );
  });

  it("Apply rejects browser-supplied revision fields", () => {
    normalizeConversationApplyRequest({});
    assert.throws(
      () => normalizeConversationApplyRequest({ message: "apply this" }),
      SocialPlannerConversationError,
    );
    assert.throws(
      () =>
        normalizeConversationApplyRequest({
          revisionContext: { actionable: true },
        }),
      SocialPlannerConversationError,
    );
  });

  it("conversation service persists a pair only after a valid assistant reply", () => {
    const service = read(
      "services/socialPlanner/conversation/socialPlannerConversationService.ts",
    );
    const messages = read(
      "services/socialPlanner/conversation/socialPlannerMessageService.ts",
    );
    assert.match(service, /insertMessagePair/);
    assert.match(service, /callProvider/);
    assert.match(service, /scope: "social-planner"/);
    assert.match(service, /resolveModelForStage/);
    assert.match(service, /social_calendar_conversation/);
    assert.match(messages, /\.insert\(\[userRow, assistantRow\]\)/);
    assert.match(messages, /baseMs \+ 1/);
    assert.match(messages, /\.order\("created_at", \{ ascending: true \}\)/);
    assert.match(messages, /\.order\("id", \{ ascending: true \}\)/);
    assert.match(messages, /\.eq\("organization_id", organizationId\)/);
    assert.match(messages, /\.eq\("social_calendar_id", socialCalendarId\)/);
  });
});
