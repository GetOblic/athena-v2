/**
 * Client-side Prospect library sort. Filter → sort → PAGE_SIZE slice.
 * No server pagination. "score" is Prospect Completeness, never Opportunity Score.
 */

export const PROSPECT_LIBRARY_PAGE_SIZE = 10;

export const PROSPECT_LIBRARY_SORT_KEYS = [
  "updated_desc",
  "updated_asc",
  "name_asc",
  "name_desc",
  "score_desc",
  "score_asc",
] as const;

export type ProspectLibrarySortKey = (typeof PROSPECT_LIBRARY_SORT_KEYS)[number];

export const DEFAULT_PROSPECT_LIBRARY_SORT: ProspectLibrarySortKey =
  "updated_desc";

export function isProspectLibrarySortKey(
  value: string,
): value is ProspectLibrarySortKey {
  return (PROSPECT_LIBRARY_SORT_KEYS as readonly string[]).includes(value);
}

export type ProspectLibrarySortable = {
  business_name: string;
  updated_at: string;
  display_completeness_score?: number | null;
};

export type ProspectLibraryFilterable = ProspectLibrarySortable & {
  display_lifecycle_status?: string | null;
  website?: string | null;
  decision_maker?: string | null;
  category?: string | null;
  industry?: string | null;
  email?: string | null;
  city?: string | null;
  country?: string | null;
};

function updatedTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function completenessScore(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compareUpdatedDesc(
  a: ProspectLibrarySortable,
  b: ProspectLibrarySortable,
): number {
  return updatedTime(b.updated_at) - updatedTime(a.updated_at);
}

function compareCompleteness(
  a: ProspectLibrarySortable,
  b: ProspectLibrarySortable,
  direction: "asc" | "desc",
): number {
  const left = completenessScore(a.display_completeness_score);
  const right = completenessScore(b.display_completeness_score);
  const cmp = direction === "desc" ? right - left : left - right;
  if (cmp !== 0) return cmp;
  return compareUpdatedDesc(a, b);
}

export function sortProspectLibraryRows<T extends ProspectLibrarySortable>(
  rows: readonly T[],
  sort: ProspectLibrarySortKey,
): T[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "name_asc") {
      return a.business_name.localeCompare(b.business_name);
    }
    if (sort === "name_desc") {
      return b.business_name.localeCompare(a.business_name);
    }
    if (sort === "updated_asc") {
      return updatedTime(a.updated_at) - updatedTime(b.updated_at);
    }
    if (sort === "score_desc") {
      return compareCompleteness(a, b, "desc");
    }
    if (sort === "score_asc") {
      return compareCompleteness(a, b, "asc");
    }
    return compareUpdatedDesc(a, b);
  });
  return copy;
}

export function filterProspectLibraryRows<T extends ProspectLibraryFilterable>(
  rows: readonly T[],
  input: { query: string; status: string },
): T[] {
  const needle = input.query.trim().toLowerCase();
  return rows.filter((prospect) => {
    if (
      input.status !== "all" &&
      prospect.display_lifecycle_status !== input.status
    ) {
      return false;
    }
    if (!needle) return true;
    const haystack = [
      prospect.business_name,
      prospect.website,
      prospect.decision_maker,
      prospect.category,
      prospect.industry,
      prospect.email,
      prospect.city,
      prospect.country,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function paginateProspectLibraryRows<T>(
  rows: readonly T[],
  page: number,
  pageSize = PROSPECT_LIBRARY_PAGE_SIZE,
): {
  pageRows: T[];
  currentPage: number;
  totalPages: number;
} {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    pageRows: rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    currentPage,
    totalPages,
  };
}

export function buildProspectLibraryView<T extends ProspectLibraryFilterable>(
  rows: readonly T[],
  input: {
    query: string;
    status: string;
    sort: ProspectLibrarySortKey;
    page: number;
  },
): {
  filtered: T[];
  pageRows: T[];
  currentPage: number;
  totalPages: number;
} {
  const filtered = sortProspectLibraryRows(
    filterProspectLibraryRows(rows, input),
    input.sort,
  );
  return {
    filtered,
    ...paginateProspectLibraryRows(filtered, input.page),
  };
}
