import type { SeoPriorityVisual } from "@/services/seo/seoReportPresentation";

type SeoPriorityBadgeProps = {
  visual: SeoPriorityVisual;
};

export function SeoPriorityBadge({ visual }: SeoPriorityBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${visual.className}`}
    >
      <span className="min-w-0 break-words">{visual.label}</span>
    </span>
  );
}
