/**
 * Request validation for Social Planner Ask Athena.
 * Client may supply message only — history/package/intelligence are server-owned.
 */

import {
  SOCIAL_PLANNER_CONVERSATION_LIMITS,
  SocialPlannerConversationError,
  type SocialPlannerConversationRequest,
} from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";

export const SOCIAL_PLANNER_CONVERSATION_FORBIDDEN_KEYS = [
  "organizationId",
  "organization_id",
  "socialCalendarId",
  "social_calendar_id",
  "calendarId",
  "calendar_id",
  "history",
  "messages",
  "role",
  "package",
  "package_json",
  "calendarContext",
  "calendar_context_json",
  "provenance",
  "provenance_json",
  "revisionContext",
  "revision_context_json",
  "intelligence",
  "model",
  "systemPrompt",
  "instructions",
  "context",
  "provider",
  "temperature",
  "maxTokens",
  "status",
  "generationMode",
  "generation_mode",
] as const;

export function validateSocialPlannerConversationRequest(
  body: unknown,
): SocialPlannerConversationRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "Request body must be a JSON object.",
      400,
    );
  }

  const record = body as Record<string, unknown>;

  for (const key of SOCIAL_PLANNER_CONVERSATION_FORBIDDEN_KEYS) {
    if (key in record) {
      throw new SocialPlannerConversationError(
        "VALIDATION_ERROR",
        `Client may not supply ${key}.`,
        400,
      );
    }
  }

  if (typeof record.message !== "string") {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "message must be a string.",
      400,
    );
  }

  const message = record.message.trim();
  if (!message) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "message must not be empty.",
      400,
    );
  }

  if (message.length > SOCIAL_PLANNER_CONVERSATION_LIMITS.maxUserMessageLength) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      `message must be at most ${SOCIAL_PLANNER_CONVERSATION_LIMITS.maxUserMessageLength} characters.`,
      400,
    );
  }

  return { message };
}

export function normalizeConversationApplyRequest(
  body: Record<string, unknown>,
): void {
  if (Object.keys(body).length > 0) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "Apply Athena's Suggestions does not accept generation fields from the browser.",
      400,
    );
  }
}
