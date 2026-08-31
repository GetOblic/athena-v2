/**
 * Browser-side Persona Ask Athena request helper.
 */

import {
  UnexpectedServerResponseError,
  parseJsonResponse,
} from "@/lib/safeJsonResponse";
import {
  ATHENA_REQUEST_ID_HEADER,
  PERSONA_CONVERSATION_LIMITS,
  type PersonaConversationAssetReference,
  type PersonaConversationHistoryMessage,
  type PersonaConversationSuccessResult,
} from "@/services/personaConversation/personaConversationTypes";

export type PersonaConversationClientFailure = {
  kind: "transport" | "timeout" | "auth" | "server" | "lifecycle_abort";
  code: string;
  message: string;
  retryable: boolean;
  requestId: string | null;
};

export type PersonaConversationClientOutcome =
  | {
      ok: true;
      result: PersonaConversationSuccessResult;
      requestId: string | null;
    }
  | {
      ok: false;
      failure: PersonaConversationClientFailure;
    };

export const PERSONA_CONVERSATION_NETWORK_FALLBACK =
  "Network error talking to Athena.";

function readRequestId(response: Response): string | null {
  const value = response.headers.get(ATHENA_REQUEST_ID_HEADER);
  return value?.trim() || null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postPersonaConversation(input: {
  personaId: string;
  message: string;
  history: PersonaConversationHistoryMessage[];
  executiveVersionId: string | null;
  assetReference?: PersonaConversationAssetReference | null;
  signal: AbortSignal;
}): Promise<PersonaConversationClientOutcome> {
  const runOnce = async (): Promise<PersonaConversationClientOutcome> => {
    const timeout = setTimeout(() => {
      // Abort handled by caller signal composition below.
    }, PERSONA_CONVERSATION_LIMITS.clientRequestTimeoutMs);

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    input.signal.addEventListener("abort", onAbort);
    const clientTimeout = setTimeout(
      () => controller.abort(),
      PERSONA_CONVERSATION_LIMITS.clientRequestTimeoutMs,
    );

    try {
      const response = await fetch(
        `/api/personas/${input.personaId}/conversation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input.message,
            history: input.history,
            executiveVersionId: input.executiveVersionId,
            assetReference: input.assetReference ?? undefined,
          }),
          signal: controller.signal,
          cache: "no-store",
        },
      );
      const requestId = readRequestId(response);
      const payload = await parseJsonResponse<
        PersonaConversationSuccessResult & {
          ok?: boolean;
          error?: { code?: string; message?: string; retryable?: boolean };
        }
      >(response, {
        unexpectedMessage:
          "Athena received an unexpected server response while answering.",
      });

      if (response.status === 401) {
        return {
          ok: false,
          failure: {
            kind: "auth",
            code: "UNAUTHORIZED",
            message: "Authentication required",
            retryable: false,
            requestId,
          },
        };
      }

      if (!response.ok || !payload.ok) {
        return {
          ok: false,
          failure: {
            kind: "server",
            code: payload.error?.code || "INTERNAL_ERROR",
            message:
              payload.error?.message ||
              "Athena could not complete the conversation response.",
            retryable: Boolean(payload.error?.retryable),
            requestId,
          },
        };
      }

      return {
        ok: true,
        result: payload as PersonaConversationSuccessResult,
        requestId,
      };
    } catch (error) {
      if (input.signal.aborted) {
        return {
          ok: false,
          failure: {
            kind: "lifecycle_abort",
            code: "ABORTED",
            message: "Request cancelled.",
            retryable: false,
            requestId: null,
          },
        };
      }
      if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message))
      ) {
        return {
          ok: false,
          failure: {
            kind: "timeout",
            code: "TIMEOUT",
            message: "Athena took too long to respond. Please try again.",
            retryable: true,
            requestId: null,
          },
        };
      }
      if (error instanceof UnexpectedServerResponseError) {
        return {
          ok: false,
          failure: {
            kind: "server",
            code: "UNEXPECTED_RESPONSE",
            message: error.message,
            retryable: true,
            requestId: null,
          },
        };
      }
      return {
        ok: false,
        failure: {
          kind: "transport",
          code: "TRANSPORT_ERROR",
          message:
            error instanceof Error
              ? error.message
              : PERSONA_CONVERSATION_NETWORK_FALLBACK,
          retryable: true,
          requestId: null,
        },
      };
    } finally {
      clearTimeout(timeout);
      clearTimeout(clientTimeout);
      input.signal.removeEventListener("abort", onAbort);
    }
  };

  const first = await runOnce();
  if (first.ok || !first.failure.retryable || input.signal.aborted) {
    return first;
  }
  await sleep(PERSONA_CONVERSATION_LIMITS.autoRetryBackoffMs);
  if (input.signal.aborted) return first;
  return runOnce();
}
