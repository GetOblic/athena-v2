type SeoCoverageMeterAccent =
  | "orange"
  | "success"
  | "technical"
  | "healthy";

type SeoCoverageMeterProps = {
  label: string;
  percent: number | null;
  detail?: string;
  accent?: SeoCoverageMeterAccent;
};

const BAR_CLASS: Record<SeoCoverageMeterAccent, string> = {
  orange: "bg-[var(--athena-orange)]",
  success: "bg-[var(--athena-success)]",
  technical: "bg-sky-400",
  healthy: "bg-[var(--athena-success)]",
};

const VALUE_CLASS: Record<SeoCoverageMeterAccent, string> = {
  orange: "text-[var(--athena-orange)]",
  success: "text-[var(--athena-success)]",
  technical: "text-sky-200",
  healthy: "text-[var(--athena-success)]",
};

/** Simple coverage meter using existing Athena CSS primitives — no chart library. */
export function SeoCoverageMeter({
  label,
  percent,
  detail,
  accent = "success",
}: SeoCoverageMeterProps) {
  const value =
    percent == null || !Number.isFinite(percent)
      ? null
      : Math.max(0, Math.min(100, percent));

  return (
    <div className="rounded-2xl border border-[rgba(56,189,248,0.16)] bg-black/25 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          {label}
        </div>
        <div
          className={`shrink-0 text-lg font-semibold tabular-nums leading-none ${VALUE_CLASS[accent]}`}
        >
          {value == null ? "—" : `${value}%`}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${BAR_CLASS[accent]}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-white/45">{detail}</p>
      ) : null}
    </div>
  );
}
