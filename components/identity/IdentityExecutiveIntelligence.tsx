import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { WebsiteAnalyzedPagesList } from "@/components/websiteLearning/WebsiteAnalyzedPagesList";
import { formatTenantDateTime } from "@/lib/tenantI18n/format";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  buildIdentityWebsiteCoverageView,
  readIdentityExecutiveIntelligence,
  type IdentityBusinessModelMap,
  type IdentityConfidenceLevel,
  type IdentityExecutiveIntelligence as IdentityExecutiveIntelligenceData,
  type IdentityWebsiteCoverageView,
  type IdentityWebsiteSourcePage,
} from "@/services/identity/identityExecutiveIntelligence";
import type { AthenaIdentity } from "@/services/identity/identityService";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type IdentityCopy = TenantMessages["identity"];

type IdentityExecutiveIntelligenceProps = {
  identity: AthenaIdentity | null;
  messages: IdentityCopy;
  language: OrganizationLanguage;
};

const PAGE_GROUP_KEYS = {
  Homepage: "pageGroupHomepage",
  About: "pageGroupAbout",
  Services: "pageGroupServices",
  Products: "pageGroupProducts",
  Pricing: "pageGroupPricing",
  "Training / Education": "pageGroupTraining",
  "Case Studies": "pageGroupCaseStudies",
  FAQ: "pageGroupFaq",
  "Blog / Resources": "pageGroupBlog",
  Contact: "pageGroupContact",
  Policies: "pageGroupPolicies",
  Other: "pageGroupOther",
} as const satisfies Record<string, keyof IdentityCopy["executive"]>;

