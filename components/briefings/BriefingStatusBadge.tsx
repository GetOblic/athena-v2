import { getBriefingStatusPresentation } from "@/lib/briefingStatus";

type BriefingStatusBadgeProps = {
  status?: string | null;
  className?: string;
  size?: "sm" | "lg";
};

export function BriefingStatusBadge({
  status,
  className = "",
  size = "sm",
}: BriefingStatusBadgeProps) {
  const presentation = getBriefingStatusPresentation(status);
  const sizeClass = size === "lg" ? "text-4xl font-semibold" : "font-semibold";

  return (
    <span className={`${sizeClass} ${presentation.colorClass} ${className}`}>
      {presentation.label}
    </span>
  );
}
