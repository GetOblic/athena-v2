import { normalizeBriefingStatus } from "@/lib/briefingStatus";

export type DeploymentReadinessKey =
  | "deployment_ready"
  | "preparing"
  | "blocked"
  | "cancelled";

export type DeploymentReadinessPresentation = {
  key: DeploymentReadinessKey;
  label: string;
  colorClass: string;
};

const READINESS_PRESENTATIONS: Record<
  DeploymentReadinessKey,
  Omit<DeploymentReadinessPresentation, "key">
> = {
  deployment_ready: {
    label: "Deployment Ready",
    colorClass: "text-[var(--athena-success)]",
  },
  preparing: {
    label: "Preparing",
    colorClass: "text-[var(--athena-warning)]",
  },
  blocked: {
    label: "Blocked",
    colorClass: "text-red-400",
  },
  cancelled: {
    label: "Cancelled",
    colorClass: "text-white/45",
  },
};

export function getDeploymentReadinessFromBriefing(
  briefingStatus?: string | null,
): DeploymentReadinessPresentation {
  const briefingKey = normalizeBriefingStatus(briefingStatus);

  let key: DeploymentReadinessKey;
  switch (briefingKey) {
    case "approved":
      key = "deployment_ready";
      break;
    case "needs_revision":
      key = "blocked";
      break;
    case "rejected":
      key = "cancelled";
      break;
    default:
      key = "preparing";
      break;
  }

  return {
    key,
    ...READINESS_PRESENTATIONS[key],
  };
}

export function formatDeploymentReadiness(
  briefingStatus?: string | null,
): string {
  return getDeploymentReadinessFromBriefing(briefingStatus).label;
}