export function IdentityExecutiveIntelligence({
  identity,
  messages,
  language,
}: IdentityExecutiveIntelligenceProps) {
  if (!identity) return null;

  const copy = messages.executive;
  const executive = readIdentityExecutiveIntelligence(identity.master_profile);
  const coverage = buildIdentityWebsiteCoverageView({
    website: identity.website,
    websiteIntelligence: identity.website_intelligence,
    masterProfileGeneratedAt: identity.master_profile_generated_at,
    lastDeepScrapeAt: identity.last_deep_scrape_at,
    lastDeepScrapePages: identity.last_deep_scrape_pages,
  });

  if (!executive) {
    if (identity.brain_status === "ready" && identity.master_profile) {
      return (
        <section
          className={`mt-10 rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.eyebrow}
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
            {copy.legacyBody}
          </p>
        </section>
      );
    }
    return null;
  }

  const modelEntries = listBusinessModelEntries(executive.business_model);
  const lastUpdated =
    identity.master_profile_generated_at ?? identity.brain_last_updated;

  return (
    <section className="mt-10 space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <article
          className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.eyebrow}
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {copy.title}
          </h2>
          <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-white/75">
            {executive.executive_summary}
          </p>
        </article>

        <UnderstandingDiagnostic
          executive={executive}
          lastUpdated={lastUpdated}
          coverage={coverage}
          messages={copy}
          language={language}
        />
      </div>

      {modelEntries.length > 0 ? (
        <AthenaCollapsibleSection
          eyebrow={copy.businessModelEyebrow}
          title={copy.businessModelTitle}
          defaultOpen={false}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {modelEntries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-white/10 bg-black/20 p-5"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  {messages.businessModel[key]}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/70">{value}</p>
              </div>
            ))}
          </div>
        </AthenaCollapsibleSection>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <WebsiteIntelligenceCoverageCard
          coverage={coverage}
          messages={copy}
          language={language}
        />
        <SignalsCard signals={executive.hidden_signals} messages={copy} />
      </div>

      <CalibrationCard gaps={executive.calibration_gaps} messages={copy} />
    </section>
  );
}

function UnderstandingDiagnostic({
  executive,
  lastUpdated,
  coverage,
  messages,
  language,
}: {
  executive: IdentityExecutiveIntelligenceData;
  lastUpdated: string | null | undefined;
  coverage: IdentityWebsiteCoverageView;
  messages: IdentityCopy["executive"];
  language: OrganizationLanguage;
}) {
  return (
    <aside
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {messages.diagnosticEyebrow}
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        {messages.diagnosticTitle}
      </h3>

      <div className="mt-6 space-y-3">
        <DiagnosticRow
          label={messages.understandingConfidence}
          level={executive.confidence_level}
          messages={messages}
        />
        <DiagnosticRow
          label={messages.voiceAlignment}
          level={executive.voice_alignment}
          messages={messages}
        />
        <DiagnosticRow
          label={messages.knowledgeCoverage}
          level={executive.business_knowledge_coverage}
          messages={messages}
        />
        <DiagnosticRow
          label={messages.websiteCoverage}
          level={executive.website_evidence_coverage}
          messages={messages}
        />
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            {messages.lastUpdated}
          </div>
          <div className="mt-2 text-sm text-white/70">
            {lastUpdated ? formatTenantDateTime(lastUpdated, language) : "—"}
          </div>
          <div className="mt-1 text-xs text-white/40">
            {messages.evidenceMode}{" "}
            {coverage.learningMode === "deep"
              ? messages.evidenceDeep
              : messages.evidenceHomepage}
          </div>
        </div>
      </div>

      {executive.confidence_reasons.length > 0 ? (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            {messages.confidenceReasons}
          </div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-white/65">
            {executive.confidence_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function DiagnosticRow({
  label,
  level,
  messages,
}: {
  label: string;
  level: IdentityConfidenceLevel;
  messages: IdentityCopy["executive"];
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-sm text-white/60">{label}</span>
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]">
        {localizeConfidence(level, messages)}
      </span>
    </div>
  );
}

function WebsiteIntelligenceCoverageCard({
  coverage,
  messages,
  language,
}: {
  coverage: IdentityWebsiteCoverageView;
  messages: IdentityCopy["executive"];
  language: OrganizationLanguage;
}) {
  const grouped = groupSourcePages(coverage.sourcePages);

  return (
    <article
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {messages.websiteCoverageEyebrow}
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        {messages.websiteCoverageTitle}
      </h3>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <CoverageStat label={messages.domain} value={coverage.websiteDomain ?? "—"} />
        <CoverageStat
          label={messages.learningMode}
          value={
            coverage.learningMode === "deep"
              ? messages.evidenceDeep
              : messages.evidenceHomepage
          }
        />
        <CoverageStat
          label={messages.pagesAnalyzed}
          value={String(coverage.pagesAnalyzed)}
        />
        <CoverageStat
          label={messages.sourcePagesListed}
          value={String(coverage.pagesSelected ?? 0)}
        />
        <CoverageStat
          label={messages.lastDeepScrape}
          value={
            coverage.lastDeepScrapeAt
              ? formatTenantDateTime(coverage.lastDeepScrapeAt, language)
              : "—"
          }
        />
        <CoverageStat
          label={messages.latestRetraining}
          value={
            coverage.lastRetrainedAt
              ? formatTenantDateTime(coverage.lastRetrainedAt, language)
              : "—"
          }
        />
      </dl>

      {coverage.learningMode === "homepage" ? (
        <p className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100/90">
          {messages.homepageOnlyNotice}
        </p>
      ) : null}

      {coverage.sourcePages.length > 0 ? (
        <div className="mt-6">
          <AthenaCollapsibleSection
            title={messages.analyzedSourcePages}
            defaultOpen={false}
            className="!rounded-2xl border-white/10"
          >
            <div className="space-y-5">
              {grouped.map(([group, pages]) => (
                <div key={group}>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    {localizePageGroup(group, messages)}
                  </div>
                  <div className="mt-3">
                    <WebsiteAnalyzedPagesList
                      pages={pages}
                      emptyMessage={messages.emptyPages}
                      untitledLabel={messages.untitledPage}
                    />
                  </div>
                </div>
              ))}
            </div>
          </AthenaCollapsibleSection>
        </div>
      ) : null}
    </article>
  );
}

function SignalsCard({
  signals,
  messages,
}: {
  signals: IdentityExecutiveIntelligenceData["hidden_signals"];
  messages: IdentityCopy["executive"];
}) {
  return (
    <article
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {messages.signalsEyebrow}
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        {messages.signalsTitle}
      </h3>

      {signals.length === 0 ? (
        <p className="mt-5 text-sm leading-7 text-white/50">
          {messages.signalsEmpty}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {signals.map((signal) => (
            <li
              key={`${signal.finding}:${signal.why_it_matters}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <div className="text-sm font-semibold text-white/85">
                {messages.findingPrefix} {signal.finding}
              </div>
              <div className="mt-2 text-sm leading-6 text-white/60">
                {messages.whyItMattersPrefix} {signal.why_it_matters}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function CalibrationCard({
  gaps,
  messages,
}: {
  gaps: IdentityExecutiveIntelligenceData["calibration_gaps"];
  messages: IdentityCopy["executive"];
}) {
  return (
    <article
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {messages.calibrationEyebrow}
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        {messages.calibrationTitle}
      </h3>

      {gaps.length === 0 ? (
        <p className="mt-5 text-sm leading-7 text-white/55">
          {messages.calibrationEmpty}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {gaps.map((gap) => (
            <li
              key={`${gap.what_is_unclear}:${gap.update_location}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <div className="text-sm font-semibold text-white/85">
                {messages.whatIsUnclearPrefix} {gap.what_is_unclear}
              </div>
              <div className="mt-2 text-sm leading-6 text-white/60">
                {messages.whyItMattersPrefix} {gap.why_it_matters}
              </div>
              <div className="mt-2 text-sm text-[var(--athena-orange)]">
                {messages.updatePrefix} {gap.update_location}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm leading-6 text-white/50">
        {messages.retrainHint}
      </p>
    </article>
  );
}

function CoverageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <dt className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </dt>
      <dd className="mt-2 text-sm text-white/75">{value}</dd>
    </div>
  );
}

function localizeConfidence(
  level: IdentityConfidenceLevel,
  messages: IdentityCopy["executive"],
): string {
  if (level === "strong") return messages.confidenceStrong;
  if (level === "developing") return messages.confidenceDeveloping;
  return messages.confidenceLimited;
}

function localizePageGroup(
  group: string,
  messages: IdentityCopy["executive"],
): string {
  const key = PAGE_GROUP_KEYS[group as keyof typeof PAGE_GROUP_KEYS];
  return key ? messages[key] : group;
}

function listBusinessModelEntries(
  model: IdentityBusinessModelMap,
): Array<[keyof IdentityBusinessModelMap, string]> {
  return (
    Object.entries(model) as Array<[keyof IdentityBusinessModelMap, string]>
  ).filter(([, value]) => Boolean(value?.trim()));
}

function groupSourcePages(
  pages: IdentityWebsiteSourcePage[],
): Array<[string, IdentityWebsiteSourcePage[]]> {
  const map = new Map<string, IdentityWebsiteSourcePage[]>();
  for (const page of pages) {
    const list = map.get(page.group) ?? [];
    list.push(page);
    map.set(page.group, list);
  }
  return Array.from(map.entries());
}
