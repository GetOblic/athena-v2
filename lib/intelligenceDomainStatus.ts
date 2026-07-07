export type IntelligenceDomainStatusKey = "active" | "inactive";

export type IntelligenceDomainStatusPresentation = {
  key: IntelligenceDomainStatusKey;
  label: string;
  colorClass: string;
  selectableInInbox: boolean;
};

const STATUS_PRESENTATIONS: Record<
  IntelligenceDomainStatusKey,
  Omit<IntelligenceDomainStatusPresentation, "key">
> = {
  active: {
    label: "Active",
    colorClass: "text-[var(--athena-success)]",
    selectableInInbox: true,
  },
  inactive: {
    label: "Inactive",
    colorClass: "text-white/45",
    selectableInInbox: false,
  },
};

const INACTIVE_TOKENS = new Set(["inactive", "disabled", "archived", "paused"]);

export function normalizeIntelligenceDomainStatus(
  status?: string | null,
): IntelligenceDomainStatusKey {
  const token = (status ?? "").trim().toLowerCase();

  if (!token || INACTIVE_TOKENS.has(token)) {
    return token && INACTIVE_TOKENS.has(token) ? "inactive" : "active";
  }

  if (token === "active") {
    return "active";
  }

  return "active";
}

export function getIntelligenceDomainStatusPresentation(
  status?: string | null,
): IntelligenceDomainStatusPresentation {
  const key = normalizeIntelligenceDomainStatus(status);
  return {
    key,
    ...STATUS_PRESENTATIONS[key],
  };
}

export function formatIntelligenceDomainStatus(status?: string | null): string {
  return getIntelligenceDomainStatusPresentation(status).label;
}

export function isIntelligenceDomainActive(status?: string | null): boolean {
  return normalizeIntelligenceDomainStatus(status) === "active";
}
