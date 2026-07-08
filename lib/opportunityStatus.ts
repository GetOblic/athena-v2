export type OpportunityStatusKey =
  | "pending"
  | "approved_for_outreach"
  | "outreach_started"
  | "conversation_active"
  | "qualified"
  | "won"
  | "lost";

export type OpportunityStatusPresentation = {
  key: OpportunityStatusKey;
  label: string;
  colorClass: string;
};

const STATUS_PRESENTATIONS: Record<
  OpportunityStatusKey,
  Omit<OpportunityStatusPresentation, "key">
> = {
  pending: {
    label: "Pending",
    colorClass: "text-[var(--athena-warning)]",
  },
  approved_for_outreach: {
    label: "Approved for Outreach",
    colorClass: "text-blue-400",
  },
  outreach_started: {
    label: "Outreach Started",
    colorClass: "text-cyan-400",
  },
  conversation_active: {
    label: "Conversation Active",
    colorClass: "text-purple-400",
  },
  qualified: {
    label: "Qualified",
    colorClass: "text-[var(--athena-success)]",
  },
  won: {
    label: "Won",
    colorClass: "text-emerald-400",
  },
  lost: {
    label: "Lost",
    colorClass: "text-red-400/70",
  },
};

export const OPPORTUNITY_STATUS_ORDER: OpportunityStatusKey[] = [
  "pending",
  "approved_for_outreach",
  "outreach_started",
  "conversation_active",
  "qualified",
  "won",
  "lost",
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeOpportunityStatus(
  status?: string | null,
): OpportunityStatusKey {
  const token = normalizeToken(status ?? "");

  if (
    token === "pending" ||
    token === "draft" ||
    token === "new" ||
    token === ""
  ) {
    return "pending";
  }

  if (
    token === "approved_for_outreach" ||
    token === "approvedforoutreach"
  ) {
    return "approved_for_outreach";
  }

  if (token === "outreach_started" || token === "outreach") {
    return "outreach_started";
  }

  if (token === "conversation_active" || token === "active") {
    return "conversation_active";
  }

  if (token === "qualified") {
    return "qualified";
  }

  if (token === "won") {
    return "won";
  }

  if (token === "lost") {
    return "lost";
  }

  return "pending";
}

export function getOpportunityStatusPresentation(
  status?: string | null,
): OpportunityStatusPresentation {
  const key = normalizeOpportunityStatus(status);
  return {
    key,
    ...STATUS_PRESENTATIONS[key],
  };
}

export function formatOpportunityStatus(status?: string | null): string {
  return getOpportunityStatusPresentation(status).label;
}

export function isProtectedOpportunityStatus(
  status?: string | null,
): boolean {
  return normalizeOpportunityStatus(status) !== "pending";
}

export function isValidOpportunityStatusKey(
  value: string,
): value is OpportunityStatusKey {
  return OPPORTUNITY_STATUS_ORDER.includes(value as OpportunityStatusKey);
}

export function toOpportunityStatusStorage(
  key: OpportunityStatusKey,
): string {
  return key;
}

export function formatOpportunityType(type?: string | null): string {
  const token = (type ?? "").trim().toLowerCase();

  if (token === "community_discussion" || token === "") {
    return "Market Discussion";
  }

  return type ?? "Market Discussion";
}

export function getOpportunityStatusSectionTitle(
  key: OpportunityStatusKey,
): string {
  return STATUS_PRESENTATIONS[key].label;
}
