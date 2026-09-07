/**
 * Presentation-only factual summary from already-loaded prospect rows.
 * Does not add reads, ranking, or extra CRM concepts.
 */

export type ProspectLibraryRowLike = {
  display_lifecycle_status?: string | null;
  display_status?: string | null;
};

export type ProspectLibrarySummary = {
  total: number;
  newCount: number;
  followUpCount: number;
  ready: number;
  generating: number;
};

const GENERATING_STATUSES = new Set([
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
]);

export function deriveProspectLibrarySummary(
  rows: readonly ProspectLibraryRowLike[],
): ProspectLibrarySummary {
  let newCount = 0;
  let followUpCount = 0;
  let ready = 0;
  let generating = 0;

  for (const row of rows) {
    const lifecycle = String(row.display_lifecycle_status ?? "").trim();
    if (lifecycle === "New") {
      newCount += 1;
    } else if (lifecycle === "Follow-up") {
      followUpCount += 1;
    }

    const status = String(row.display_status ?? "").trim();
    if (status === "Ready") {
      ready += 1;
    } else if (GENERATING_STATUSES.has(status)) {
      generating += 1;
    }
  }

  return {
    total: rows.length,
    newCount,
    followUpCount,
    ready,
    generating,
  };
}

export function formatProspectLibrarySummary(
  summary: ProspectLibrarySummary,
  copy: {
    prospectsOne: string;
    prospectsMany: string;
    newOne: string;
    newMany: string;
    followUpOne: string;
    followUpMany: string;
    readyOne: string;
    readyMany: string;
    generatingOne: string;
    generatingMany: string;
  },
  interpolate: (
    template: string,
    values: Record<string, string | number>,
  ) => string,
): string | null {
  if (summary.total <= 0) {
    return null;
  }

  const parts = [
    interpolate(
      summary.total === 1 ? copy.prospectsOne : copy.prospectsMany,
      { count: summary.total },
    ),
  ];

  if (summary.newCount > 0) {
    parts.push(
      interpolate(
        summary.newCount === 1 ? copy.newOne : copy.newMany,
        { count: summary.newCount },
      ),
    );
  }
  if (summary.followUpCount > 0) {
    parts.push(
      interpolate(
        summary.followUpCount === 1 ? copy.followUpOne : copy.followUpMany,
        { count: summary.followUpCount },
      ),
    );
  }
  if (summary.ready > 0) {
    parts.push(
      interpolate(
        summary.ready === 1 ? copy.readyOne : copy.readyMany,
        { count: summary.ready },
      ),
    );
  }
  if (summary.generating > 0) {
    parts.push(
      interpolate(
        summary.generating === 1 ? copy.generatingOne : copy.generatingMany,
        { count: summary.generating },
      ),
    );
  }

  return parts.join(" · ");
}
