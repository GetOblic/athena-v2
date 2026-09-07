export const dynamic = "force-dynamic";

import Link from "next/link";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { SeoGenerationTypeBadge } from "@/components/seo/SeoGenerationTypeBadge";
import { SeoLibraryClient } from "@/components/seo/SeoLibraryClient";
import { VisibilityPageHeader } from "@/components/seo/VisibilityPageHeader";
import {
  deriveVisibilityLandingState,
  olderReadyThanLatest,
  otherReadyLens,
  type VisibilityLandingReport,
} from "@/lib/seo/visibilityLandingState";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  getLocalizedSeoLensLabel,
  getLocalizedSeoReportStatusLabel,
} from "@/lib/tenantI18n/seoPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { toPublicSeoReportSummary } from "@/services/seo/seoReportPublic";
import { listSeoReports } from "@/services/seo/seoReportService";

function LatestReportCard({
  report,
  heading,
  note,
  messages,
  language,
  showSummary = false,
}: {
  report: VisibilityLandingReport;
  heading: string;
  note?: string;
  messages: TenantMessages;
  language: OrganizationLanguage;
  showSummary?: boolean;
}) {
  const copy = messages.seo;
  const date = formatTenantDate(report.createdAt, language);

  return (
    <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
        {heading}
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
        <SeoGenerationTypeBadge
          generationType={report.generationType}
          label={getLocalizedSeoLensLabel(messages, report.generationType)}
        />
        <span className="text-sm text-white/50">
          {getLocalizedSeoReportStatusLabel(messages, report.status)}
        </span>
        {date ? <span className="text-sm text-white/50">{date}</span> : null}
      </div>
      <h2 className="mt-4 break-words text-xl font-semibold">{report.name}</h2>
      {note ? (
        <p className="mt-3 text-sm leading-6 text-white/55">{note}</p>
      ) : null}
      {showSummary && report.summary ? (
        <p className="mt-3 line-clamp-4 text-sm leading-7 text-white/70">
          {report.summary}
        </p>
      ) : null}
      <div className="mt-5 flex w-full flex-col gap-3 sm:flex-row">
        <Link
          href={`/seo/${report.id}`}
          className="w-full rounded-2xl border border-white/15 px-5 py-3 text-center text-sm font-semibold text-white/85 sm:w-auto"
        >
          {copy.visibility.openAnalysis}
        </Link>
      </div>
    </section>
  );
}

function TwoLensExplanation({
  messages,
  compact,
}: {
  messages: TenantMessages;
  compact?: boolean;
}) {
  const copy = messages.seo.visibility;
  return (
    <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
      <h2 className="text-lg font-semibold">{copy.lensesHeading}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold">
            {messages.seo.lenses.intelligence}
          </div>
          <p className="mt-2 text-sm leading-6 text-white/55">
            {copy.strategyLensHelp}
          </p>
        </div>
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold">
            {messages.seo.lenses.technical}
          </div>
          <p className="mt-2 text-sm leading-6 text-white/55">
            {compact ? copy.healthLensHelp : copy.healthLensExplanatory}
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function SeoIntelligencePage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.seo;

  let reports: ReturnType<typeof toPublicSeoReportSummary>[] = [];
  let loadError: string | null = null;

  try {
    reports = (await listSeoReports(organizationId)).map(
      toPublicSeoReportSummary,
    );
  } catch (error) {
    console.error("[SEO_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error ? error.message : copy.loadFailed;
  }

  const state = deriveVisibilityLandingState(reports);
  const olderReady = olderReadyThanLatest(state.latest, state.lastReady);
  const otherLens = otherReadyLens(state.latest, state);

  return (
    <TenantAppShell currentPath="/seo" messages={messages}>
      <VisibilityPageHeader
        eyebrow={copy.visibility.eyebrow}
        title={copy.visibility.title}
        subtitle={copy.visibility.subtitle}
      />

      {loadError ? (
        <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-10 text-center">
          <h2 className="text-2xl font-semibold text-rose-100">
            {copy.unableToLoad}
          </h2>
          <p className="mx-auto mt-4 max-w-xl break-words text-sm leading-7 text-rose-100/70">
            {loadError}
          </p>
        </div>
      ) : reports.length === 0 ? (
        <div className="space-y-6">
          <section className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-8 sm:p-10">
            <h2 className="text-2xl font-semibold">{copy.visibility.emptyTitle}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/50">
              {copy.visibility.emptyBody}
            </p>
            <Link
              href="/seo/new"
              className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white sm:w-auto"
            >
              {copy.visibility.analyzeCta}
            </Link>
          </section>
          <TwoLensExplanation messages={messages} />
        </div>
      ) : (
        <div className="space-y-8">
          {state.latest ? (
            <LatestReportCard
              report={state.latest}
              heading={copy.visibility.latestAnalysis}
              note={
                state.latest.status === "Queued"
                  ? copy.visibility.queuedNote
                  : state.latest.status === "Processing"
                    ? copy.visibility.processingNote
                    : state.latest.status === "Processing Failed"
                      ? copy.visibility.failedNote
                      : undefined
              }
              showSummary={state.latest.status === "Ready"}
              messages={messages}
              language={language}
            />
          ) : null}

          {state.latest?.status === "Ready" && otherLens ? (
            <LatestReportCard
              report={otherLens}
              heading={
                otherLens.generationType === "technical"
                  ? copy.visibility.lastReadyHealth
                  : copy.visibility.lastReadyStrategy
              }
              showSummary
              messages={messages}
              language={language}
            />
          ) : null}

          {state.latest &&
          state.latest.status !== "Ready" &&
          olderReady ? (
            <LatestReportCard
              report={olderReady}
              heading={
                olderReady.generationType === "technical"
                  ? copy.visibility.lastReadyHealth
                  : copy.visibility.lastReadyStrategy
              }
              note={
                state.latest.status === "Processing Failed"
                  ? copy.visibility.priorReadyAvailable
                  : undefined
              }
              showSummary
              messages={messages}
              language={language}
            />
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/seo/new"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white sm:w-auto"
            >
              {copy.visibility.newAnalysisCta}
            </Link>
          </div>

          <TwoLensExplanation messages={messages} compact />

          <SeoLibraryClient
            reports={reports}
            messages={messages}
            language={language}
          />
        </div>
      )}
    </TenantAppShell>
  );
}
