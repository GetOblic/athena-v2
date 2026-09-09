/**
 * Temporary CO-5 Google conversion diagnostic trace.
 * Request-scoped only. Do not persist or expose as business data.
 * Safe to delete after the conversion failure is located.
 */

export const CO5_GOOGLE_TRACE_PREFIX = "[CO5_GOOGLE_TRACE]";

export type Co5GoogleTraceEvent = {
  stage: string;
  organization_id?: string;
  wordpress_listing_id?: number | null;
  prospect_id?: string | null;
  relationship_status?: string;
  outcome?: string;
  error_code?: string;
  error_name?: string;
  http_status?: number;
  author_match?: boolean;
  google_id_match?: boolean;
  duration_ms?: number;
};

export type Co5GoogleTrace = {
  readonly traceId: string;
  readonly startedAt: number;
  currentStage: string;
  log(fields: Co5GoogleTraceEvent): void;
  error(fields: Co5GoogleTraceEvent): void;
};

const SAFE_FIELDS = [
  "organization_id",
  "wordpress_listing_id",
  "prospect_id",
  "relationship_status",
  "outcome",
  "error_code",
  "error_name",
  "http_status",
  "author_match",
  "google_id_match",
  "duration_ms",
] as const;

function serializeTraceEvent(
  traceId: string,
  startedAt: number,
  fields: Co5GoogleTraceEvent,
): string {
  const payload: Record<string, unknown> = {
    trace_id: traceId,
    stage: fields.stage,
    elapsed_ms: Date.now() - startedAt,
  };
  for (const key of SAFE_FIELDS) {
    const value = fields[key];
    if (value !== undefined) {
      payload[key] = value;
    }
  }
  return JSON.stringify(payload);
}

export function createCo5GoogleTrace(): Co5GoogleTrace {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();
  const state = { currentStage: "route_received" };

  return {
    get traceId() {
      return traceId;
    },
    get startedAt() {
      return startedAt;
    },
    get currentStage() {
      return state.currentStage;
    },
    set currentStage(value: string) {
      state.currentStage = value;
    },
    log(fields) {
      state.currentStage = fields.stage;
      console.log(
        CO5_GOOGLE_TRACE_PREFIX,
        serializeTraceEvent(traceId, startedAt, fields),
      );
    },
    error(fields) {
      if (fields.stage) {
        state.currentStage = fields.stage;
      }
      console.error(
        CO5_GOOGLE_TRACE_PREFIX,
        serializeTraceEvent(traceId, startedAt, fields),
      );
    },
  };
}

export function logCo5GoogleTraceCaughtError(
  trace: Co5GoogleTrace,
  error: unknown,
  httpStatus?: number,
  errorCode?: string,
): void {
  const errorName =
    error instanceof Error && error.name ? error.name : "Error";
  const resolvedCode =
    errorCode ??
    (error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined);
  trace.error({
    stage: trace.currentStage,
    error_name: errorName,
    error_code: resolvedCode,
    http_status: httpStatus,
  });
}
