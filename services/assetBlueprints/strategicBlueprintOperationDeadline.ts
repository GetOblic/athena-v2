/**
 * One deadline for a Strategic Blueprint model operation.
 *
 * Quality-gate passes, token-budget retries, and the single fallback are
 * count-bounded, but each OpenRouter fetch is otherwise unbounded. The worker
 * heartbeat renews the job lease while that fetch is awaited, so a hung
 * provider never reaches failure settlement. This deadline is the terminal
 * bound for the whole model phase: in-flight requests are aborted and no
 * later quality or fallback call is started.
 */

export const STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV =
  "ATHENA_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS";

/** Ten minutes. Covers a slow premium generation plus its bounded retries. */
export const DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS = 600_000;

export const MIN_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS = 60_000;

export const MAX_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS = 1_200_000;

export class StrategicBlueprintOperationTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly code = "STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT" as const;

  constructor(timeoutMs: number) {
    super(`Strategic Blueprint operation timed out after ${timeoutMs}ms`);
    this.name = "StrategicBlueprintOperationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isStrategicBlueprintOperationTimeoutError(
  error: unknown,
): error is StrategicBlueprintOperationTimeoutError {
  return (
    error instanceof StrategicBlueprintOperationTimeoutError ||
    (error instanceof Error &&
      error.name === "StrategicBlueprintOperationTimeoutError")
  );
}

export function isStrategicBlueprintOperationTimeoutMessage(
  message: string | null | undefined,
): boolean {
  return (
    typeof message === "string" &&
    /Strategic Blueprint operation timed out/i.test(message)
  );
}

export function strategicBlueprintTimeoutFailure(timeoutMs: number): {
  blueprint: null;
  blueprintGenerated: false;
  blueprintError: string;
  parseFailed: true;
  preservedPrevious: false;
  fallbackUsed: false;
} {
  return {
    blueprint: null,
    blueprintGenerated: false,
    blueprintError: new StrategicBlueprintOperationTimeoutError(timeoutMs)
      .message,
    parseFailed: true,
    preservedPrevious: false,
    fallbackUsed: false,
  };
}

function isProviderTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "OpenRouterRequestTimeoutError" ||
      error.name === "AbortError" ||
      error.name === "TimeoutError")
  );
}

export function normalizeStrategicBlueprintDeadlineError(
  error: unknown,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Error {
  if (isStrategicBlueprintOperationTimeoutError(error)) {
    return error;
  }

  if (signal?.aborted || isProviderTimeout(error)) {
    return new StrategicBlueprintOperationTimeoutError(timeoutMs);
  }

  return error instanceof Error
    ? error
    : new Error("Strategic blueprint generation failed");
}

function clampTimeout(value: number): number {
  return Math.min(
    MAX_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
    Math.max(MIN_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS, value),
  );
}

export function resolveStrategicBlueprintOperationTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV]?.trim();
  if (!raw) {
    return DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    console.warn(
      `[Athena LLM] Invalid ${STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV}=${raw}; using ${DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS}`,
    );
    return DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS;
  }

  const clamped = clampTimeout(parsed);
  if (clamped !== parsed) {
    console.warn(
      `[Athena LLM] ${STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV}=${parsed} is outside ${MIN_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS}-${MAX_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS}; using ${clamped}`,
    );
  }

  return clamped;
}

/**
 * Explicit positive timeouts are used as given so tests can exercise a short
 * deadline. Missing or non-positive values use the configured production bound.
 */
export function resolveStrategicBlueprintOperationDeadlineMs(input?: {
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
}): number {
  const explicit = input?.timeoutMs;
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }

  return resolveStrategicBlueprintOperationTimeoutMs(input?.env ?? process.env);
}

export async function runStrategicBlueprintModelPhase<T>(input: {
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  operation: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const timeoutMs = resolveStrategicBlueprintOperationDeadlineMs(input);
  const timeoutError = new StrategicBlueprintOperationTimeoutError(timeoutMs);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    console.error(
      `[Athena LLM] stage=strategic_blueprint event=operation_timeout timeoutMs=${timeoutMs}`,
    );
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    const result = await input.operation(controller.signal);
    if (timedOut || controller.signal.aborted) {
      throw timeoutError;
    }
    return result;
  } catch (error) {
    if (
      timedOut ||
      controller.signal.aborted ||
      isStrategicBlueprintOperationTimeoutError(error) ||
      isProviderTimeout(error)
    ) {
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function executeStrategicBlueprintAttempts<T>(input: {
  signal: AbortSignal;
  timeoutMs: number;
  runQualityGate: () => Promise<
    { ok: true; value: T } | { ok: false; error: string }
  >;
  runFallback: () => Promise<
    | { ok: true; value: T }
    | { ok: false; error: string; rawBlueprint?: string }
  >;
}): Promise<
  | { ok: true; value: T; fallbackUsed: boolean }
  | { ok: false; error: string; rawBlueprint?: string }
> {
  if (input.signal.aborted) {
    throw new StrategicBlueprintOperationTimeoutError(input.timeoutMs);
  }

  let gated: { ok: true; value: T } | { ok: false; error: string };
  try {
    gated = await input.runQualityGate();
  } catch (error) {
    throw normalizeStrategicBlueprintDeadlineError(
      error,
      input.signal,
      input.timeoutMs,
    );
  }

  if (input.signal.aborted) {
    throw new StrategicBlueprintOperationTimeoutError(input.timeoutMs);
  }

  if (gated.ok) {
    return { ok: true, value: gated.value, fallbackUsed: false };
  }

  let recovered: Awaited<ReturnType<typeof input.runFallback>>;
  try {
    recovered = await input.runFallback();
  } catch (error) {
    throw normalizeStrategicBlueprintDeadlineError(
      error,
      input.signal,
      input.timeoutMs,
    );
  }

  if (input.signal.aborted) {
    throw new StrategicBlueprintOperationTimeoutError(input.timeoutMs);
  }

  if (!recovered.ok) {
    return {
      ok: false,
      error: recovered.error,
      rawBlueprint: recovered.rawBlueprint,
    };
  }

  return { ok: true, value: recovered.value, fallbackUsed: true };
}
