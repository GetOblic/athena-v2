/**
 * Service-role persistence for athena_social_calendar_messages.
 * Ownership always comes from trusted server organizationId — never the client.
 * No update/delete message API.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SOCIAL_PLANNER_CONVERSATION_LIMITS,
  SOCIAL_PLANNER_CONVERSATION_MESSAGE_TABLE,
  SocialPlannerConversationError,
  type SocialPlannerConversationMessage,
  type SocialPlannerConversationRole,
} from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";

const MESSAGE_ROLES = new Set<SocialPlannerConversationRole>([
  "user",
  "assistant",
]);

export class SocialPlannerMessagePersistenceError extends Error {
  readonly code = "MESSAGE_PERSISTENCE_FAILED";

  constructor(message = "Failed to persist Social Planner conversation message.") {
    super(message);
    this.name = "SocialPlannerMessagePersistenceError";
  }
}

function mapMessageRow(row: Record<string, unknown>): SocialPlannerConversationMessage {
  return {
    id: String(row.id),
    socialCalendarId: String(row.social_calendar_id),
    organizationId: String(row.organization_id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

function assertRole(role: unknown): SocialPlannerConversationRole {
  if (
    typeof role !== "string" ||
    !MESSAGE_ROLES.has(role as SocialPlannerConversationRole)
  ) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "Message role must be user or assistant.",
      400,
    );
  }
  return role as SocialPlannerConversationRole;
}

function assertContent(content: unknown, maxLength: number): string {
  if (typeof content !== "string") {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "Message content must be a string.",
      400,
    );
  }
  const trimmed = content.trim();
  if (!trimmed) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "Message content must not be empty.",
      400,
    );
  }
  if (trimmed.length > maxLength) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      `Message content must be at most ${maxLength} characters.`,
      400,
    );
  }
  return trimmed;
}

export async function listSocialPlannerConversationMessages(input: {
  organizationId: string;
  socialCalendarId: string;
}): Promise<SocialPlannerConversationMessage[]> {
  const organizationId = input.organizationId.trim();
  const socialCalendarId = input.socialCalendarId.trim();
  if (!organizationId || !socialCalendarId) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from(SOCIAL_PLANNER_CONVERSATION_MESSAGE_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("social_calendar_id", socialCalendarId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER_MESSAGES] list_failed", {
      organizationId,
      socialCalendarId,
      error: error.message,
    });
    throw new SocialPlannerMessagePersistenceError(
      "Failed to load Social Planner conversation messages.",
    );
  }

  return (data ?? []).map((row) =>
    mapMessageRow(row as Record<string, unknown>),
  );
}

export type SocialPlannerConversationMessagePair = {
  userMessage: SocialPlannerConversationMessage;
  assistantMessage: SocialPlannerConversationMessage;
};

export async function insertSocialPlannerConversationMessagePair(input: {
  socialCalendarId: string;
  organizationId: string;
  userContent: string;
  assistantContent: string;
  maxUserContentLength?: number;
  maxAssistantContentLength?: number;
}): Promise<SocialPlannerConversationMessagePair> {
  const socialCalendarId = input.socialCalendarId.trim();
  const organizationId = input.organizationId.trim();
  if (!socialCalendarId || !organizationId) {
    throw new SocialPlannerConversationError(
      "VALIDATION_ERROR",
      "Social Planner message identity is incomplete.",
      400,
    );
  }

  const userContent = assertContent(
    input.userContent,
    input.maxUserContentLength ??
      SOCIAL_PLANNER_CONVERSATION_LIMITS.maxUserMessageLength,
  );
  const assistantContent = assertContent(
    input.assistantContent,
    input.maxAssistantContentLength ??
      SOCIAL_PLANNER_CONVERSATION_LIMITS.maxAssistantMessageLength,
  );
  assertRole("user");
  assertRole("assistant");

  const baseMs = Date.now();
  const userCreatedAt = new Date(baseMs).toISOString();
  const assistantCreatedAt = new Date(baseMs + 1).toISOString();

  const userRow = {
    social_calendar_id: socialCalendarId,
    organization_id: organizationId,
    role: "user" as const,
    content: userContent,
    created_at: userCreatedAt,
  };
  const assistantRow = {
    social_calendar_id: socialCalendarId,
    organization_id: organizationId,
    role: "assistant" as const,
    content: assistantContent,
    created_at: assistantCreatedAt,
  };

  const { data, error } = await supabaseAdmin
    .from(SOCIAL_PLANNER_CONVERSATION_MESSAGE_TABLE)
    .insert([userRow, assistantRow])
    .select("*");

  if (error || !data) {
    console.error("[ATHENA_SOCIAL_PLANNER_MESSAGES] pair_insert_failed", {
      socialCalendarId,
      organizationId,
      error: error?.message,
    });
    throw new SocialPlannerMessagePersistenceError(
      "Failed to persist Social Planner conversation message pair.",
    );
  }

  const rows = data.map((row) => mapMessageRow(row as Record<string, unknown>));
  const userMessage = rows.find((row) => row.role === "user");
  const assistantMessage = rows.find((row) => row.role === "assistant");
  if (!userMessage || !assistantMessage) {
    throw new SocialPlannerMessagePersistenceError(
      "Failed to persist Social Planner conversation message pair.",
    );
  }

  if (
    userMessage.socialCalendarId !== socialCalendarId ||
    assistantMessage.socialCalendarId !== socialCalendarId ||
    userMessage.organizationId !== organizationId ||
    assistantMessage.organizationId !== organizationId
  ) {
    throw new SocialPlannerMessagePersistenceError(
      "Failed to persist Social Planner conversation message pair.",
    );
  }

  return { userMessage, assistantMessage };
}
