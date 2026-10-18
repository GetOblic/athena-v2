import type { ReactNode } from "react";
import { ExecutiveIntelligenceCard } from "@/components/discussions/ExecutiveIntelligenceCard";
import { GetoblicContentEditor } from "@/components/prospects/GetoblicContentEditor";
import { ProspectIdentityContactGlance } from "@/components/prospects/ProspectIdentityContactGlance";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { knowledgeBaseSuggestionForEditor } from "@/lib/prospects/historicalKnowledgeBaseSuggestion";
import { toGetoblicContentEditorSaved } from "@/lib/prospects/getoblicContentEditorState";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { formatTenantDateTime } from "@/lib/tenantI18n/format";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { ClientProspectIntelligenceVersionView, ClientProspectIntelligenceView } from "@/services/clientProspectIntelligence/clientProspectIntelligenceRead";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

const WEBSITE_LABEL_KEYS = {
  positioning: "positioning",
  products: "products",
  services: "services",
  about: "about",
  target_audience: "targetAudience",
  messaging: "messaging",
  value_proposition: "valueProposition",
  cta: "cta",
  differentiators: "differentiators",
  trust_signals: "trustSignals",
  contact_information: "contactInformation",
  brand_tone: "brandTone",
} as const;

function formatWhen(value: string, language: OrganizationLanguage): string {
  return formatTenantDateTime(value, language) || value;
}

function Section({
  title,
  children,
  section,
}: {
  title: string;
  children: ReactNode;
  section: string;
}) {
  return (
    <section
      data-client-prospect-intelligence-section={section}
      className={`rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS}`}
    >
      <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/50">
      {children}
    </p>
  );
}

function Prose({ children }: { children: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">{children}</p>
  );
}

