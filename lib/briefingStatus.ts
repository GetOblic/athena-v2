export type BriefingStatusKey =
  | "draft"
  | "approved"
  | "needs_revision"
  | "rejected";

export type BriefingStatusPresentation = {
  key: BriefingStatusKey;
  label: string;
  colorClass: string;
};

const STATUS_PRESENTATIONS: Record<
  BriefingStatusKey,
  Omit<BriefingStatusPresentation, "key">
> = {
  draft: {
    label: "Draft",
    colorClass: "text-[var(--athena-warning)]",
  },
  approved: {
    label: "Approved",
    colorClass: "text-[var(--athena-success)]",
  },
  needs_revision: {
    label: "Needs Revision",
    colorClass: "text-red-400",
  },
  rejected: {
    label: "Rejected",
    colorClass: "text-white/45",
  },
};

export function normalizeBriefingStatus(
  status?: string | null,
): BriefingStatusKey {
  if (status === "approved") return "approved";
  if (status === "needs_revision") return "needs_revision";
  if (status === "rejected") return "rejected";
  return "draft";
}

export function getBriefingStatusPresentation(
  status?: string | null,
): BriefingStatusPresentation {
  const key = normalizeBriefingStatus(status);
  return {
    key,
    ...STATUS_PRESENTATIONS[key],
  };
}

export function formatBriefingStatus(status?: string | null): string {
  return getBriefingStatusPresentation(status).label;
}

export function isApprovedStatus(status?: string | null): boolean {
  return normalizeBriefingStatus(status) === "approved";
}

export function isNeedsRevisionStatus(status?: string | null): boolean {
  const key = normalizeBriefingStatus(status);
  return key === "needs_revision" || key === "rejected";
}
