import type { DomainHealth } from "@/services/intelligenceDomainService";
import { getDomainHealthStateColor } from "@/lib/domainHealthDisplay";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type DomainHealthCardProps = {
  health: DomainHealth;
  copy: TenantMessages["intelligenceDomains"]["detail"];
  healthLabel: string;
};

export function DomainHealthCard({
  health,
  copy,
  healthLabel,
}: DomainHealthCardProps) {
  const confidence = health.knowledgeConfidence;
  const stateColor = getDomainHealthStateColor(health.healthLabel);

  return (
    <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.domainHealth}
          </div>
          <h2 className={`mt-3 text-3xl font-semibold ${stateColor}`}>
            {healthLabel}
          </h2>
          <p className="mt-2 text-sm text-white/45">
            {health.isActive ? copy.healthActiveHelp : copy.healthInactiveHelp}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              {copy.knowledgeConfidence}
            </div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {confidence != null ? `${confidence}%` : copy.healthLearning}
            </div>
            {confidence != null ? (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--athena-orange)] transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }}
                />
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-white/40">
                {copy.confidenceLearningHelp}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              {copy.movement}
            </div>
            <div className={`mt-2 text-3xl font-semibold ${stateColor}`}>
              {health.confidenceDelta != null
                ? `${health.confidenceDelta >= 0 ? "+" : ""}${health.confidenceDelta}%`
                : copy.emptyValue}
            </div>
            <p className="mt-3 text-xs leading-5 text-white/40">
              {copy.movementHelp}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
