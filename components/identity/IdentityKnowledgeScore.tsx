import { Brain } from "lucide-react";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { identityKnowledgeScoreBand } from "@/services/identity/identityKnowledgeScore";

type IdentityCopy = TenantMessages["identity"];

type IdentityKnowledgeScoreProps = {
  score: number;
  messages: IdentityCopy;
};

export function IdentityKnowledgeScore({
  score,
  messages,
}: IdentityKnowledgeScoreProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const completion = interpolateTenantMessage(messages.brainCompletion, {
    percent: clamped,
  });
  const guidance = messages[identityKnowledgeScoreBand(clamped)];

  return (
    <aside
      className="w-full shrink-0 rounded-[28px] border border-[rgba(255,102,0,0.34)] bg-[var(--athena-card)] p-5 shadow-[0_0_28px_rgba(255,102,0,0.08)] sm:p-6 lg:w-[22rem]"
    >
      <div className="flex items-center gap-4">
        <div
          className="relative grid size-[4.5rem] shrink-0 place-items-center"
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(var(--athena-orange) ${clamped}%, rgba(255,255,255,0.08) 0)`,
            }}
          />
          <div className="absolute inset-[6px] rounded-full bg-[var(--athena-card)]" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--athena-orange)]">
            <Brain className="size-4 shrink-0" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em]">
              {messages.knowledgeScore}
            </p>
          </div>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
            {clamped}%
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-white/60">{completion}</p>
      <p className="mt-1 text-sm leading-6 text-white/40">{guidance}</p>
    </aside>
  );
}
