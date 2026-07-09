const DEBUG_MARKER_PREFIX = "Generation debug timestamp:";

const PRODUCTION_REGENERATION_EVENTS = new Set([
  "QUEUED",
  "BACKGROUND_SUCCESS",
  "BACKGROUND_FAILED",
  "REGENERATE_START",
  "REGENERATE_SUCCESS",
  "REGENERATE_PARTIAL_SUCCESS",
  "REGENERATE_FAILED",
  "BLUEPRINT_PARSE_FAILED_PRESERVED_PREVIOUS",
]);

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
};

export function logLlmCallStart(meta: LlmCallMeta): number {
  if (process.env.NODE_ENV === "development") {
    logRegenerationDiagnostic("LLM_CALL_START", {
      stage: meta.stage,
      promptSource: meta.promptSource,
      model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
    });
  }
  return Date.now();
}

export function logLlmCallEnd(
  meta: LlmCallMeta,
  startedAtMs: number,
  responseCharCount: number,
): void {
  if (process.env.NODE_ENV === "development") {
    logRegenerationDiagnostic("LLM_CALL_END", {
      stage: meta.stage,
      promptSource: meta.promptSource,
      durationMs: Date.now() - startedAtMs,
      responseCharCount,
    });
  }
}
