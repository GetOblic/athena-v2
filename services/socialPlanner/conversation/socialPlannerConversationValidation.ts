/**
 * Request validation for Social Planner Ask Athena.
 * Client may supply message and an optional date-only asset reference.
 * History / package / intelligence / asset bodies are server-owned.
 */

import { parseSocialCalendarDate } from "@/services/socialPlanner/socialCalendarTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_LIMITS,
  SocialPlannerConversationError,
  type SocialPlannerConversationAssetReference,
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

  const assetReference = parseOptionalAssetReference(record.assetReference);

  return assetReference ? { message, assetReference } : { message };
}

function parseOptionalAssetReference(
  value: unknown,
): SocialPlannerConversationAssetReference | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "assetReference must be an object.",
      400,
    );
  }

  const ref = value as Record<string, unknown>;
  if (
    "content" in ref ||
    "title" in ref ||
    "body" in ref ||
    "socialCopy" in ref ||
    "productionSpec" in ref
  ) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "assetReference may not include content or title.",
      400,
    );
  }

  const extraKeys = Object.keys(ref).filter((key) => key !== "date");
  if (extraKeys.length > 0) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      `assetReference may not include ${extraKeys[0]}.`,
      400,
    );
  }

  if (typeof ref.date !== "string" || !ref.date.trim()) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "assetReference.date must be a non-empty ISO calendar date (YYYY-MM-DD).",
      400,
    );
  }

  try {
    return { date: parseSocialCalendarDate(ref.date) };
  } catch {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "assetReference.date must be an ISO calendar date (YYYY-MM-DD).",
      400,
    );
  }
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
