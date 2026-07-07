export const BRIEFING_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  needs_revision: "Needs Revision",
  rejected: "Rejected",
};

export function formatBriefingStatus(status: string): string {
  return BRIEFING_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function isApprovedStatus(status: string): boolean {
  return status === "approved";
}

export function isNeedsRevisionStatus(status: string): boolean {
  return status === "needs_revision" || status === "rejected";
}
