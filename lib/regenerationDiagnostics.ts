import { createHash, randomUUID } from "node:crypto";

const DEBUG_MARKER_PREFIX = "Generation debug timestamp:";

const PRODUCTION_REGENERATION_EVENTS = new Set([
  "REGENERATION_STARTED",
  "BACKGROUND_SUCCESS",
  "BACKGROUND_FAILED",
  "REGENERATE_FAILED",
  "BLUEPRINT_REGENERATION_FAILED",
]);

export function isRegenerationForensicsEnabled(): boolean {
  return process.env.ATHENA_REGENERATION_FORENSICS === "true";
}

export function createRegenerationRunId(): string {
  return randomUUID();
}

/** @deprecated Use createRegenerationRunId */
export function createRegenerationNonce(): string {
  return createRegenerationRunId();
}

export function hashContent(value: string | null | undefined): string {
  return createHash("sha256")
    .update(value ?? "")
    .digest("hex")
    .slice(0, 16);
}

export function logRegenerationEvent(
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (isRegenerationForensicsEnabled()) {
    console.log(
      `[REGENERATION] ${event} ${JSON.stringify({
        ...data,
        loggedAt: new Date().toISOString(),
      })}`,
    );
    return;
  }

  if (
    process.env.NODE_ENV === "production" &&
    !PRODUCTION_REGENERATION_EVENTS.has(event)
  ) {
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[REGENERATION] ${event} ${JSON.stringify({
        ...data,
        loggedAt: new Date().toISOString(),
      })}`,
    );
  }
}

export function logRegenerationForensic(
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (!isRegenerationForensicsEnabled()) {
    return;
  }

  console.log(
    `[REGENERATION_FORENSIC] ${event} ${JSON.stringify({
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
  if (process.env.NODE_ENV === "development" || isRegenerationForensicsEnabled()) {
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
  regenerationRunId?: string;
  /** @deprecated Use regenerationRunId */
  regenerationNonce?: string;
  discussionId?: string;
  explicitRegeneration?: boolean;
};

function resolveRunId(meta?: LlmCallMeta): string | null {
  return meta?.regenerationRunId ?? meta?.regenerationNonce ?? null;
}

export function logLlmCallStart(meta: LlmCallMeta, prompt: string): number {
  const regenerationRunId = resolveRunId(meta);
  const promptHash = hashContent(prompt);

  logRegenerationForensic("OPENROUTER_CALL_STARTED", {
    stage: meta.stage,
    promptSource: meta.promptSource,
    generationKind: meta.generationKind ?? null,
    model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
    regenerationRunId,
    discussionId: meta.discussionId ?? null,
    openRouterCalled: true,
    promptHash,
  });

  return Date.now();
}

export function logLlmCallEnd(
  meta: LlmCallMeta,
  startedAtMs: number,
  rawResponse: string,
  parsedHash?: string,
): void {
  logRegenerationForensic("OPENROUTER_RESPONSE_RECEIVED", {
    stage: meta.stage,
    promptSource: meta.promptSource,
    generationKind: meta.generationKind ?? null,
    durationMs: Date.now() - startedAtMs,
    regenerationRunId: resolveRunId(meta),
    discussionId: meta.discussionId ?? null,
    rawResponseHash: hashContent(rawResponse),
    parsedOutputHash: parsedHash ?? null,
    responseCharCount: rawResponse.length,
  });
}

export function formatRegenerationRunStamp(runId?: string): string {
  if (!runId?.trim()) {
    return "";
  }

  return `This regeneration run id is for internal freshness only and must not be mentioned in the output: ${runId.trim()}`;
}

export function appendRegenerationRunStamp(
  prompt: string,
  runId?: string,
): string {
  const stamp = formatRegenerationRunStamp(runId);
  if (!stamp) {
    return prompt;
  }

  return `${prompt.trim()}\n\n${stamp}`;
}

export function logPersistedRegenerationOutput(input: {
  regenerationRunId?: string | null;
  discussionId: string;
  organizationId?: string;
  stage: "analysis" | "deployment_assets" | "blueprint";
  persistedHash: string;
  recordId?: string | null;
}): void {
  logRegenerationForensic("PERSISTED_OUTPUT", {
    regenerationRunId: input.regenerationRunId ?? null,
    discussionId: input.discussionId,
    organizationId: input.organizationId ?? null,
    stage: input.stage,
    persistedHash: input.persistedHash,
    recordId: input.recordId ?? null,
  });
}
