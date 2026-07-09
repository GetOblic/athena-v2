import Link from "next/link";
import type { ReactNode } from "react";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { StrategicAssetBlueprint } from "@/components/assetBlueprints/StrategicAssetBlueprint";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { AnalyzeDiscussionButton } from "@/components/discussions/AnalyzeDiscussionButton";
import { AppendDiscussionUpdateForm } from "@/components/discussions/AppendDiscussionUpdateForm";
import { AthenaRecommendationRibbon } from "@/components/discussions/AthenaRecommendationRibbon";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { DiscussionAgeBadge } from "@/components/discussions/DiscussionAgeBadge";
import { DiscussionHeaderActions } from "@/components/discussions/DiscussionHeaderActions";
import { DiscussionLifecycleBadge } from "@/components/discussions/DiscussionLifecycleBadge";
import { DiscussionStatusControl } from "@/components/discussions/DiscussionStatusControl";
import { DiscussionWorkflowStrip } from "@/components/discussions/DiscussionWorkflowStrip";
import { ExecutiveIntelligenceCard } from "@/components/discussions/ExecutiveIntelligenceCard";
import { RegenerationMetadata } from "@/components/discussions/RegenerationMetadata";
import {
  getOriginalDiscussionBody,
  getThreadUpdatesForDisplay,
} from "@/lib/discussionContent";
import { buildDiscussionWorkflowSteps } from "@/lib/discussionWorkflow";
import { getDisplayAssetBlueprintByDiscussionId } from "@/services/assetBlueprints/assetBlueprintService";
import { getCommunityById } from "@/services/communityService";
import { getDiscussionById } from "@/services/discussionService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { buildDiscussionDeploymentAssets } from "@/lib/deploymentAssets";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getDiscussionUpdatesByDiscussionId } from "@/services/discussionUpdateService";
import {
  getIntelligenceDomainName,
  getIntelligenceDomains,
} from "@/services/intelligenceDomainService";

export const dynamic = "force-dynamic";

