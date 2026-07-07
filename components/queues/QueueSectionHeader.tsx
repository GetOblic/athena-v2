type QueueSectionHeaderProps = {
  title: string;
  count: number;
};

export function QueueSectionHeader({ title, count }: QueueSectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 pb-3 pt-8 first:pt-4">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {title}
      </div>
      <span className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--athena-orange)]">
        {count}
      </span>
    </div>
  );
}
