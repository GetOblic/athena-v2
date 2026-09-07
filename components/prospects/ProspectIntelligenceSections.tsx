import type { DeploymentAsset } from "@/components/deployment/DeploymentAssets";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
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
};

function hasText(value?: string | null): value is string {
  return Boolean(value && value.trim());
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mt-8 rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-6 sm:p-8`}
    >
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  );
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
}: ProspectIntelligenceSectionsProps) {
  const display = normalizeAnalysisForDisplay(analysis);
  const convert = messages.prospects.convert;
  const executive = messages.prospects.executive;
  const valueProposition = findProspectAssetByKeys(assets, [
    "personalized_value_proposition",
  ]);
  const recommendedCta = findProspectAssetByKeys(assets, [
    "recommended_cta",
    "call_to_action",
  ]);

  const whyFields: Array<{ label: string; value: string; helper?: string }> = [];
  if (hasText(display.opportunity_reason)) {
    whyFields.push({
      label: executive.opportunityReason,
      value: display.opportunity_reason,
    });
  }
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
  if (typeof display.confidence === "number" && display.confidence > 0) {
    whyFields.push({
      label: executive.confidence,
      value: `${display.confidence}%`,
    });
  }

  const needFields: Array<{ label: string; value: string }> = [];
  if (hasText(display.pain_points)) {
    needFields.push({
      label: executive.painPoints,
      value: display.pain_points,
    });
  }
  if (hasText(display.summary)) {
    needFields.push({
      label: executive.summary,
      value: display.summary,
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
  if (hasText(display.risk_level)) {
    timingFields.push({
      label: executive.riskLevel,
      value: display.risk_level,
    });
  }

  const riskFields: Array<{ label: string; value: string }> = [];
  if (hasText(display.risk_level)) {
    riskFields.push({
      label: executive.riskLevel,
      value: display.risk_level,
    });
  }

  const recommendValue = hasText(display.recommended_action)
    ? display.recommended_action
    : "";

  return (
    <>
      {whyFields.length > 0 ? (
        <Section title={convert.whyMatters}>
          {whyFields.map((field) => (
            <Field key={field.label} {...field} />
          ))}
        </Section>
      ) : null}

      {needFields.length > 0 ? (
        <Section title={convert.whatTheyNeed}>
          {needFields.map((field) => (
            <Field key={field.label} {...field} />
          ))}
        </Section>
      ) : null}

      {timingFields.length > 0 ? (
        <Section title={convert.timingAndIntent}>
          <div className="grid gap-4 sm:grid-cols-2">
            {timingFields.map((field) => (
              <Field key={field.label} {...field} />
            ))}
          </div>
        </Section>
      ) : null}

      {riskFields.length > 0 ? (
        <Section title={convert.risksAndObjections}>
          {riskFields.map((field) => (
            <Field key={field.label} {...field} />
          ))}
        </Section>
      ) : null}

      {recommendValue ? (
        <Section title={convert.whatAthenaRecommends}>
          <Field
            label={executive.recommendedAction}
            value={recommendValue}
            helper={convert.recommendedHelper}
          />
          {hasText(recommendedCta?.content) ? (
            <Field
              label={convert.draftNextStep}
              value={recommendedCta.content.trim()}
            />
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
