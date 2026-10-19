/**
 * Length-only normalization for two Evergreen strategy narrative strings.
 * Does not rewrite structured fields, and does not replace strict validation.
 */

/** Established Evergreen strategy caps. Validation still rejects anything longer. */
export const EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS = 280;
export const EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS = 400;

/** Prompt targets with headroom. Normalization does not enforce these. */
export const EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_TARGET_CHARS = 240;
export const EVERGREEN_STRATEGY_CREATIVE_DIRECTION_TARGET_CHARS = 350;

const NARRATIVE_FIELDS = {
  weeklyObjective: EVERGREEN_STRATEGY_WEEKLY_OBJECTIVE_MAX_CHARS,
  creativeDirection: EVERGREEN_STRATEGY_CREATIVE_DIRECTION_MAX_CHARS,
} as const;

const SENTENCE_MARKS = [". ", "! ", "? ", ".\n", "!\n", "?\n"] as const;

/** Titles and short dotted forms. Not a general sentence parser. */
const TITLE_ABBREVIATIONS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "inc",
  "ltd",
  "co",
]);

function periodIndexIsAbbreviation(value: string, periodIndex: number): boolean {
  let cursor = periodIndex;
  while (cursor > 0 && /[A-Za-z.]/.test(value[cursor - 1] ?? "")) cursor -= 1;
  const token = value.slice(cursor, periodIndex);
  if (!token) return false;
  if (/^[A-Za-z]+(?:\.[A-Za-z]+)+$/.test(token)) return true;
  if (token.length === 1 && /[A-Za-z]/.test(token)) return true;
  return TITLE_ABBREVIATIONS.has(token.toLowerCase());
}

function hasNarrativeContent(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function sentencePrefix(value: string, maxChars: number): string | null {
  const fromLimit = Math.min(value.length, maxChars) - 1;
  if (fromLimit < 0) return null;
  let best = 0;
  for (const mark of SENTENCE_MARKS) {
    let from = fromLimit;
    while (from >= 0) {
      const index = value.lastIndexOf(mark, from);
      if (index < 0) break;
      const keep = index + 1;
      const abbreviated =
        mark.startsWith(".") && periodIndexIsAbbreviation(value, index);
      if (!abbreviated && keep <= maxChars && keep > best) {
        best = keep;
        break;
      }
      from = index - 1;
    }
  }
  const end = Math.min(value.length, maxChars);
  const last = value[end - 1];
  const next = value[end];
  if (
    last &&
    ".!?".includes(last) &&
    (next == null || /\s/.test(next)) &&
    !(last === "." && periodIndexIsAbbreviation(value, end - 1)) &&
    end > best
  ) {
    best = end;
  }
  if (best <= 0) return null;
  const stem = value.slice(0, best).trimEnd();
  if (!stem || !hasNarrativeContent(stem)) return null;
  return stem;
}

function wordPrefix(value: string, maxChars: number): string | null {
  const boundaryAtLimit = value[maxChars];
  if (boundaryAtLimit != null && /\s/.test(boundaryAtLimit)) {
    const exact = value.slice(0, maxChars).trimEnd();
    if (exact.length > 0 && exact.length <= maxChars && hasNarrativeContent(exact)) {
      return exact;
    }
  }
  const end = Math.min(value.length, maxChars);
  for (let index = end - 1; index >= 0; index -= 1) {
    if (!/\s/.test(value[index] ?? "")) continue;
    const stem = value.slice(0, index).trimEnd();
    if (stem.length > 0 && stem.length <= maxChars && hasNarrativeContent(stem)) {
      return stem;
    }
  }
  return null;
}

/**
 * Shorten an already-trimmed narrative at a sentence boundary when that keeps
 * a substantial prefix, otherwise at a word boundary.
 * Abbreviation periods are not sentence endings. A punctuation-only stem is
 * rejected so the caller leaves the original for strict validation.
 * Returns the input unchanged when no boundary exists inside the cap.
 */
export function shortenEvergreenNarrativeToLimit(
  trimmed: string,
  maxChars: number,
): string {
  if (trimmed.length <= maxChars) return trimmed;
  const minKeep = Math.floor(maxChars * 0.6);
  const sentence = sentencePrefix(trimmed, maxChars);
  if (sentence && sentence.length >= minKeep) return sentence;
  const word = wordPrefix(trimmed, maxChars);
  if (word) return word;
  if (sentence) return sentence;
  return trimmed;
}

function normalizeNarrativeString(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length <= maxChars) {
    return trimmed || value;
  }
  return shortenEvergreenNarrativeToLimit(trimmed, maxChars);
}

/**
 * Trim and, only when over the established cap, shorten weeklyObjective and
 * creativeDirection. Missing, empty, and non-string values are left untouched.
 */
export function normalizeEvergreenStrategyNarrativeFields(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const next: Record<string, unknown> = { ...raw };
  for (const field of Object.keys(NARRATIVE_FIELDS) as Array<
    keyof typeof NARRATIVE_FIELDS
  >) {
    const value = raw[field];
    if (typeof value !== "string") continue;
    const normalized = normalizeNarrativeString(value, NARRATIVE_FIELDS[field]);
    if (normalized === value) continue;
    next[field] = normalized;
    changed = true;
  }
  return changed ? next : raw;
}
