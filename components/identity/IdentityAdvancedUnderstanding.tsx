import { BarChart3 } from "lucide-react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  IDENTITY_CARD_ICON_CLASS,
  IDENTITY_CARD_SURFACE_CLASS,
  localizeConfidence,
} from "@/components/identity/identityPagePresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type {
  IdentityConfidenceLevel,
  IdentityExecutiveIntelligence as IdentityExecutiveIntelligenceData,
} from "@/services/identity/identityExecutiveIntelligence";

type IdentityCopy = TenantMessages["identity"];

type IdentityAdvancedUnderstandingProps = {
  executive: IdentityExecutiveIntelligenceData;
  messages: IdentityCopy;
};

export function IdentityAdvancedUnderstanding({
  executive,
  messages,
}: IdentityAdvancedUnderstandingProps) {
  const copy = messages.executive;
  const page = messages.page;

  return (
    <AthenaCollapsibleSection
      title={page.advancedTitle}
      summary={copy.diagnosticTitle}
      defaultOpen={false}
      tone="identity"
      icon={<BarChart3 size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.magenta}
      className={IDENTITY_CARD_SURFACE_CLASS.magenta}
    >
      <div className="space-y-3">
        <DiagnosticRow
          label={copy.understandingConfidence}
          level={executive.confidence_level}
          messages={copy}
        />
        <DiagnosticRow
          label={copy.voiceAlignment}
          level={executive.voice_alignment}
          messages={copy}
        />
        <DiagnosticRow
          label={copy.knowledgeCoverage}
          level={executive.business_knowledge_coverage}
          messages={copy}
        />
        <DiagnosticRow
          label={copy.websiteCoverage}
          level={executive.website_evidence_coverage}
          messages={copy}
        />
      </div>

      {executive.confidence_reasons.length > 0 ? (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            {copy.confidenceReasons}
          </div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-white/65">
            {executive.confidence_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.signalsEyebrow}
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {copy.signalsTitle}
        </h3>
        {executive.hidden_signals.length === 0 ? (
          <p className="mt-5 text-sm leading-7 text-white/50">
            {copy.signalsEmpty}
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {executive.hidden_signals.map((signal) => (
              <li
                key={`${signal.finding}:${signal.why_it_matters}`}
                className="rounded-2xl border border-white/10 bg-black/20 p-5"
              >
                <div className="text-sm font-semibold text-white/85">
                  {copy.findingPrefix} {signal.finding}
                </div>
                <div className="mt-2 text-sm leading-6 text-white/60">
                  {copy.whyItMattersPrefix} {signal.why_it_matters}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AthenaCollapsibleSection>
  );
}

function DiagnosticRow({
  label,
  level,
  messages,
}: {
  label: string;
  level: IdentityConfidenceLevel;
  messages: IdentityCopy["executive"];
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-sm text-white/60">{label}</span>
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]">
        {localizeConfidence(level, messages)}
      </span>
    </div>
  );
}
