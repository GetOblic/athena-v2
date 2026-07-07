import { getBriefingStatusPresentation } from "@/lib/briefingStatus";
import { getDeploymentReadinessFromBriefing } from "@/lib/deploymentReadiness";
import { getOpportunityStatusPresentation } from "@/lib/opportunityStatus";

export type StatusDomain = "opportunity" | "briefing" | "deployment";

export function statusColor(
  domain: StatusDomain,
  status?: string | null,
): string {
  switch (domain) {
    case "opportunity":
      return getOpportunityStatusPresentation(status).colorClass;
    case "briefing":
      return getBriefingStatusPresentation(status).colorClass;
    case "deployment":
      return getDeploymentReadinessFromBriefing(status).colorClass;
    default:
      return "text-white/70";
  }
}

export { formatBriefingStatus } from "@/lib/briefingStatus";
export { formatDeploymentReadiness } from "@/lib/deploymentReadiness";
export { formatOpportunityStatus } from "@/lib/opportunityStatus";
