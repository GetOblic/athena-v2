export const MIN_OPENROUTER_MAX_TOKENS = 4096;
export const DEFAULT_OPENROUTER_MAX_TOKENS = 64000;
export const OPENROUTER_TOKEN_BUDGET_MAX_ATTEMPTS = 3;

export function resolveDefaultMaxTokens(): number {
  const raw = process.env.OPENROUTER_MAX_TOKENS?.trim();
  if (!raw) {
    return DEFAULT_OPENROUTER_MAX_TOKENS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_OPENROUTER_MAX_TOKENS) {
    return DEFAULT_OPENROUTER_MAX_TOKENS;
  }

  return parsed;
}

export function buildTokenBudgetSchedule(baseMaxTokens: number): number[] {
  const second = Math.max(
    MIN_OPENROUTER_MAX_TOKENS,
    Math.floor(baseMaxTokens * 0.75),
  );
  const third = Math.max(
    MIN_OPENROUTER_MAX_TOKENS,
    Math.floor(baseMaxTokens * 0.5),
  );

  return [baseMaxTokens, second, third].slice(0, OPENROUTER_TOKEN_BUDGET_MAX_ATTEMPTS);
}

export function parseAvailableTokensFromError(errorText: string): number | null {
  const match = errorText.match(/Available:\s*(\d+)/i);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isTokenBudgetError(status: number, errorText: string): boolean {
  const normalized = errorText.toLowerCase();

  const mentionsBudget =
    normalized.includes("max_tokens") ||
    normalized.includes("more credits") ||
    normalized.includes("insufficient credits") ||
    normalized.includes("fewer max_tokens") ||
    normalized.includes("requires more credits");

  if (status === 402) {
    return mentionsBudget || normalized.includes("credit");
  }

  return mentionsBudget;
}

export function capMaxTokensForRetry(
  scheduledMaxTokens: number,
  previousErrorText: string,
): number {
  const available = parseAvailableTokensFromError(previousErrorText);
  if (available === null) {
    return scheduledMaxTokens;
  }

  return Math.max(
    MIN_OPENROUTER_MAX_TOKENS,
    Math.min(scheduledMaxTokens, Math.floor(available * 0.95)),
  );
}

export function logOpenRouterTokenBudget(
  message: string,
  data: Record<string, unknown> = {},
): void {
  const lines = ["[REGENERATION]", ""];

  if (typeof data.attempt === "number") {
    lines.push(`Attempt ${data.attempt}`);
  }
  if (typeof data.max_tokens === "number") {
    lines.push(`max_tokens=${data.max_tokens}`);
  }

  if (
    message &&
    message !== "OpenRouter token budget attempt" &&
    !message.startsWith("Attempt ")
  ) {
    if (lines.length > 2) {
      lines.push("");
    }
    lines.push(message);
  }

  console.log(lines.join("\n"));
}
