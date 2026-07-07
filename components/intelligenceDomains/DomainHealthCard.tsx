import type { DomainHealth } from "@/services/intelligenceDomainService";

type DomainHealthCardProps = {
  health: DomainHealth;
};

const TONE_CLASSES: Record<DomainHealth["healthTone"], string> = {
  strong: "text-[var(--athena-success)]",
  building: "text-[var(--athena-orange)]",
  learning: "text-white/55",
};

export function DomainHealthCard({ health }: DomainHealthCardProps) {
  return (
    <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Domain Health
          </div>
          <h2 className="mt-3 text-3xl font-semibold">{health.healthLabel}</h2>
          <p className="mt-2 text-sm text-white/45">
            {health.isActive
              ? "This domain is active and feeding Athena intelligence."
              : "This domain is inactive and hidden from capture workflows."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              Knowledge Confidence
            </div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {health.knowledgeConfidence != null
                ? `${health.knowledgeConfidence}%`
                : "Learning"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              Movement
            </div>
            <div className={`mt-2 text-3xl font-semibold ${TONE_CLASSES[health.healthTone]}`}>
              {health.confidenceDelta != null
                ? `${health.confidenceDelta >= 0 ? "+" : ""}${health.confidenceDelta}%`
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
