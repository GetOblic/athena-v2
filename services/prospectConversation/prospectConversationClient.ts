/**
 * Browser-side Prospect Conversation request helper.
 * Owns client timeout, exactly-one automatic retry, and error classification.
 * No sessionStorage writes; does not mutate transcript history.
 */

import {
  UnexpectedServerResponseError,
  parseJsonResponse,
} from "@/lib/safeJsonResponse";
import {
  ATHENA_REQUEST_ID_HEADER,
  PROSPECT_CONVERSATION_LIMITS,
  type ProspectConversationAssetReference,
  type ProspectConversationHistoryMessage,
  type ProspectConversationResult,
  type ProspectConversationSuccessResult,
} from "@/services/prospectConversation/prospectConversationTypes";

export { ATHENA_REQUEST_ID_HEADER };

export const TRANSIENT_EDGE_STATUSES = new Set([
  502, 503, 504, 520, 522, 524,
]);

export class ClientTimeoutError extends Error {
  constructor(message = "Athena took too long to respond. Please try again.") {
    super(message);
    this.name = "ClientTimeoutError";
  }
}

export type ProspectConversationClientFailure = {
  kind:
    | "transport"
    | "unexpected_edge"
    | "timeout"
    | "auth"
    | "server"
    | "lifecycle_abort";
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  requestId: string | null;
};

export type ProspectConversationClientOutcome =
  | {
      ok: true;
      result: ProspectConversationSuccessResult;
      requestId: string | null;
    }
  | {
      ok: false;
      failure: ProspectConversationClientFailure;
    };

