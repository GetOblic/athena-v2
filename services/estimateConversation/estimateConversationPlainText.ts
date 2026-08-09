/**
 * Deterministic plain-text normalization for Estimate Ask Athena assistant replies.
 *
 * Strips presentation syntax the Ask Athena UI does not render.
 * Not a Markdown parser and not an HTML sanitizer.
 *
 * Preservation contract (must never rewrite unnecessarily):
 * - existing clean plain text
 * - numbered lists (e.g. "1. Strategy")
 * - existing hyphen bullets (e.g. "- Strategy")
 * - monetary values / ranges / currency punctuation (e.g. "$75,000–$110,000")
 * - legitimate multiline paragraph breaks
 */

/**
 * Normalize an assistant reply to safe plain text before validation/persistence.
 */
export function normalizeEstimateConversationPlainText(input: string): string {
  if (!input) {
    return input;
  }

  let text = input.replace(/\r\n/g, "\n");

  // 6. Remove fenced code delimiter lines (``` / ```lang). Keep inner content.
  text = text.replace(/^[ \t]*```[^\n]*$/gm, "");

  // 1. Markdown bold: **text** → text
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "$1");

  // 2. Underscore bold: __text__ → text
  text = text.replace(/__([^_\n]+)__/g, "$1");

  // 3. Markdown headings at line start: # / ## / ### → plain heading text
  text = text.replace(/^#{1,3}[ \t]+/gm, "");

  // 4. Asterisk bullets at line start: * item → - item
  text = text.replace(/^([ \t]*)\*[ \t]+/gm, "$1- ");

  // 5. Plus bullets at line start: + item → - item
  text = text.replace(/^([ \t]*)\+[ \t]+/gm, "$1- ");

  // Light tidy only — do not reshape content or flatten paragraph breaks.
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
