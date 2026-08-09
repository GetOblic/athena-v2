/**
 * Service-role persistence for athena_estimate_messages (Ask Athena).
 * Ownership always comes from trusted server licensee_account_id — never the client.
 * No update/delete message API.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ATHENA_CONVERSATION_LIMITS,
} from "@/services/athenaConversation/athenaConversationTypes";
import type {
  AthenaEstimateMessage,
  AthenaEstimateMessageRole,
} from "@/services/estimate/athenaEstimateTypes";

const MESSAGE_ROLES = new Set<AthenaEstimateMessageRole>(["user", "assistant"]);

export class AthenaEstimateMessagePersistenceError extends Error {
  readonly code = "MESSAGE_PERSISTENCE_FAILED";

  constructor(message = "Failed to persist Estimate conversation message.") {
    super(message);
    this.name = "AthenaEstimateMessagePersistenceError";
  }
}

export class AthenaEstimateMessageValidationError extends Error {
  readonly code = "VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AthenaEstimateMessageValidationError";
  }
}

function mapMessageRow(row: Record<string, unknown>): AthenaEstimateMessage {
  return {
    id: String(row.id),
    estimateId: String(row.estimate_id),
    licenseeAccountId: String(row.licensee_account_id),
    organizationId: String(row.organization_id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

function assertRole(role: unknown): AthenaEstimateMessageRole {
  if (typeof role !== "string" || !MESSAGE_ROLES.has(role as AthenaEstimateMessageRole)) {
    throw new AthenaEstimateMessageValidationError(
      "Message role must be user or assistant.",
    );
  }
  return role as AthenaEstimateMessageRole;
}

function assertContent(content: unknown, maxLength: number): string {
  if (typeof content !== "string") {
    throw new AthenaEstimateMessageValidationError(
      "Message content must be a string.",
    );
  }
  const trimmed = content.trim();
  if (!trimmed) {
    throw new AthenaEstimateMessageValidationError(
      "Message content must not be empty.",
    );
  }
  if (trimmed.length > maxLength) {
    throw new AthenaEstimateMessageValidationError(
      `Message content must be at most ${maxLength} characters.`,
    );
  }
  // Persist exact trimmed content — never silently truncate.
  return trimmed;
}

/**
 * List durable messages for one Estimate owned by the Master account.
 * Constrained by BOTH licensee_account_id + estimate_id. Oldest-first.
 */
export async function listAthenaEstimateMessages(input: {
  licenseeAccountId: string;
  estimateId: string;
}): Promise<AthenaEstimateMessage[]> {
  const licenseeAccountId = input.licenseeAccountId.trim();
  const estimateId = input.estimateId.trim();
  if (!licenseeAccountId || !estimateId) {
    return [];
  }

  // Secondary id order keeps ties (same created_at) deterministic oldest-first.
  // Pair inserts stamp assistant 1ms after user so turns stay user→assistant.
  const { data, error } = await supabaseAdmin
    .from("athena_estimate_messages")
    .select("*")
    .eq("licensee_account_id", licenseeAccountId)
    .eq("estimate_id", estimateId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("[ATHENA_ESTIMATE_MESSAGES] list_failed", {
      licenseeAccountId,
      estimateId,
      error: error.message,
    });
    throw new AthenaEstimateMessagePersistenceError(
      "Failed to load Estimate conversation messages.",
    );
  }

  return (data ?? []).map((row) =>
    mapMessageRow(row as Record<string, unknown>),
  );
}

/**
 * Insert one conversation message. organizationId comes from the Estimate row.
 * Content is bounded; never silently truncated on save.
 * Prefer insertAthenaEstimateMessagePair for Ask Athena turns.
 */
export async function insertAthenaEstimateMessage(input: {
  estimateId: string;
  licenseeAccountId: string;
  organizationId: string;
  role: AthenaEstimateMessageRole;
  content: string;
  maxContentLength?: number;
}): Promise<AthenaEstimateMessage> {
  const estimateId = input.estimateId.trim();
  const licenseeAccountId = input.licenseeAccountId.trim();
  const organizationId = input.organizationId.trim();
  if (!estimateId || !licenseeAccountId || !organizationId) {
    throw new AthenaEstimateMessageValidationError(
      "Estimate message identity is incomplete.",
    );
  }

  const role = assertRole(input.role);
  const maxLength =
    input.maxContentLength ?? ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength;
  const content = assertContent(input.content, maxLength);

  const { data, error } = await supabaseAdmin
    .from("athena_estimate_messages")
    .insert({
      estimate_id: estimateId,
      licensee_account_id: licenseeAccountId,
      organization_id: organizationId,
      role,
      content,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[ATHENA_ESTIMATE_MESSAGES] insert_failed", {
      estimateId,
      licenseeAccountId,
      organizationId,
      role,
      error: error?.message,
    });
    throw new AthenaEstimateMessagePersistenceError();
  }

  return mapMessageRow(data as Record<string, unknown>);
}

