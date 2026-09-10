/**
 * Client-side Persona library sort. Filter → sort → PAGE_SIZE slice.
 * No server pagination. Does not use opportunity scoring.
 */

/** List presentation / sort: stored 0 and null are unscored. */
export function isPersonaLibraryConfidenceAvailable(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export const PERSONA_LIBRARY_SORT_KEYS = [
  "updated_desc",
  "updated_asc",
  "name_asc",
  "name_desc",
  "confidence_desc",
  "confidence_asc",
] as const;

export type PersonaLibrarySortKey = (typeof PERSONA_LIBRARY_SORT_KEYS)[number];

export const DEFAULT_PERSONA_LIBRARY_SORT: PersonaLibrarySortKey =
  "updated_desc";

export function isPersonaLibrarySortKey(
  value: string,
): value is PersonaLibrarySortKey {
  return (PERSONA_LIBRARY_SORT_KEYS as readonly string[]).includes(value);
}

type PersonaLibrarySortable = {
  display_label: string;
  updated_at: string;
  display_confidence?: number | null;
};

function updatedTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareUpdatedDesc(
  a: PersonaLibrarySortable,
  b: PersonaLibrarySortable,
): number {
  return updatedTime(b.updated_at) - updatedTime(a.updated_at);
}

function compareConfidence(
  a: PersonaLibrarySortable,
  b: PersonaLibrarySortable,
  direction: "asc" | "desc",
): number {
  const aScored = isPersonaLibraryConfidenceAvailable(a.display_confidence);
  const bScored = isPersonaLibraryConfidenceAvailable(b.display_confidence);
  if (aScored && !bScored) return -1;
  if (!aScored && bScored) return 1;
  if (!aScored && !bScored) {
    return compareUpdatedDesc(a, b);
  }
  const left = a.display_confidence as number;
  const right = b.display_confidence as number;
  const cmp = direction === "desc" ? right - left : left - right;
  if (cmp !== 0) return cmp;
  return compareUpdatedDesc(a, b);
}

export function sortPersonaLibraryRows<T extends PersonaLibrarySortable>(
  rows: readonly T[],
  sort: PersonaLibrarySortKey,
): T[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "name_asc") {
      return a.display_label.localeCompare(b.display_label);
    }
    if (sort === "name_desc") {
      return b.display_label.localeCompare(a.display_label);
    }
    if (sort === "updated_asc") {
      return updatedTime(a.updated_at) - updatedTime(b.updated_at);
    }
    if (sort === "confidence_desc") {
      return compareConfidence(a, b, "desc");
    }
    if (sort === "confidence_asc") {
      return compareConfidence(a, b, "asc");
    }
    return compareUpdatedDesc(a, b);
  });
  return copy;
}
