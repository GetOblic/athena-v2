import type { SeoGenerationType } from "@/services/seo/seoGenerationType";
import { seoGenerationTypeLabel } from "@/services/seo/seoGenerationType";

type SeoGenerationTypeBadgeProps = {
  generationType: SeoGenerationType;
};

/** Restrained badge — orange for Intelligence, success-green accent for Technical SEO. */
export function SeoGenerationTypeBadge({
  generationType,
}: SeoGenerationTypeBadgeProps) {
  const label = seoGenerationTypeLabel(generationType);
  const isTechnical = generationType === "technical";

  return (
    <span
      className={
        isTechnical
          ? "inline-flex items-center rounded-full border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--athena-success)]"
          : "inline-flex items-center rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]"
      }
    >
      {label}
    </span>
  );
}
