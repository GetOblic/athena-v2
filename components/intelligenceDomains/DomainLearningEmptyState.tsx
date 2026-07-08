export function DomainLearningEmptyState() {
  return (
    <div className="mt-6 rounded-2xl border border-[var(--athena-orange)]/20 bg-black/20 p-8">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Learning Phase
      </div>

      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white">
        Athena is ready to learn this market.
      </h3>

      <p className="mt-4 max-w-3xl text-sm leading-7 text-white/60">
        Import discussions from Facebook, Reddit, LinkedIn, websites, interviews,
        emails, support conversations, or meeting notes. After approximately 20–30
        quality discussions, Athena will begin identifying recurring pain points,
        buying signals, emerging trends, competitors, and strategic opportunities.
      </p>
    </div>
  );
}