function VersionBody({
  version,
  copy,
  language,
}: {
  version: ClientProspectIntelligenceVersionView;
  copy: TenantMessages["clientProspectIntelligence"];
  language: OrganizationLanguage;
}) {
  return (
    <div className="space-y-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
        {formatWhen(version.generatedAt, language)}
      </p>
      {version.analysis ? (
        <ExecutiveIntelligenceCard
          analysis={version.analysis}
          sourceKind="prospect"
        />
      ) : null}
      <div>
        <h3 className="text-sm font-semibold text-white">{copy.opportunityTitle}</h3>
        {version.opportunity ? (
          <div className="mt-3 space-y-3">
            {version.opportunity.title ? <Prose>{version.opportunity.title}</Prose> : null}
            {version.opportunity.reason ? <Prose>{version.opportunity.reason}</Prose> : null}
            {version.opportunity.recommendedAction ? (
              <Prose>{version.opportunity.recommendedAction}</Prose>
            ) : null}
          </div>
        ) : (
          <div className="mt-3">
            <Empty>{copy.opportunityEmpty}</Empty>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{copy.briefingTitle}</h3>
        {version.briefing ? (
          <div className="mt-3 space-y-4">
            {version.briefing.summary ? <Prose>{version.briefing.summary}</Prose> : null}
            {version.briefing.painPoints ? (
              <Prose>{version.briefing.painPoints}</Prose>
            ) : null}
            {version.briefing.recommendedResponse ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.recommendedResponse}
                </div>
                <div className="mt-2">
                  <Prose>{version.briefing.recommendedResponse}</Prose>
                </div>
              </div>
            ) : null}
            {version.briefing.cta ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.cta}
                </div>
                <div className="mt-2">
                  <Prose>{version.briefing.cta}</Prose>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3">
            <Empty>{copy.briefingEmpty}</Empty>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{copy.blueprintTitle}</h3>
        {version.blueprint ? (
          <dl className="mt-3 space-y-4">
            {version.blueprint.title ? (
              <div>
                <dd className="text-sm leading-7 text-white/80">
                  {version.blueprint.title}
                </dd>
              </div>
            ) : null}
            {version.blueprint.businessGoal ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.goal}
                </dt>
                <dd className="mt-2">
                  <Prose>{version.blueprint.businessGoal}</Prose>
                </dd>
              </div>
            ) : null}
            {version.blueprint.targetAudience ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.audience}
                </dt>
                <dd className="mt-2">
                  <Prose>{version.blueprint.targetAudience}</Prose>
                </dd>
              </div>
            ) : null}
            {version.blueprint.priority ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.priority}
                </dt>
                <dd className="mt-2">
                  <Prose>{version.blueprint.priority}</Prose>
                </dd>
              </div>
            ) : null}
            {version.blueprint.notes ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.notes}
                </dt>
                <dd className="mt-2">
                  <Prose>{version.blueprint.notes}</Prose>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <div className="mt-3">
            <Empty>{copy.blueprintEmpty}</Empty>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{copy.assetsTitle}</h3>
        {version.deploymentAssets.length > 0 ? (
          <div className="mt-3 space-y-4">
            {version.deploymentAssets.map((asset) => (
              <article key={asset.key}>
                <h4 className="text-sm font-medium text-white">{asset.title}</h4>
                <div className="mt-2">
                  <Prose>{asset.content}</Prose>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <Empty>{copy.assetsEmpty}</Empty>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{copy.knowledgeBaseTitle}</h3>
        {version.knowledgeBase ? (
          <div className="mt-3">
            <Prose>{version.knowledgeBase}</Prose>
          </div>
        ) : (
          <div className="mt-3">
            <Empty>{copy.knowledgeBaseEmpty}</Empty>
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientProspectIntelligenceUnavailable({
  copy,
}: {
  copy: TenantMessages["clientProspectIntelligence"];
}) {
  return (
    <div data-client-prospect-intelligence="unavailable" className="max-w-3xl">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {copy.eyebrow}
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
        {copy.unavailableTitle}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
        {copy.unavailableBody}
      </p>
    </div>
  );
}

export function ClientProspectIntelligenceWorkspace({
  view,
  messages,
  language,
}: {
  view: ClientProspectIntelligenceView;
  messages: TenantMessages;
  language: OrganizationLanguage;
}) {
  const copy = messages.clientProspectIntelligence;
  const homepage = messages.prospects.homepage;
  const jobStatusLabel = view.deepScrape?.jobStatus
    ? copy.jobStatus[view.deepScrape.jobStatus as keyof typeof copy.jobStatus] ??
      view.deepScrape.jobStatus
    : null;

  return (
    <div
      data-client-prospect-intelligence="workspace"
      className="mx-auto flex max-w-5xl flex-col gap-8"
    >
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
          {view.businessName}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">{copy.intro}</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/40">
          {copy.readOnlyNotice}
        </p>
      </header>

      <Section title={copy.businessTitle} section="business">
        <ProspectIdentityContactGlance
          prospect={view.prospect}
          messages={messages.prospects}
        />
      </Section>

      <Section title={copy.discussionTitle} section="discussion">
        {view.discussion ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">{view.discussion.title}</h3>
            {view.discussion.summary ? <Prose>{view.discussion.summary}</Prose> : null}
            {view.discussion.body ? <Prose>{view.discussion.body}</Prose> : null}
          </div>
        ) : (
          <Empty>{copy.discussionEmpty}</Empty>
        )}
      </Section>

      <Section title={copy.websiteTitle} section="website">
        {view.websiteSections.length > 0 ? (
          <div className="space-y-4">
            {view.websiteSections.map((section) => (
              <article key={section.key}>
                <h3 className="text-sm font-semibold text-white">
                  {homepage[WEBSITE_LABEL_KEYS[section.key as keyof typeof WEBSITE_LABEL_KEYS]]}
                </h3>
                <div className="mt-2">
                  <Prose>{section.text}</Prose>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>{copy.websiteEmpty}</Empty>
        )}
      </Section>

      <Section title={copy.deepScrapeTitle} section="deep-scrape">
        {view.deepScrape ? (
          <div className="space-y-4 text-sm leading-7 text-white/75">
            {view.deepScrape.provider ? (
              <p>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {copy.deepScrapeProvider}
                </span>
                <span className="mt-1 block">{view.deepScrape.provider}</span>
              </p>
            ) : null}
            {view.deepScrape.url ? <p>{view.deepScrape.url}</p> : null}
            {view.deepScrape.pagesAnalyzed != null ? (
              <p>
                {interpolateTenantMessage(copy.deepScrapePages, {
                  count: view.deepScrape.pagesAnalyzed,
                })}
              </p>
            ) : null}
            {view.deepScrape.scrapedAt ? (
              <p>
                {copy.deepScrapeScrapedAt}:{" "}
                {formatWhen(view.deepScrape.scrapedAt, language)}
              </p>
            ) : null}
            {jobStatusLabel ? (
              <p>
                {copy.deepScrapeJobStatus}: {jobStatusLabel}
                {view.deepScrape.jobPagesAnalyzed != null
                  ? ` · ${interpolateTenantMessage(copy.deepScrapePages, {
                      count: view.deepScrape.jobPagesAnalyzed,
                    })}`
                  : ""}
              </p>
            ) : null}
            {view.deepScrape.pages.length > 0 ? (
              <ul className="space-y-2">
                {view.deepScrape.pages.map((page) => (
                  <li key={page.url}>
                    {page.title ? `${page.title} — ` : ""}
                    {page.url}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <Empty>{copy.deepScrapeEmpty}</Empty>
        )}
      </Section>

      <Section title={copy.descriptionTitle} section="description">
        {view.generatedDescription ? (
          <Prose>{view.generatedDescription}</Prose>
        ) : (
          <Empty>{copy.descriptionEmpty}</Empty>
        )}
      </Section>

      <GetoblicContentEditor
        surface="client"
        artifact="description"
        saved={toGetoblicContentEditorSaved(view.savedDescription)}
        savedReadFailed={!view.directoryArtifactsAvailable}
        showGenerate
        copy={copy.editor}
      />
      <GetoblicContentEditor
        surface="client"
        artifact="knowledge_base"
        saved={toGetoblicContentEditorSaved(view.savedKnowledgeBase)}
        historicalSuggestion={knowledgeBaseSuggestionForEditor({
          directoryArtifactsAvailable: view.directoryArtifactsAvailable,
          savedKnowledgeBase: view.savedKnowledgeBase,
          currentKnowledgeBase: view.currentVersion?.knowledgeBase ?? null,
        })}
        savedReadFailed={!view.directoryArtifactsAvailable}
        showGenerate
        copy={copy.editor}
      />

      <Section title={copy.currentTitle} section="current">
        {view.currentVersion ? (
          <div data-client-prospect-intelligence-current={view.currentVersion.versionNumber}>
            <div className="mb-4 inline-flex rounded-full border border-[var(--athena-orange)]/35 bg-[var(--athena-orange)]/15 px-3 py-1 text-xs font-semibold text-white">
              {copy.currentBadge}
            </div>
            <VersionBody
              version={view.currentVersion}
              copy={copy}
              language={language}
            />
          </div>
        ) : (
          <Empty>{copy.currentEmpty}</Empty>
        )}
      </Section>

      <Section title={copy.historyTitle} section="history">
        {view.historicalVersions.length > 0 ? (
          <div className="space-y-3">
            {view.historicalVersions.map((version) => (
              <details
                key={version.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
                data-client-prospect-intelligence-history={version.versionNumber}
              >
                <summary className="cursor-pointer text-sm font-semibold text-white">
                  {interpolateTenantMessage(copy.versionLabel, {
                    number: version.versionNumber,
                  })}
                </summary>
                <div className="mt-4">
                  <VersionBody version={version} copy={copy} language={language} />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty>{copy.historyEmpty}</Empty>
        )}
      </Section>
    </div>
  );
}
