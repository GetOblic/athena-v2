export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ReactNode } from "react";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { DiscussionWorkflowStrip } from "@/components/discussions/DiscussionWorkflowStrip";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { AppendProspectInformationForm } from "@/components/prospects/AppendProspectInformationForm";
import { ProspectMetadataEditor } from "@/components/prospects/ProspectMetadataEditor";
import {
  formatProspectOpportunityScore,
  resolveProspectDisplayStatus,
  resolveProspectOpportunityScore,
} from "@/services/prospects/prospectDisplay";
import { getActiveGenerationJobForDiscussion } from "@/services/generationJobs/generationJobService";
import { buildDiscussionWorkflowSteps } from "@/lib/discussionWorkflow";
import { getDisplayAssetBlueprintByDiscussionId } from "@/services/assetBlueprints/assetBlueprintService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import {
  getExecutiveVersionsForDiscussionPage,
  loadLiveExecutiveIntelligence,
} from "@/services/executiveVersions/executiveVersionService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getProspectById } from "@/services/prospects/prospectService";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";

export default async function ProspectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const prospect = await getProspectById(id, organizationId);

  if (!prospect) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />
        <Link href="/prospects" className="text-sm text-[var(--athena-orange)]">
          ← Prospects
        </Link>
        <h1 className="mt-8 text-4xl font-semibold">Prospect not found</h1>
      </main>
    );
  }

  const discussionId = prospect.linked_discussion_id;
  const discussion = discussionId
    ? await getDiscussionById(discussionId, organizationId)
    : null;

  const [
    latestAnalysis,
    assetBlueprint,
    opportunity,
    versionState,
    liveIntelligence,
  ] = discussion
    ? await Promise.all([
        getLatestDiscussionAnalysis(discussion.id, organizationId),
        getDisplayAssetBlueprintByDiscussionId(discussion.id, organizationId),
        getOpportunityByDiscussionId(discussion.id, organizationId),
        getExecutiveVersionsForDiscussionPage(discussion.id, organizationId),
        loadLiveExecutiveIntelligence(discussion.id, organizationId),
      ])
    : [null, null, null, { versions: [], current: null }, null];

  const briefing = opportunity
    ? await getLatestReviewByOpportunityId(opportunity.id, organizationId)
    : null;

  const workflowSteps = buildDiscussionWorkflowSteps({
    analysis: versionState.current?.intelligence.analysis ?? latestAnalysis,
    opportunity:
      versionState.current?.intelligence.opportunity ?? opportunity,
    briefing: versionState.current?.intelligence.briefing ?? briefing,
    assetBlueprint:
      versionState.current?.intelligence.blueprint ?? assetBlueprint,
  });

  const initialRegenerationSnapshot = {
    latestAnalysisId: latestAnalysis?.id ?? null,
    latestAnalysisCreatedAt: latestAnalysis?.created_at ?? null,
    latestAnalysisUpdatedAt: latestAnalysis?.updated_at ?? null,
    blueprintUpdatedAt: assetBlueprint?.updated_at ?? null,
    regenerationInFlight: false,
  };

  const websiteIntel = prospect.website_intelligence ?? {};
  const activeJob = discussion
    ? await getActiveGenerationJobForDiscussion(discussion.id, organizationId)
    : null;
  const hasCurrentVersion = Boolean(versionState.current);
  const displayStatus = resolveProspectDisplayStatus({
    prospectStatus: prospect.status,
    jobStatus: activeJob?.status ?? null,
    jobStage: activeJob?.current_stage ?? null,
    hasCurrentVersion,
  });
  const currentVersionScore = resolveProspectOpportunityScore({
    canonicalScore:
      versionState.current?.intelligence.opportunity?.score ??
      opportunity?.score ??
      null,
    denormalizedScore: prospect.opportunity_score,
  });
  const scrapeStatus = !prospect.website
    ? "No website provided"
    : typeof websiteIntel.error === "string" && websiteIntel.error
      ? "Homepage learning incomplete — generation continued with available fields"
      : typeof websiteIntel.scraped_at === "string"
        ? "Homepage learned"
        : "Homepage learning pending";

  return (
    <DiscussionRegenerationProvider
      discussionId={discussion?.id ?? prospect.id}
      initialSnapshot={initialRegenerationSnapshot}
    >
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />
        <Link href="/prospects" className="text-sm text-[var(--athena-orange)]">
          ← Prospects
        </Link>

        <div className="mt-10">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Prospect Intelligence
          </div>
          <h1 className="mt-4 max-w-5xl text-5xl font-semibold tracking-tight">
            {prospect.business_name}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            Executive-grade intelligence for this prospect relationship.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HeaderMetric label="Website" value={prospect.website || "—"} />
          <HeaderMetric label="Industry" value={prospect.industry || "—"} />
          <HeaderMetric
            label="Decision Maker"
            value={prospect.decision_maker || "—"}
          />
          <HeaderMetric label="Job Title" value={prospect.job_title || "—"} />
          <HeaderMetric label="Email" value={prospect.email || "—"} />
          <HeaderMetric label="Phone" value={prospect.phone || "—"} />
          <HeaderMetric label="Status" value={displayStatus} />
          <HeaderMetric
            label="Opportunity Score"
            value={formatProspectOpportunityScore(currentVersionScore)}
            highlight="orange"
          />
          <HeaderMetric
            label="Created"
            value={new Date(prospect.created_at).toLocaleDateString("en-US")}
          />
          <HeaderMetric
            label="Updated"
            value={new Date(prospect.updated_at).toLocaleDateString("en-US")}
          />
          <HeaderMetric label="LinkedIn" value={prospect.linkedin || "—"} />
          <HeaderMetric label="Source" value={prospect.source || "—"} />
          <HeaderMetric label="Homepage Learning" value={scrapeStatus} />
          <HeaderMetric
            label="Last Scraped"
            value={
              typeof websiteIntel.scraped_at === "string"
                ? new Date(websiteIntel.scraped_at).toLocaleString("en-US")
                : "—"
            }
          />
        </div>

        <div className="mt-8">
          <ProspectMetadataEditor prospect={prospect} />
        </div>

        {discussion ? (
          <>
            <DiscussionWorkflowStrip steps={workflowSteps} />
            <div className="mt-8">
              <DiscussionRegenerationProgress />
            </div>
            <div className="mt-8">
              <AppendProspectInformationForm
                prospectId={prospect.id}
                discussionId={discussion.id}
              />
            </div>
            <ExecutiveIntelligenceWorkspace
              discussionId={discussion.id}
              sourceKind="prospect"
              versions={versionState.versions}
              fallbackIntelligence={
                versionState.current?.intelligence ?? liveIntelligence
              }
              afterBlueprint={null}
              originalDiscussionSection={
                <section className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8 lg:col-span-2">
                  <h2 className="text-xl font-semibold">
                    Prospect Details
                  </h2>
                  <div className="mt-8 grid gap-6 md:grid-cols-2">
                    <Field label="Business Name" value={prospect.business_name} />
                    <Field label="Website" value={prospect.website} link={prospect.website} />
                    <Field label="Industry" value={prospect.industry} />
                    <Field label="Category" value={prospect.category} />
                    <Field label="Decision Maker" value={prospect.decision_maker} />
                    <Field label="Job Title" value={prospect.job_title} />
                    <Field label="Email" value={prospect.email} />
                    <Field label="Phone" value={prospect.phone} />
                    <Field
                      label="Location"
                      value={[prospect.address, prospect.city, prospect.state, prospect.country]
                        .filter(Boolean)
                        .join(", ") || null}
                    />
                    <Field label="Company Size" value={prospect.company_size} />
                    <Field label="Revenue" value={prospect.revenue} />
                    <Field label="Employee Count" value={prospect.employee_count} />
                    <Field label="Technologies" value={prospect.technologies} />
                    <Field label="Pain Points" value={prospect.pain_points} />
                    <Field label="Source" value={prospect.source} />
                  </div>
                  <div className="mt-8">
                    <div className="text-sm text-white/40">Homepage Intelligence</div>
                    <div className="mt-2 text-xs text-white/35">{scrapeStatus}</div>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70 whitespace-pre-wrap">
                      {[
                        typeof websiteIntel.positioning === "string"
                          ? `Positioning:\n${websiteIntel.positioning}`
                          : null,
                        typeof websiteIntel.products === "string"
                          ? `Products:\n${websiteIntel.products}`
                          : null,
                        typeof websiteIntel.services === "string"
                          ? `Services:\n${websiteIntel.services}`
                          : null,
                        typeof websiteIntel.about === "string"
                          ? `About:\n${websiteIntel.about}`
                          : null,
                        typeof websiteIntel.target_audience === "string"
                          ? `Target Audience:\n${websiteIntel.target_audience}`
                          : null,
                        typeof websiteIntel.messaging === "string"
                          ? `Messaging:\n${websiteIntel.messaging}`
                          : null,
                        typeof websiteIntel.value_proposition === "string"
                          ? `Value Proposition:\n${websiteIntel.value_proposition}`
                          : null,
                        typeof websiteIntel.cta === "string"
                          ? `CTA:\n${websiteIntel.cta}`
                          : null,
                        typeof websiteIntel.differentiators === "string"
                          ? `Differentiators:\n${websiteIntel.differentiators}`
                          : null,
                        typeof websiteIntel.trust_signals === "string"
                          ? `Trust Signals:\n${websiteIntel.trust_signals}`
                          : null,
                        typeof websiteIntel.contact_information === "string"
                          ? `Contact Information:\n${websiteIntel.contact_information}`
                          : null,
                        typeof websiteIntel.brand_tone === "string"
                          ? `Brand Tone:\n${websiteIntel.brand_tone}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join("\n\n") || "No homepage intelligence captured yet."}
                    </div>
                  </div>
                </section>
              }
            />
          </>
        ) : (
          <div className="mt-8 rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-10 text-white/50">
            Prospect Intelligence has not been queued yet. Use Refresh
            Intelligence to start asynchronous generation.
          </div>
        )}
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
    <div className="rounded-[22px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-5">
      <div className="text-xs uppercase tracking-[0.22em] text-white/35">
        {label}
      </div>
      <div className={`mt-3 text-lg font-semibold ${color}`}>
        {children ?? value ?? "—"}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  link,
}: {
  label: string;
  value?: string | null;
  link?: string | null;
}) {
  return (
    <div>
      <div className="text-sm text-white/40">{label}</div>
      <div className="mt-2 text-sm text-white/75">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--athena-orange)] underline"
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
