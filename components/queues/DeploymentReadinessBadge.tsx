import { getDeploymentReadinessFromBriefing } from "@/lib/deploymentReadiness";

type DeploymentReadinessBadgeProps = {
  briefingStatus?: string | null;
  className?: string;
  size?: "sm" | "lg";
};

export function DeploymentReadinessBadge({
  briefingStatus,
  className = "",
  size = "sm",
}: DeploymentReadinessBadgeProps) {
  const presentation = getDeploymentReadinessFromBriefing(briefingStatus);
  const sizeClass = size === "lg" ? "text-2xl font-semibold" : "font-semibold";

  return (
    <span className={`${sizeClass} ${presentation.colorClass} ${className}`}>
      {presentation.label}
    </span>
  );
}
