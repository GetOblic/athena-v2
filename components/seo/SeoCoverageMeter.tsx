type SeoCoverageMeterProps = {
  label: string;
  percent: number | null;
  detail?: string;
  accent?: "orange" | "success";
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
  const barClass =
    accent === "success"
      ? "bg-[var(--athena-success)]"
      : "bg-[var(--athena-orange)]";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          {label}
        </div>
        <div className="text-sm font-semibold tabular-nums text-white/85">
          {value == null ? "—" : `${value}%`}
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-white/45">{detail}</p>
      ) : null}
    </div>
  );
}
