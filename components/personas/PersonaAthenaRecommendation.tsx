import { ListChecks, Target } from "lucide-react";
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

export function PersonaAthenaRecommendation({
  analysis,
  chrome,
}: {
  analysis: DiscussionAnalysis;
  chrome: PersonaJourneyChrome;
}) {
  const display = normalizeAnalysisForDisplay(analysis);
  const action = display.recommended_action?.trim() ?? "";
  const actionable = action.length > 0;
  const accent = actionable ? "green" : "amber";

  return (
    <section
      id={PERSONA_DETAIL_ANCHORS.recommendation}
      data-persona-journey="athena-recommendation"
      data-persona-recommendation="audience-strategy"
      className={`rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${PERSONA_DETAIL_SURFACE[accent]}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${PERSONA_DETAIL_ICON[accent]}`}
          aria-hidden="true"
        >
          {actionable ? (
            <Target className="size-5" />
          ) : (
            <ListChecks className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/45">
            {chrome.recommendation}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            {chrome.recommendedAction}
          </div>
          <p className="mt-3 text-lg font-semibold leading-7 text-white">
            {action || "—"}
          </p>
        </div>
      </div>
    </section>
  );
}
