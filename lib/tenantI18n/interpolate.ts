/**
 * Presentation-only string interpolation for tenant chrome.
 * Does not look up dictionaries or translate values.
 */
export function interpolateTenantMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
