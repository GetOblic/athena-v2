type IdentityPageHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusValue: string;
  lastTrainedLabel: string;
  lastTrainedValue: string;
};

export function IdentityPageHeader({
  eyebrow,
  title,
  subtitle,
  statusLabel,
  statusValue,
  lastTrainedLabel,
  lastTrainedValue,
}: IdentityPageHeaderProps) {
  return (
    <div className="mb-10">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {eyebrow}
      </div>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h1>

      <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
        {subtitle}
      </p>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/40">
        <div>
          <span className="text-white/35">{statusLabel}</span>{" "}
          <span className="text-white/60">{statusValue}</span>
        </div>
        <div>
          <span className="text-white/35">{lastTrainedLabel}</span>{" "}
          <span className="text-white/60">{lastTrainedValue}</span>
        </div>
      </div>
    </div>
  );
}
