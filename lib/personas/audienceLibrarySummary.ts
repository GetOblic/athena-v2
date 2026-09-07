/**
 * Presentation-only factual summary from already-loaded audience rows.
 * Does not load Ads, Social, or extra Persona queries.
 */

export type AudienceLibraryRowLike = {
  display_status?: string | null;
};

export type AudienceLibrarySummary = {
  total: number;
  ready: number;
  generating: number;
};

const GENERATING_STATUSES = new Set([
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
]);

export function deriveAudienceLibrarySummary(
  rows: readonly AudienceLibraryRowLike[],
): AudienceLibrarySummary {
  let ready = 0;
  let generating = 0;
  for (const row of rows) {
    const status = String(row.display_status ?? "").trim();
    if (status === "Ready") {
      ready += 1;
    } else if (GENERATING_STATUSES.has(status)) {
      generating += 1;
    }
  }
  return {
    total: rows.length,
    ready,
    generating,
  };
}

export function formatAudienceLibrarySummary(
  summary: AudienceLibrarySummary,
  copy: {
    audiencesOne: string;
    audiencesMany: string;
    readyOne: string;
    readyMany: string;
    generatingOne: string;
    generatingMany: string;
  },
  interpolate: (template: string, values: Record<string, string | number>) => string,
): string | null {
  if (summary.total <= 0) {
    return null;
  }
  const parts = [
    interpolate(
      summary.total === 1 ? copy.audiencesOne : copy.audiencesMany,
      { count: summary.total },
    ),
  ];
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
