import { getIntelligenceDomainStatusPresentation } from "@/lib/intelligenceDomainStatus";

type IntelligenceDomainStatusBadgeProps = {
  status?: string | null;
  className?: string;
  size?: "sm" | "lg";
};

export function IntelligenceDomainStatusBadge({
  status,
  className = "",
  size = "sm",
}: IntelligenceDomainStatusBadgeProps) {
  const presentation = getIntelligenceDomainStatusPresentation(status);
  const sizeClass = size === "lg" ? "text-2xl font-semibold" : "font-semibold";

  return (
    <span className={`${sizeClass} ${presentation.colorClass} ${className}`}>
      {presentation.label}
    </span>
  );
}
