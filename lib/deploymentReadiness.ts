import { normalizeBriefingStatus } from "@/lib/briefingStatus";

export type DeploymentReadinessKey =
  | "preparing"
  | "ready"
  | "scheduled"
  | "published"
  | "archived"
  | "blocked";

export type DeploymentReadinessPresentation = {
  key: DeploymentReadinessKey;
  label: string;
  colorClass: string;
};

export const DEPLOYMENT_READINESS_ORDER: DeploymentReadinessKey[] = [
  "preparing",
  "ready",
  "scheduled",
  "published",
  "archived",
  "blocked",
];

const READINESS_PRESENTATIONS: Record<
  DeploymentReadinessKey,
  Omit<DeploymentReadinessPresentation, "key">
> = {
  preparing: {
    label: "Preparing",
    colorClass: "text-[var(--athena-warning)]",
  },
  ready: {
    label: "Ready",
    colorClass: "text-[var(--athena-success)]",
  },
  scheduled: {
    label: "Scheduled",
    colorClass: "text-blue-400",
  },
  published: {
    label: "Published",
    colorClass: "text-blue-400",
  },
  archived: {
    label: "Archived",
    colorClass: "text-white/45",
  },
  blocked: {
    label: "Blocked",
    colorClass: "text-red-400",
  },
};

function normalizeDeploymentReadinessKey(
  value?: string | null,
): DeploymentReadinessKey | null {
  if (!value) {
    return null;
  }

  const token = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (token === "deployment_ready" || token === "ready") {
    return "ready";
  }

  if (token === "cancelled" || token === "archived") {
    return "archived";
  }

  if (DEPLOYMENT_READINESS_ORDER.includes(token as DeploymentReadinessKey)) {
    return token as DeploymentReadinessKey;
  }

  return null;
}

export function getDeploymentReadinessPresentation(
  key: DeploymentReadinessKey,
): DeploymentReadinessPresentation {
  return {
    key,
    ...READINESS_PRESENTATIONS[key],
  };
}

export function getDeploymentReadinessFromBriefing(
  briefingStatus?: string | null,
): DeploymentReadinessPresentation {
  const briefingKey = normalizeBriefingStatus(briefingStatus);

  let key: DeploymentReadinessKey;
  switch (briefingKey) {
    case "approved":
      key = "ready";
      break;
    case "needs_revision":
      key = "blocked";
      break;
    case "rejected":
      key = "archived";
      break;
    default:
      key = "preparing";
      break;
  }

  return getDeploymentReadinessPresentation(key);
}

export function getDeploymentReadinessFromStatus(
  status?: string | null,
): DeploymentReadinessPresentation {
  const directKey = normalizeDeploymentReadinessKey(status);
  if (directKey) {
    return getDeploymentReadinessPresentation(directKey);
  }

  return getDeploymentReadinessFromBriefing(status);
}

export function formatDeploymentReadiness(
  briefingStatus?: string | null,
): string {
  return getDeploymentReadinessFromBriefing(briefingStatus).label;
}