export default async function DiscussionDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const discussion = await getDiscussionById(id, organizationId);

  if (!discussion) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />
        <Link href="/discussions" className="text-sm text-[var(--athena-orange)]">
          ← Back to Discussions
        </Link>

        <h1 className="mt-8 text-4xl font-semibold">Discussion not found</h1>
      </main>
    );
  }

  const [community, latestAnalysis, assetBlueprint, threadUpdates, opportunity, domains] =
    await Promise.all([
      discussion.community_id
        ? getCommunityById(discussion.community_id, organizationId)
        : Promise.resolve(null),
      getLatestDiscussionAnalysis(id, organizationId),
      getDisplayAssetBlueprintByDiscussionId(id, organizationId),
      getDiscussionUpdatesByDiscussionId(id, organizationId),
      getOpportunityByDiscussionId(id, organizationId),
      getIntelligenceDomains(organizationId),
    ]);

  const briefing = opportunity
    ? await getLatestReviewByOpportunityId(opportunity.id, organizationId)
    : null;

  const deploymentAssets = buildDiscussionDeploymentAssets(latestAnalysis);
  const originalBody = getOriginalDiscussionBody(discussion);
  const displayedUpdates = getThreadUpdatesForDisplay(
    discussion,
    threadUpdates,
  );
  const hasAnalysis = Boolean(latestAnalysis);
  const workflowSteps = buildDiscussionWorkflowSteps({
    analysis: latestAnalysis,
    opportunity,
    briefing,
    assetBlueprint,
  });

  const intelligenceDomainOptions = domains.map((domain) => ({
    id: domain.id,
    name: getIntelligenceDomainName(domain),
  }));

  const initialRegenerationSnapshot = {
    latestAnalysisId: latestAnalysis?.id ?? null,
    latestAnalysisCreatedAt: latestAnalysis?.created_at ?? null,
    latestAnalysisUpdatedAt: latestAnalysis?.updated_at ?? null,
    blueprintUpdatedAt: assetBlueprint?.updated_at ?? null,
    regenerationInFlight: false,
  };

  return (
    <DiscussionRegenerationProvider
      discussionId={id}
      initialSnapshot={initialRegenerationSnapshot}
    >
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/discussions" className="text-sm text-[var(--athena-orange)]">
        ← Back to Discussions
      </Link>

      <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Discussion Intelligence
          </div>

          <h1 className="mt-4 max-w-5xl text-5xl font-semibold tracking-tight">
            {discussion.title}
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            Executive-grade intelligence for this captured market discussion.
          </p>
        </div>

        <DiscussionHeaderActions
          discussion={discussion}
          originalBody={originalBody}
          intelligenceDomains={intelligenceDomainOptions}
        />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeaderMetric label="Platform" value={discussion.platform} />
        <HeaderMetric label="Author" value={discussion.author || "—"} />
        <HeaderMetric label="Intelligence Domain" value={community?.group_name || "—"} />
        <HeaderMetric label="Lifecycle">
          <DiscussionLifecycleBadge
            discussion={discussion}
            hasAnalysis={hasAnalysis}
          />
        </HeaderMetric>
        <HeaderMetric
          label="Opportunity Score"
          value={String(discussion.opportunity_score)}
          highlight="orange"
        />
        <HeaderMetric label="Thread Age">
          <DiscussionAgeBadge discussion={discussion} />
        </HeaderMetric>
        <HeaderMetric label="Source URL">
          {discussion.url ? (
            <a
              href={discussion.url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[var(--athena-orange)] underline"
            >
              {discussion.url}
            </a>
          ) : (
            "—"
          )}
        </HeaderMetric>
      </div>

      <div className="mt-4 max-w-md">
        <DiscussionStatusControl discussion={discussion} hasAnalysis={hasAnalysis} />
      </div>

      <DiscussionWorkflowStrip steps={workflowSteps} />

      <div className="mt-8">
        <DiscussionRegenerationProgress />
      </div>

      {latestAnalysis ? (
        <>
          <div className="mt-8">
            <AthenaRecommendationRibbon analysis={latestAnalysis} />
            <RegenerationMetadata analysis={latestAnalysis} />
          </div>

          <div id="executive-intelligence" className="mt-6 scroll-mt-24">
            <ExecutiveIntelligenceCard analysis={latestAnalysis} />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Executive Intelligence
          </div>
          <p className="mt-4 text-white/50">
            Run Athena analysis to unlock executive intelligence for this
            discussion.
          </p>
        </div>
      )}

      {deploymentAssets.length > 0 && (
        <div className="mt-8">
          <DeploymentAssets assets={deploymentAssets} />
        </div>
      )}

      {assetBlueprint && (
        <div className="mt-8">
          <StrategicAssetBlueprint blueprint={assetBlueprint} />
        </div>
      )}

      <div className="mt-8">
        <AppendDiscussionUpdateForm discussionId={discussion.id} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <section className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8 lg:col-span-2">
          <h2 className="text-xl font-semibold">Original Discussion</h2>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Field label="Author" value={discussion.author} />
            <Field label="Intelligence Domain" value={community?.group_name} />
            <Field label="Platform" value={discussion.platform} />
            <Field label="Original Sentiment" value={discussion.sentiment} />
            <Field label="Source URL" value={discussion.url} link={discussion.url} />
          </div>

          <div className="mt-8">
            <div className="text-sm text-white/40">Discussion</div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
              {originalBody || "No body captured."}
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold">Thread Updates / Follow-ups</h3>

            {displayedUpdates.length === 0 ? (
              <div className="mt-4 text-sm text-white/45">
                No follow-up updates captured yet.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {displayedUpdates.map((update) => (
                  <div
                    key={update.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5"
                  >
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                      <span>
                        {new Date(update.capturedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {update.author ? <span>{update.author}</span> : null}
                      {update.url ? (
                        <a
                          href={update.url}
                          className="text-[var(--athena-orange)] underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source URL
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3 text-sm leading-7 text-white/70">
                      {update.body}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">Detailed Athena Reasoning</h2>

            {latestAnalysis && (
              <div className="text-sm text-white/40">
                Analysis Status:{" "}
                <span className="text-[var(--athena-orange)]">
                  {latestAnalysis.status}
                </span>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-7">
            {latestAnalysis ? (
              <>
                <Field label="Summary" value={latestAnalysis.summary} />
                <Field label="Sentiment" value={latestAnalysis.sentiment} />
                <Field label="Intent" value={latestAnalysis.intent} />
                <Field label="Buyer Stage" value={latestAnalysis.buyer_stage} />
                <Field label="Pain Points" value={latestAnalysis.pain_points} />
                <Field
                  label="Opportunity"
                  value={latestAnalysis.opportunity_detected ? "Yes" : "No"}
                />
                <Field
                  label="Opportunity Title"
                  value={latestAnalysis.opportunity_title}
                />
                <Field
                  label="Opportunity Reason"
                  value={latestAnalysis.opportunity_reason}
                />
                <Field
                  label="Strategic Recommendation"
                  sublabel="Recommended Action"
                  value={latestAnalysis.recommended_action}
                  helper="Guidance for internal decision-making."
                />
                <Field label="Risk Level" value={latestAnalysis.risk_level} />
                <Field label="Confidence" value={`${latestAnalysis.confidence}%`} />
              </>
            ) : (
              <div className="text-white/50">
                No generated Athena analysis has been saved for this discussion yet.
              </div>
            )}

            <AnalyzeDiscussionButton discussionId={discussion.id} />
          </div>
        </section>
      </div>
      </main>
    </DiscussionRegenerationProvider>
  );
}

function HeaderMetric({
  label,
  value,
  highlight,
  children,
}: {
  label: string;
  value?: string;
  highlight?: "orange";
  children?: ReactNode;
}) {
  const color =
    highlight === "orange" ? "text-[var(--athena-orange)]" : "text-white";

  return (
    <div className="rounded-[20px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className={`mt-3 text-lg font-semibold ${children ? "" : color}`}>
        {children ?? value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  helper,
  sublabel,
  link,
}: {
  label: string;
  value?: string | null;
  helper?: string;
  sublabel?: string;
  link?: string | null;
}) {
  return (
    <div>
      <div className="text-sm text-white/40">
        {label}
        {sublabel && (
          <span className="ml-2 text-xs text-white/30">({sublabel})</span>
        )}
      </div>
      {helper && (
        <div className="mt-1 text-xs leading-5 text-white/30">{helper}</div>
      )}
      <div className="mt-2 text-base leading-7 text-white/80">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="break-all text-[var(--athena-orange)] underline"
          >
            {value || link}
          </a>
        ) : (
          value || "—"
        )}
      </div>
    </div>
  );
}
