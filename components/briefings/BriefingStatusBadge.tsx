import { getBriefingStatusPresentation } from "@/lib/briefingStatus";

type BriefingStatusBadgeProps = {
  status?: string | null;
  className?: string;
  size?: "sm" | "lg";
  label?: string;
};

export function BriefingStatusBadge({
  status,
  className = "",
  size = "sm",
  label,
}: BriefingStatusBadgeProps) {
  const presentation = getBriefingStatusPresentation(status);
  const sizeClass = size === "lg" ? "text-4xl font-semibold" : "font-semibold";

  return (
    <span className={`${sizeClass} ${presentation.colorClass} ${className}`}>
      {label ?? presentation.label}
    </span>
  );
}
