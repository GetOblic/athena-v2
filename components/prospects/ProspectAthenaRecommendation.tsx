import { Sparkles } from "lucide-react";
import type { DeploymentAsset } from "@/components/deployment/DeploymentAssets";
import {
  PROSPECT_DETAIL_ANCHORS,
  PROSPECT_DETAIL_ICON,
  PROSPECT_RECOMMENDATION_SURFACE,
} from "@/lib/prospects/prospectDetailPresentation";
import { findProspectAssetByKeys } from "@/lib/prospects/prospectOutreachAssetGroups";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";

type ProspectAthenaRecommendationProps = {
  analysis: DiscussionAnalysis;
  assets?: DeploymentAsset[];
  convert: TenantMessages["prospects"]["convert"];
  executive: TenantMessages["prospects"]["executive"];
};

function hasText(value?: string | null): value is string {
  return Boolean(value && value.trim());
}

export function ProspectAthenaRecommendation({
  analysis,
  assets = [],
  convert,
  executive,
}: ProspectAthenaRecommendationProps) {
  const display = normalizeAnalysisForDisplay(analysis);
  const action = display.recommended_action?.trim() ?? "";
  const recommendedCta = findProspectAssetByKeys(assets, [
    "recommended_cta",
    "call_to_action",
  ]);
  const cta = recommendedCta?.content?.trim() ?? "";

  if (!action && !cta) return null;

  return (
    <section
      id={PROSPECT_DETAIL_ANCHORS.recommendation}
      data-prospect-detail="athena-recommendation"
      className={`rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${PROSPECT_RECOMMENDATION_SURFACE}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${PROSPECT_DETAIL_ICON.green}`}
          aria-hidden="true"
        >
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-success)]/80">
            {convert.whatAthenaRecommends}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            {executive.recommendedAction}
          </div>
          {action ? (
            <p className="mt-3 text-lg font-semibold leading-7 text-white">
              {action}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-6 text-white/40">
            {convert.recommendedHelper}
          </p>
          {cta ? (
            <div className="mt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                {convert.draftNextStep}
              </div>
              <p className="mt-2 text-base leading-7 text-white/80">{cta}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
