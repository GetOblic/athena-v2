export type GenerationErrorClass = "retryable" | "terminal";

const TERMINAL_PATTERNS = [
  /discussion not found/i,
  /organization/i,
  /unauthorized/i,
  /forbidden/i,
  /validation/i,
  /required/i,
  /invalid trigger/i,
  /missing organization/i,
  /deleted/i,
  /schema/i,
  /unsupported/i,
];

const RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /network/i,
  /econnreset/i,
  /econnrefused/i,
  /fetch failed/i,
  /rate limit/i,
  /429/,
  /503/,
  /502/,
  /504/,
  /temporarily/i,
  /unavailable/i,
  /openrouter/i,
  /connection/i,
  /stale/i,
  /orphaned/i,
  /lease/i,
];

export function classifyGenerationError(
  error: unknown,
): { classification: GenerationErrorClass; code: string; message: string } {
  if (
    error instanceof Error &&
    error.name === "ProspectLinkedInLengthContractError"
  ) {
    return {
      classification: "terminal",
      code: "LINKEDIN_LENGTH_CONTRACT",
      message: error.message.slice(0, 1000),
    };
  }

  if (
    error instanceof Error &&
    (error.name === "IncompleteProspectDeploymentAssetsError" ||
      error.name === "IncompleteProspectPublicationError")
  ) {
    return {
      classification: "retryable",
      code: error.name,
      message: error.message.slice(0, 1000),
    };
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown generation failure";

  // Deterministic LinkedIn length contract — never burn full Gemini retries.
  if (
    /linkedin.*200-character limit/i.test(message) ||
    /linkedin_asset_exceeds_200_characters/i.test(message)
  ) {
    return {
      classification: "terminal",
      code: "LINKEDIN_LENGTH_CONTRACT",
      message: message.slice(0, 1000),
    };
  }

  // Stage failures that should retry within max_attempts.
  if (
    /deployment assets/i.test(message) ||
    /strategic blueprint/i.test(message) ||
    /publication failed/i.test(message) ||
    /incomplete prospect/i.test(message)
  ) {
    return {
      classification: "retryable",
      code: "RETRYABLE_GENERATION_ERROR",
      message: message.slice(0, 1000),
    };
  }

  for (const pattern of TERMINAL_PATTERNS) {
    if (pattern.test(message)) {
      return {
        classification: "terminal",
        code: "TERMINAL_GENERATION_ERROR",
        message: message.slice(0, 1000),
      };
    }
  }

  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        classification: "retryable",
        code: "RETRYABLE_GENERATION_ERROR",
        message: message.slice(0, 1000),
      };
    }
  }

  // Default: retryable for unexpected failures (bounded by max_attempts).
  return {
    classification: "retryable",
    code: "PIPELINE_FAILED",
    message: message.slice(0, 1000),
  };
}
