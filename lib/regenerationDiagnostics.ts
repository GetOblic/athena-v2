import { randomUUID } from "node:crypto";

const DEBUG_MARKER_PREFIX = "Generation debug timestamp:";

const PRODUCTION_REGENERATION_EVENTS = new Set([
  "QUEUED",
  "REGENERATION_STARTED",
  "BACKGROUND_SUCCESS",
  "BACKGROUND_FAILED",
  "REGENERATE_START",
  "REGENERATE_SUCCESS",
  "REGENERATE_PARTIAL_SUCCESS",
  "REGENERATE_FAILED",
  "OPENROUTER_CALL_STARTED",
  "OPENROUTER_RESPONSE_RECEIVED",
  "ANALYSIS_PERSISTED",
  "DEPLOYMENT_ASSETS_PERSISTED",
  "BLUEPRINT_PERSISTED",
  "BLUEPRINT_REGENERATION_FAILED",
  "BLUEPRINT_PARSE_FAILED_PRESERVED_PREVIOUS",
]);

export function createRegenerationNonce(): string {
  return randomUUID();
}

export function logRegenerationEvent(
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (
    process.env.NODE_ENV === "production" &&
    !PRODUCTION_REGENERATION_EVENTS.has(event)
  ) {
    return;
  }

  console.log(
    `[REGENERATION] ${event} ${JSON.stringify({
      ...data,
      loggedAt: new Date().toISOString(),
    })}`,
  );
}

/** @deprecated Use logRegenerationEvent for route/workflow events. */
export function logRegenerationDiagnostic(
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[REGENERATE_DIAG] ${event} ${JSON.stringify({
        ...data,
        loggedAt: new Date().toISOString(),
      })}`,
    );
  }
}

export function appendBlueprintDebugMarker(notes: string): string {
  const marker = `${DEBUG_MARKER_PREFIX} ${new Date().toISOString()}`;
  if (notes.includes(DEBUG_MARKER_PREFIX)) {
    return notes.replace(
      new RegExp(`${DEBUG_MARKER_PREFIX} [^\\n]+`),
      marker,
    );
  }
  return notes.trim() ? `${notes.trim()}\n\n${marker}` : marker;
}

export function hasBlueprintDebugMarker(notes?: string | null): boolean {
  return Boolean(notes?.includes(DEBUG_MARKER_PREFIX));
}

export class RegenerationBlueprintError extends Error {
  readonly code = "REGENERATION_BLUEPRINT_FAILED";

  constructor(
    message: string,
    readonly preservedBlueprintId?: string | null,
  ) {
    super(message);
    this.name = "RegenerationBlueprintError";
  }
}

export type LlmCallMeta = {
  stage: string;
  promptSource: string;
  generationKind?: string;
  reasoningProfile?: string;
  reasoningAttached?: boolean;
  regenerationNonce?: string;
  discussionId?: string;
};

export function logLlmCallStart(meta: LlmCallMeta): number {
  logRegenerationEvent("OPENROUTER_CALL_STARTED", {
    stage: meta.stage,
    promptSource: meta.promptSource,
    generationKind: meta.generationKind ?? null,
    model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
    regenerationNonce: meta.regenerationNonce ?? null,
    discussionId: meta.discussionId ?? null,
  });
  return Date.now();
}

export function logLlmCallEnd(
  meta: LlmCallMeta,
  startedAtMs: number,
  responseCharCount: number,
): void {
  logRegenerationEvent("OPENROUTER_RESPONSE_RECEIVED", {
    stage: meta.stage,
    promptSource: meta.promptSource,
    generationKind: meta.generationKind ?? null,
    durationMs: Date.now() - startedAtMs,
    responseCharCount,
    regenerationNonce: meta.regenerationNonce ?? null,
    discussionId: meta.discussionId ?? null,
  });
}

export function formatRegenerationRunStamp(nonce?: string): string {
  if (!nonce?.trim()) {
    return "";
  }

  return `[Regeneration run: ${nonce.trim()}]`;
}

export function appendRegenerationRunStamp(
  prompt: string,
  nonce?: string,
): string {
  const stamp = formatRegenerationRunStamp(nonce);
  if (!stamp) {
    return prompt;
  }

  return `${prompt.trim()}\n\n${stamp}`;
}
