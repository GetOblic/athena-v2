import type { ReactNode } from "react";
import { AlertTriangle, Clock3, Compass, Layers } from "lucide-react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ProspectAthenaRecommendation } from "@/components/prospects/ProspectAthenaRecommendation";
import { ProspectExecutiveSnapshot } from "@/components/prospects/ProspectExecutiveSnapshot";
import type { DeploymentAsset } from "@/components/deployment/DeploymentAssets";
import {
  PROSPECT_COMMERCIAL_SURFACE,
  PROSPECT_CONTEXT_SURFACE,
  PROSPECT_DETAIL_ICON,
  PROSPECT_RISK_SURFACE,
} from "@/lib/prospects/prospectDetailPresentation";
import { findProspectAssetByKeys } from "@/lib/prospects/prospectOutreachAssetGroups";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";

export type ProspectWorkspaceMessages = {
  prospects: {
    convert: TenantMessages["prospects"]["convert"];
    executive: TenantMessages["prospects"]["executive"];
  };
  opportunities: {
    colUrgency: string;
  };
};

type ProspectIntelligenceSectionsProps = {
  analysis: DiscussionAnalysis;
  opportunity?: { urgency?: string | null } | null;
  assets?: DeploymentAsset[];
  messages: ProspectWorkspaceMessages;
  afterRecommendation?: ReactNode;
};

function hasText(value?: string | null): value is string {
  return Boolean(value && value.trim());
}

function Field({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      {helper ? (
        <p className="mt-1 text-xs leading-5 text-white/35">{helper}</p>
      ) : null}
      <p className="mt-2 break-words text-base leading-7 text-white/80">
        {value}
      </p>
    </div>
  );
}

export function ProspectIntelligenceSections({
  analysis,
  opportunity = null,
  assets = [],
  messages,
  afterRecommendation = null,
}: ProspectIntelligenceSectionsProps) {
  const display = normalizeAnalysisForDisplay(analysis);
  const convert = messages.prospects.convert;
  const executive = messages.prospects.executive;
  const valueProposition = findProspectAssetByKeys(assets, [
    "personalized_value_proposition",
  ]);

  const whyFields: Array<{ label: string; value: string; helper?: string }> = [];
  if (analysis.opportunity_detected != null) {
    whyFields.push({
      label: convert.opportunityDetected,
      value: analysis.opportunity_detected
        ? executive.opportunityYes
        : executive.opportunityNo,
    });
  }
  if (hasText(valueProposition?.content)) {
    whyFields.push({
      label: executive.recommendedStrategy,
      value: valueProposition.content.trim(),
    });
  }

  const needFields: Array<{ label: string; value: string }> = [];
  if (hasText(display.pain_points)) {
    needFields.push({
      label: executive.painPoints,
      value: display.pain_points,
    });
  }

  const timingFields: Array<{ label: string; value: string }> = [];
  if (hasText(display.buyer_stage)) {
    timingFields.push({
      label: executive.buyerStage,
      value: display.buyer_stage,
    });
  }
  if (hasText(display.intent)) {
    timingFields.push({
      label: executive.intent,
      value: display.intent,
    });
  }
  if (hasText(opportunity?.urgency)) {
    timingFields.push({
      label: messages.opportunities.colUrgency,
      value: opportunity.urgency.trim(),
    });
  }

  const riskFields: Array<{ label: string; value: string }> = [];
  if (hasText(display.risk_level)) {
    riskFields.push({
      label: executive.riskLevel,
      value: display.risk_level,
    });
  }

  const reasoningFields: Array<{ label: string; value: string }> = [];
  if (hasText(display.opportunity_reason)) {
    reasoningFields.push({
      label: executive.opportunityReason,
      value: display.opportunity_reason,
    });
  }

  return (
    <>
      <ProspectExecutiveSnapshot
        analysis={analysis}
        convert={convert}
        executive={executive}
      />
      <div className="mt-8">
        <ProspectAthenaRecommendation
          analysis={analysis}
          assets={assets}
          convert={convert}
          executive={executive}
        />
      </div>
      {afterRecommendation}

      {whyFields.length > 0 ? (
        <AthenaCollapsibleSection
          title={convert.whyMatters}
          defaultOpen={false}
          tone="intelligence"
          icon={<Compass />}
          iconClassName={PROSPECT_DETAIL_ICON.violet}
          className={`mt-8 ${PROSPECT_CONTEXT_SURFACE}`}
        >
          {whyFields.map((field) => (
            <Field key={field.label} {...field} />
          ))}
        </AthenaCollapsibleSection>
      ) : null}

      {needFields.length > 0 ? (
        <AthenaCollapsibleSection
          title={convert.whatTheyNeed}
          defaultOpen={false}
          tone="intelligence"
          icon={<Layers />}
          iconClassName={PROSPECT_DETAIL_ICON.violet}
          className={`mt-8 ${PROSPECT_CONTEXT_SURFACE}`}
        >
          {needFields.map((field) => (
            <Field key={field.label} {...field} />
          ))}
        </AthenaCollapsibleSection>
      ) : null}

      {timingFields.length > 0 ? (
        <AthenaCollapsibleSection
          title={convert.timingAndIntent}
          defaultOpen={false}
          tone="intelligence"
          icon={<Clock3 />}
          iconClassName={PROSPECT_DETAIL_ICON.amber}
          className={`mt-8 ${PROSPECT_COMMERCIAL_SURFACE}`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {timingFields.map((field) => (
              <Field key={field.label} {...field} />
            ))}
          </div>
        </AthenaCollapsibleSection>
      ) : null}

      {riskFields.length > 0 ? (
        <AthenaCollapsibleSection
          title={convert.risksAndObjections}
          defaultOpen={false}
          tone="intelligence"
          icon={<AlertTriangle />}
          iconClassName={PROSPECT_DETAIL_ICON.rose}
          className={`mt-8 ${PROSPECT_RISK_SURFACE}`}
        >
          {riskFields.map((field) => (
            <Field key={field.label} {...field} />
          ))}
        </AthenaCollapsibleSection>
      ) : null}

      {reasoningFields.length > 0 ? (
        <AthenaCollapsibleSection
          title={convert.commercialReasoning}
          defaultOpen={false}
          tone="intelligence"
          icon={<Layers />}
          iconClassName={PROSPECT_DETAIL_ICON.amber}
          className={`mt-8 ${PROSPECT_COMMERCIAL_SURFACE}`}
        >
          {reasoningFields.map((field) => (
            <Field key={field.label} {...field} />
          ))}
        </AthenaCollapsibleSection>
      ) : null}
    </>
  );
}
