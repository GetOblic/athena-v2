export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StrategicAssetBlueprint } from "@/components/assetBlueprints/StrategicAssetBlueprint";
import { StrategicAssetBlueprintEmpty } from "@/components/assetBlueprints/StrategicAssetBlueprintEmpty";
import { BriefingStatusBadge } from "@/components/briefings/BriefingStatusBadge";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { GenerateReviewButton } from "@/components/opportunities/GenerateReviewButton";
import { OpportunityStatusControl } from "@/components/opportunities/OpportunityStatusControl";
import { DeploymentReadinessBadge } from "@/components/queues/DeploymentReadinessBadge";
import { buildOpportunityDeploymentAssets } from "@/lib/deploymentAssets";
import { getLocalizedBriefingStatusLabel } from "@/lib/tenantI18n/briefingPresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  getLocalizedDeploymentReadinessLabel,
  getLocalizedWhyNowSummary,
  getOpportunityDeploymentAssetsChrome,
  getOpportunityStatusLabelMap,
  getOpportunityStrategicAssetBlueprintChrome,
} from "@/lib/tenantI18n/opportunityPresentation";
import { getDisplayAssetBlueprintForBriefing } from "@/services/assetBlueprints/assetBlueprintService";
import { getOrganizationAiWorkspacePreferences } from "@/services/identity/aiWorkspacePreferences";
import { getOpportunityById } from "@/services/opportunityService";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OpportunityPage({ params }: Props) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();

  const [opportunity, { messages }] = await Promise.all([
    getOpportunityById(id, organizationId),
    getTenantLocalization(),
  ]);

  if (!opportunity) {
    notFound();
  }

  const copy = messages.opportunities;
  const detail = copy.detail;

  const [briefing, continuationPreferences] = await Promise.all([
    getLatestReviewByOpportunityId(id, organizationId),
    getOrganizationAiWorkspacePreferences(organizationId),
  ]);
  const deploymentAssets = buildOpportunityDeploymentAssets(
    opportunity,
    briefing,
  );
  const whyNow = getLocalizedWhyNowSummary(
    messages,
    opportunity,
    briefing?.summary,
  );
  const assetBlueprint = briefing
    ? await getDisplayAssetBlueprintForBriefing({
        briefingId: briefing.id,
        organizationId,
        discussionId: opportunity.discussion_id,
      })
    : null;

  const executiveSummary =
    briefing?.summary?.trim() ||
    opportunity.ai_summary?.trim() ||
    opportunity.reason?.trim() ||
    null;

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-8 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />

      <TenantBackLink href="/opportunities" label={copy.backToOpportunities} />

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {detail.eyebrow}
          </div>

          <h1 className="mt-4 text-5xl font-semibold">{opportunity.title}</h1>

          <p className="mt-4 max-w-3xl text-white/50">
            {detail.subtitle}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          {opportunity.discussion_id ? (
            <Link
              href={`/discussions/${opportunity.discussion_id}`}
              className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
            >
              {detail.viewSourceDiscussion}
            </Link>
          ) : (
            <div className="text-sm text-white/45">{detail.noSourceDiscussion}</div>
          )}

          {briefing ? (
            <Link
              href={`/briefings/${briefing.id}`}
              className="rounded-full border border-white/15 px-7 py-4 text-sm font-semibold text-white/75 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
            >
              {detail.openExecutiveBriefing}
            </Link>
          ) : (
            <div className="text-sm text-white/45">{detail.noExecutiveBriefing}</div>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="text-white/40">{detail.salesStatus}</div>
          <p className="mt-2 text-sm text-white/45">
            {detail.salesStatusHelp}
          </p>
          <div className="mt-4">
            <OpportunityStatusControl
              opportunityId={opportunity.id}
              currentStatus={opportunity.status}
              chrome={{
                updateStatus: detail.updateStatus,
                saving: detail.saving,
                saveChanges: detail.saveChanges,
                statusUpdated: detail.statusUpdated,
                statusUpdateFailed: detail.statusUpdateFailed,
                unknownError: detail.unknownError,
                statusLabels: getOpportunityStatusLabelMap(messages),
              }}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="text-white/40">{detail.deploymentReadiness}</div>
          <p className="mt-2 text-sm text-white/45">
            {detail.deploymentReadinessHelp}
          </p>
          <div className="mt-4">
            <DeploymentReadinessBadge
              briefingStatus={briefing?.status ?? null}
              size="lg"
              label={getLocalizedDeploymentReadinessLabel(
                messages,
                briefing?.status ?? null,
              )}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Metric label={detail.score} value={String(opportunity.score)} tone="orange" />
        <Metric label={detail.urgency} value={opportunity.urgency || copy.emptyValue} />
        <Metric label={detail.intent} value={opportunity.intent || copy.emptyValue} />
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-2xl font-semibold">{detail.executiveSummary}</h2>
        <p className="mt-4 leading-7 text-white/75">
          {executiveSummary || detail.noExecutiveSummary}
        </p>
        {whyNow ? (
          <div className="mt-8 border-t border-white/10 pt-8">
            <h3 className="text-lg font-semibold text-white/90">{detail.whyNow}</h3>
            <p className="mt-3 leading-7 text-white/70">{whyNow}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--athena-orange)]/20 bg-[var(--athena-orange)]/5 p-8">
        <h2 className="text-2xl font-semibold">{detail.recommendedAction}</h2>
        <p className="mt-4 leading-7 text-white/75">
          {opportunity.recommended_action?.trim() ||
            opportunity.ai_recommendation?.trim() ||
            detail.noRecommendedAction}
        </p>
      </div>

      {deploymentAssets.length > 0 && (
        <div className="mt-8">
          <DeploymentAssets
            assets={deploymentAssets}
            continuationPreferences={continuationPreferences}
            chrome={getOpportunityDeploymentAssetsChrome(messages)}
          />
        </div>
      )}

      <div className="mt-8 rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">{detail.executiveBriefing}</h2>
          <p className="mt-2 text-sm text-white/45">
            {detail.executiveBriefingHelp}
          </p>
        </div>

        {briefing ? (
          <div className="space-y-6">
            <Field
              label={detail.summary}
              value={briefing.summary}
              emptyValue={copy.emptyValue}
            />
            <Field
              label={detail.painPoints}
              value={briefing.pain_points}
              emptyValue={copy.emptyValue}
            />
            <Field
              label={detail.buyerStage}
              value={briefing.buyer_stage}
              emptyValue={copy.emptyValue}
            />
            <Field
              label={detail.confidence}
              value={`${briefing.confidence}%`}
              emptyValue={copy.emptyValue}
            />
            <div>
              <div className="mb-2 text-white/40">{detail.status}</div>
              <BriefingStatusBadge
                status={briefing.status}
                label={getLocalizedBriefingStatusLabel(
                  messages,
                  briefing.status,
                )}
              />
            </div>
            <Link
              href={`/briefings/${briefing.id}`}
              className="inline-block text-sm text-[var(--athena-orange)]"
            >
              {detail.openFullBriefing}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-white/50">{detail.noExecutiveBriefing}</div>
            <GenerateReviewButton
              opportunityId={opportunity.id}
              chrome={{
                help: detail.refreshBriefingHelp,
                refresh: detail.refreshBriefing,
                refreshing: detail.refreshingBriefing,
                refreshFailed: detail.refreshFailed,
                unknownError: detail.unknownError,
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-8">
        {assetBlueprint ? (
          <StrategicAssetBlueprint
            blueprint={assetBlueprint}
            continuationPreferences={continuationPreferences}
            chrome={getOpportunityStrategicAssetBlueprintChrome(messages)}
          />
        ) : (
          <StrategicAssetBlueprintEmpty
            eyebrow={detail.blueprintEmptyEyebrow}
            message={detail.blueprintEmptyMessage}
          />
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value?: string;
  tone?: "warning" | "orange";
  children?: ReactNode;
}) {
  const color =
    tone === "warning"
      ? "text-[var(--athena-warning)]"
      : tone === "orange"
        ? "text-[var(--athena-orange)]"
        : "text-white";

  return (
    <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-white/40">{label}</div>
      <div className={`mt-4 ${children ? "" : `text-2xl font-semibold capitalize ${color}`}`}>
        {children ?? value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  helper,
  emptyValue = "—",
}: {
  label: string;
  value?: string | null;
  helper?: string;
  emptyValue?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-white/40">{label}</div>
      {helper && (
        <div className="mb-2 text-xs leading-5 text-white/30">{helper}</div>
      )}
      <div className="leading-7 text-white/80">{value || emptyValue}</div>
    </div>
  );
}
