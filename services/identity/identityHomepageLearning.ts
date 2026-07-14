/**
 * Client Profile homepage learning — scrape only when no stored text exists.
 */

/**
 * Usable stored Client Profile homepage learning (exact homepage_learning field).
 * Does not synthesize from persona/offers — only previously scraped homepage text.
 */
export function readStoredHomepageLearning(
  masterProfile: Record<string, unknown> | null | undefined,
): string | null {
  if (!masterProfile) return null;
  for (const key of ["homepage_learning", "homepage"]) {
    const value = masterProfile[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function hasUsableStoredHomepageLearning(
  masterProfile: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(readStoredHomepageLearning(masterProfile));
}

/**
 * Initial compile may scrape; later identity saves reuse stored homepage_learning
 * even when profile fields or website URL change.
 */
export async function resolveIdentityWebsiteHomepageText(input: {
  masterProfile: Record<string, unknown> | null | undefined;
  website: string | null;
  fetchHomepageText: (website: string | null) => Promise<string | null>;
}): Promise<{ text: string | null; scraped: boolean }> {
  const stored = readStoredHomepageLearning(input.masterProfile);
  if (stored) {
    return { text: stored, scraped: false };
  }

  const text = await input.fetchHomepageText(input.website);
  return { text, scraped: Boolean(input.website?.trim()) };
}