export type AthenaEstimateMessagePair = {
  userMessage: AthenaEstimateMessage;
  assistantMessage: AthenaEstimateMessage;
};

/**
 * Atomically persist one user + assistant message pair via a single multi-row INSERT.
 * Roles are fixed server-side (user then assistant) — never browser-selected.
 * On statement failure neither row persists (PostgreSQL single-statement atomicity).
 */
export async function insertAthenaEstimateMessagePair(input: {
  estimateId: string;
  licenseeAccountId: string;
  organizationId: string;
  userContent: string;
  assistantContent: string;
  maxUserContentLength?: number;
  maxAssistantContentLength?: number;
}): Promise<AthenaEstimateMessagePair> {
  const estimateId = input.estimateId.trim();
  const licenseeAccountId = input.licenseeAccountId.trim();
  const organizationId = input.organizationId.trim();
  if (!estimateId || !licenseeAccountId || !organizationId) {
    throw new AthenaEstimateMessageValidationError(
      "Estimate message identity is incomplete.",
    );
  }

  const maxUserLength =
    input.maxUserContentLength ??
    ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength;
  const maxAssistantLength =
    input.maxAssistantContentLength ??
    ATHENA_CONVERSATION_LIMITS.maxHistoryMessageLength;
  const userContent = assertContent(input.userContent, maxUserLength);
  const assistantContent = assertContent(
    input.assistantContent,
    maxAssistantLength,
  );

  // Same-statement DEFAULT now() would stamp identical created_at on both rows,
  // making ORDER BY created_at alone non-deterministic within a turn.
  const baseMs = Date.now();
  const userCreatedAt = new Date(baseMs).toISOString();
  const assistantCreatedAt = new Date(baseMs + 1).toISOString();

  const userRow = {
    estimate_id: estimateId,
    licensee_account_id: licenseeAccountId,
    organization_id: organizationId,
    role: "user" as const,
    content: userContent,
    created_at: userCreatedAt,
  };
  const assistantRow = {
    estimate_id: estimateId,
    licensee_account_id: licenseeAccountId,
    organization_id: organizationId,
    role: "assistant" as const,
    content: assistantContent,
    created_at: assistantCreatedAt,
  };

  const { data, error } = await supabaseAdmin
    .from("athena_estimate_messages")
    .insert([userRow, assistantRow])
    .select("*");

  if (error || !data) {
    console.error("[ATHENA_ESTIMATE_MESSAGES] pair_insert_failed", {
      estimateId,
      licenseeAccountId,
      organizationId,
      error: error?.message,
    });
    throw new AthenaEstimateMessagePersistenceError(
      "Failed to persist Estimate conversation message pair.",
    );
  }

  const rows = data.map((row) => mapMessageRow(row as Record<string, unknown>));
  const userMessage = rows.find((row) => row.role === "user");
  const assistantMessage = rows.find((row) => row.role === "assistant");
  if (!userMessage || !assistantMessage) {
    console.error("[ATHENA_ESTIMATE_MESSAGES] pair_insert_incomplete_result", {
      estimateId,
      licenseeAccountId,
      organizationId,
      returnedRoles: rows.map((row) => row.role),
    });
    throw new AthenaEstimateMessagePersistenceError(
      "Failed to persist Estimate conversation message pair.",
    );
  }

  // Deterministic identity check — same ownership on both persisted rows.
  if (
    userMessage.estimateId !== estimateId ||
    assistantMessage.estimateId !== estimateId ||
    userMessage.licenseeAccountId !== licenseeAccountId ||
    assistantMessage.licenseeAccountId !== licenseeAccountId ||
    userMessage.organizationId !== organizationId ||
    assistantMessage.organizationId !== organizationId
  ) {
    console.error("[ATHENA_ESTIMATE_MESSAGES] pair_insert_identity_mismatch", {
      estimateId,
      licenseeAccountId,
      organizationId,
    });
    throw new AthenaEstimateMessagePersistenceError(
      "Failed to persist Estimate conversation message pair.",
    );
  }

  return { userMessage, assistantMessage };
}
