const DEBUG_MARKER_PREFIX = "Generation debug timestamp:";

export function logRegenerationDiagnostic(
  event: string,
  data: Record<string, unknown> = {},
): void {
  console.log(
    `[REGENERATE_DIAG] ${event} ${JSON.stringify({
      ...data,
      loggedAt: new Date().toISOString(),
    })}`,
  );
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
  logRegenerationDiagnostic("LLM_CALL_START", {
    stage: meta.stage,
    promptSource: meta.promptSource,
    model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
    startedAt: new Date().toISOString(),
    ...(process.env.NODE_ENV === "development"
      ? {
          generationKind: meta.generationKind ?? null,
          reasoningProfile: meta.reasoningProfile ?? null,
          reasoningAttached: meta.reasoningAttached ?? null,
        }
      : {}),
  });
  return Date.now();
}

export function logLlmCallEnd(
  meta: LlmCallMeta,
  startedAtMs: number,
  responseCharCount: number,
): void {
  logRegenerationDiagnostic("LLM_CALL_END", {
    stage: meta.stage,
    promptSource: meta.promptSource,
    model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    responseCharCount,
  });
}
