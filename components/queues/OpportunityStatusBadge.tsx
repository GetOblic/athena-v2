import { getOpportunityStatusPresentation } from "@/lib/opportunityStatus";

type OpportunityStatusBadgeProps = {
  status?: string | null;
  className?: string;
  size?: "sm" | "lg";
  label?: string;
};

export function OpportunityStatusBadge({
  status,
  className = "",
  size = "sm",
  label,
}: OpportunityStatusBadgeProps) {
  const presentation = getOpportunityStatusPresentation(status);
  const sizeClass = size === "lg" ? "text-2xl font-semibold" : "font-semibold";

  return (
    <span className={`${sizeClass} ${presentation.colorClass} ${className}`}>
      {label ?? presentation.label}
    </span>
  );
}