export type ProspectConversationPostInput = {
  prospectId: string;
  message: string;
  history: ProspectConversationHistoryMessage[];
  executiveVersionId: string | null;
  assetReference?: ProspectConversationAssetReference | null;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

function readRequestId(response: Response): string | null {
  const value = response.headers.get(ATHENA_REQUEST_ID_HEADER);
  if (!value?.trim()) {
    return null;
  }
  return value.trim();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isTransportFailure(error: unknown): boolean {
  if (error instanceof UnexpectedServerResponseError) {
    return false;
  }
  if (error instanceof ClientTimeoutError) {
    return false;
  }
  if (isAbortError(error)) {
    return false;
  }
  // Browser fetch transport failures are typically TypeError ("Failed to fetch").
  return error instanceof TypeError || error instanceof Error;
}

export function isAutoRetryableFailure(
  failure: ProspectConversationClientFailure,
): boolean {
  if (failure.kind === "lifecycle_abort" || failure.kind === "auth") {
    return false;
  }
  if (failure.kind === "transport" || failure.kind === "timeout") {
    return true;
  }
  if (
    failure.kind === "unexpected_edge" &&
    failure.httpStatus != null &&
    TRANSIENT_EDGE_STATUSES.has(failure.httpStatus)
  ) {
    return true;
  }
  if (failure.code === "TIMEOUT") {
    return true;
  }
  if (failure.retryable) {
    return true;
  }
  return false;
}

export function toUserFacingFailure(
  failure: ProspectConversationClientFailure,
): ProspectConversationClientFailure {
  if (failure.kind === "lifecycle_abort") {
    return failure;
  }
  if (failure.kind === "transport") {
    return {
      ...failure,
      message: "Athena could not reach the service. Please try again.",
    };
  }
  if (failure.kind === "unexpected_edge") {
    return {
      ...failure,
      message:
        "Athena encountered a temporary service issue. Please try again.",
    };
  }
  if (failure.kind === "timeout" || failure.code === "TIMEOUT") {
    return {
      ...failure,
      kind: "timeout",
      message: "Athena took too long to respond. Please try again.",
    };
  }
  // Auth / validation / not-found / version / asset / server JSON codes:
  // preserve the structured server message (or established auth copy).
  return failure;
}

function classifyThrownError(
  error: unknown,
  requestId: string | null,
): ProspectConversationClientFailure {
  if (isAbortError(error)) {
    return {
      kind: "lifecycle_abort",
      code: "ABORTED",
      message: "",
      retryable: false,
      requestId,
    };
  }

  if (error instanceof ClientTimeoutError) {
    return {
      kind: "timeout",
      code: "CLIENT_TIMEOUT",
      message: error.message,
      retryable: true,
      requestId,
    };
  }

  if (error instanceof UnexpectedServerResponseError) {
    return {
      kind: "unexpected_edge",
      code: `UNEXPECTED_HTTP_${error.status}`,
      message: error.message,
      retryable: TRANSIENT_EDGE_STATUSES.has(error.status),
      httpStatus: error.status,
      requestId,
    };
  }

  if (isTransportFailure(error)) {
    return {
      kind: "transport",
      code: "TRANSPORT_ERROR",
      message:
        error instanceof Error ? error.message : "Transport failure",
      retryable: true,
      requestId,
    };
  }

  return {
    kind: "transport",
    code: "TRANSPORT_ERROR",
    message: "Athena could not reach the service. Please try again.",
    retryable: true,
    requestId,
  };
}

function classifyJsonFailure(
  payload: ProspectConversationResult,
  httpStatus: number,
  requestId: string | null,
): ProspectConversationClientFailure {
  const failure =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as {
          error?: {
            code?: string;
            message?: string;
            retryable?: boolean;
          };
        }).error
      : null;

  const code = failure?.code ?? `HTTP_${httpStatus}`;
  const message =
    failure?.message ??
    "Athena could not complete the conversation response.";
  const retryableFlag = Boolean(failure?.retryable);

  if (code === "UNAUTHORIZED" || httpStatus === 401) {
    return {
      kind: "auth",
      code: "UNAUTHORIZED",
      message: message || "Authentication required",
      retryable: false,
      httpStatus,
      requestId,
    };
  }

  if (httpStatus === 403) {
    return {
      kind: "server",
      code,
      message,
      retryable: false,
      httpStatus,
      requestId,
    };
  }

  if (
    code === "TIMEOUT" ||
    code === "PROVIDER_RATE_LIMITED" ||
    retryableFlag
  ) {
    return {
      kind: code === "TIMEOUT" ? "timeout" : "server",
      code,
      message,
      retryable: true,
      httpStatus,
      requestId,
    };
  }

  return {
    kind: "server",
    code,
    message,
    retryable: false,
    httpStatus,
    requestId,
  };
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Combines an external lifecycle signal with a per-attempt client timeout.
 * A completed/superseded attempt's timer cannot abort a newer controller.
 */
export function createAttemptSignal(input: {
  externalSignal: AbortSignal;
  timeoutMs: number;
}): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort();
  };

  if (input.externalSignal.aborted) {
    controller.abort();
  } else {
    input.externalSignal.addEventListener("abort", onExternalAbort, {
      once: true,
    });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId);
      input.externalSignal.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function postOnce(
  input: ProspectConversationPostInput,
): Promise<ProspectConversationClientOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const attempt = createAttemptSignal({
    externalSignal: input.signal,
    timeoutMs: PROSPECT_CONVERSATION_LIMITS.clientRequestTimeoutMs,
  });

  let requestId: string | null = null;

  try {
    const response = await fetchImpl(
      `/api/prospects/${encodeURIComponent(input.prospectId)}/conversation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input.message,
          history: input.history,
          executiveVersionId: input.executiveVersionId,
          assetReference: input.assetReference ?? undefined,
        }),
        signal: attempt.signal,
      },
    );

    requestId = readRequestId(response);

    const payload = await parseJsonResponse<ProspectConversationResult>(
      response,
      {
        unexpectedMessage:
          "Athena received an unexpected server response while preparing this conversation reply.",
      },
    );

    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        failure: classifyJsonFailure(payload, response.status, requestId),
      };
    }

    return {
      ok: true,
      result: payload,
      requestId,
    };
  } catch (error) {
    if (attempt.didTimeout() && isAbortError(error)) {
      return {
        ok: false,
        failure: {
          kind: "timeout",
          code: "CLIENT_TIMEOUT",
          message: "Athena took too long to respond. Please try again.",
          retryable: true,
          requestId,
        },
      };
    }
    return {
      ok: false,
      failure: classifyThrownError(error, requestId),
    };
  } finally {
    attempt.cleanup();
  }
}

/**
 * Posts a conversation turn with exactly one automatic retry for approved
 * transient failures. Reuses the same logical request payload.
 */
export async function postProspectConversation(
  input: ProspectConversationPostInput,
): Promise<ProspectConversationClientOutcome> {
  const sleep = input.sleep ?? defaultSleep;
  const first = await postOnce(input);
  if (first.ok) {
    return first;
  }
  if (first.failure.kind === "lifecycle_abort") {
    return first;
  }
  if (!isAutoRetryableFailure(first.failure)) {
    return {
      ok: false,
      failure: toUserFacingFailure(first.failure),
    };
  }

  if (input.signal.aborted) {
    return {
      ok: false,
      failure: {
        kind: "lifecycle_abort",
        code: "ABORTED",
        message: "",
        retryable: false,
        requestId: first.failure.requestId,
      },
    };
  }

  await sleep(PROSPECT_CONVERSATION_LIMITS.autoRetryBackoffMs);

  if (input.signal.aborted) {
    return {
      ok: false,
      failure: {
        kind: "lifecycle_abort",
        code: "ABORTED",
        message: "",
        retryable: false,
        requestId: first.failure.requestId,
      },
    };
  }

  const second = await postOnce(input);
  if (second.ok) {
    return second;
  }
  if (second.failure.kind === "lifecycle_abort") {
    return second;
  }
  return {
    ok: false,
    failure: toUserFacingFailure({
      ...second.failure,
      requestId: second.failure.requestId ?? first.failure.requestId,
    }),
  };
}
