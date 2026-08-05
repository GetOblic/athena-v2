import type { SeoPriorityVisual } from "@/services/seo/seoReportPresentation";

type SeoPriorityBadgeProps = {
  visual: SeoPriorityVisual;
};

export function SeoPriorityBadge({ visual }: SeoPriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${visual.className}`}
    >
      <span aria-hidden="true">{visual.symbol}</span>
      {visual.label}
    </span>
  );
}
