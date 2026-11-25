/** Accepted product-text cap. This is not a crawl or listing bound. */
const MAX_TEXT_LENGTH = 300;

/** Treat storefront text as untrusted data: trim, drop controls, and cap length. */
export function cleanText(
  value: string | null | undefined,
  maxLength: number = MAX_TEXT_LENGTH,
): string | null {
  if (value == null) return null;
  const text = value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanText(value, 80);
    if (!text) continue;
    const key = text.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
