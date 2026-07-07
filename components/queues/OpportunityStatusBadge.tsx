import { getOpportunityStatusPresentation } from "@/lib/opportunityStatus";

type OpportunityStatusBadgeProps = {
  status?: string | null;
  className?: string;
  size?: "sm" | "lg";
};

export function OpportunityStatusBadge({
  status,
  className = "",
  size = "sm",
}: OpportunityStatusBadgeProps) {
  const presentation = getOpportunityStatusPresentation(status);
  const sizeClass = size === "lg" ? "text-2xl font-semibold" : "font-semibold";

  return (
    <span className={`${sizeClass} ${presentation.colorClass} ${className}`}>
      {presentation.label}
    </span>
  );
}
