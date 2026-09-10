import type { ReactNode } from "react";
import { Brain, ScanSearch, Sparkles } from "lucide-react";
import { PersonaConfidenceScore } from "@/components/personas/PersonaConfidenceScore";
import {
  PERSONA_DETAIL_ANCHORS,
  type PersonaJourneyChrome,
} from "@/lib/personas/personaDetailPresentation";
import {
  PERSONA_DETAIL_ICON,
  PERSONA_DETAIL_SURFACE,
} from "@/lib/personas/personaPagePresentation";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export function PersonaExecutiveSnapshot({
  analysis,
  chrome,
  messages,
}: {
  analysis: DiscussionAnalysis;
  chrome: PersonaJourneyChrome;
  messages: TenantMessages["personas"];
}) {
  const display = normalizeAnalysisForDisplay(analysis);

  return (
    <section
      id={PERSONA_DETAIL_ANCHORS.snapshot}
      data-persona-journey="executive-snapshot"
      className={`rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${PERSONA_DETAIL_SURFACE.violet}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${PERSONA_DETAIL_ICON.violet}`}
          aria-hidden="true"
        >
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200/80">
            {chrome.executiveSnapshot}
          </div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {messages.executive.whatMatters}
          </h2>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_auto]">
        <div className="space-y-6">
          <SnapshotBlock
            icon={<ScanSearch className="size-3.5" />}
            label={chrome.executiveInsight}
            value={display.summary}
            prominent
          />
          <SnapshotBlock
            icon={<Brain className="size-3.5" />}
            label={chrome.primaryConcern}
            value={display.pain_points}
          />
          <SnapshotBlock
            label={chrome.engagementStrategy}
            value={display.recommended_action}
          />
        </div>
        <div className="lg:pt-1">
          <PersonaConfidenceScore
            confidence={display.confidence}
            messages={messages}
            size="detail"
          />
        </div>
      </div>
    </section>
  );
}

function SnapshotBlock({
  label,
  value,
  prominent,
  icon,
}: {
  label: string;
  value?: string | null;
  prominent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="grid size-7 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55">
            {icon}
          </span>
        ) : null}
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {label}
        </div>
      </div>
      <p
        className={`mt-2 leading-7 ${
          prominent ? "text-lg text-white/90" : "text-base text-white/75"
        }`}
      >
        {value?.trim() || "—"}
      </p>
    </div>
  );
}
