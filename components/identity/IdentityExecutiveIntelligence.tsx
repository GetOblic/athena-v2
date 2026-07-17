import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import {
  BUSINESS_MODEL_FIELD_LABELS,
  buildIdentityWebsiteCoverageView,
  formatIdentityConfidenceLabel,
  readIdentityExecutiveIntelligence,
  type IdentityBusinessModelMap,
  type IdentityConfidenceLevel,
  type IdentityExecutiveIntelligence as IdentityExecutiveIntelligenceData,
  type IdentityWebsiteCoverageView,
  type IdentityWebsiteSourcePage,
} from "@/services/identity/identityExecutiveIntelligence";
import type { AthenaIdentity } from "@/services/identity/identityService";

type IdentityExecutiveIntelligenceProps = {
  identity: AthenaIdentity | null;
};

export function IdentityExecutiveIntelligence({
  identity,
}: IdentityExecutiveIntelligenceProps) {
  if (!identity) return null;

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
            Executive Intelligence
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            What Athena understands about your business
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
            This Brain was trained before Executive Intelligence was available.
            Update your Voice or Business Knowledge above, then select Train
            Athena to generate this section.
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
            Executive Intelligence
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            What Athena understands about your business
          </h2>
          <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-white/75">
            {executive.executive_summary}
          </p>
        </article>

        <UnderstandingDiagnostic
          executive={executive}
          lastUpdated={lastUpdated}
          coverage={coverage}
        />
      </div>

      {modelEntries.length > 0 ? (
        <AthenaCollapsibleSection
          eyebrow="Athena’s Business Model"
          title="Understanding map"
          defaultOpen={false}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {modelEntries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-white/10 bg-black/20 p-5"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  {BUSINESS_MODEL_FIELD_LABELS[key]}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/70">{value}</p>
              </div>
            ))}
          </div>
        </AthenaCollapsibleSection>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <WebsiteIntelligenceCoverageCard coverage={coverage} />
        <SignalsCard signals={executive.hidden_signals} />
      </div>

      <CalibrationCard gaps={executive.calibration_gaps} />
    </section>
  );
}

function UnderstandingDiagnostic({
  executive,
  lastUpdated,
  coverage,
}: {
  executive: IdentityExecutiveIntelligenceData;
  lastUpdated: string | null | undefined;
  coverage: IdentityWebsiteCoverageView;
}) {
  return (
    <aside
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Understanding Diagnostic
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        How strong is Athena’s current model?
      </h3>

      <div className="mt-6 space-y-3">
        <DiagnosticRow
          label="Understanding Confidence"
          level={executive.confidence_level}
        />
        <DiagnosticRow label="Voice Alignment" level={executive.voice_alignment} />
        <DiagnosticRow
          label="Business Knowledge Coverage"
          level={executive.business_knowledge_coverage}
        />
        <DiagnosticRow
          label="Website Evidence Coverage"
          level={executive.website_evidence_coverage}
        />
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            Last Updated
          </div>
          <div className="mt-2 text-sm text-white/70">
            {lastUpdated ? new Date(lastUpdated).toLocaleString() : "—"}
          </div>
          <div className="mt-1 text-xs text-white/40">
            Evidence mode:{" "}
            {coverage.learningMode === "deep"
              ? "Deep Website Intelligence"
              : "Homepage"}
          </div>
        </div>
      </div>

      {executive.confidence_reasons.length > 0 ? (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            Why Athena has this confidence
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
}: {
  label: string;
  level: IdentityConfidenceLevel;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-sm text-white/60">{label}</span>
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]">
        {formatIdentityConfidenceLabel(level)}
      </span>
    </div>
  );
}

function WebsiteIntelligenceCoverageCard({
  coverage,
}: {
  coverage: IdentityWebsiteCoverageView;
}) {
  const grouped = groupSourcePages(coverage.sourcePages);

  return (
    <article
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Website Intelligence Coverage
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        Evidence Athena learned from
      </h3>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <CoverageStat label="Domain" value={coverage.websiteDomain ?? "—"} />
        <CoverageStat
          label="Learning mode"
          value={
            coverage.learningMode === "deep"
              ? "Deep Website Intelligence"
              : "Homepage"
          }
        />
        <CoverageStat
          label="Pages analyzed"
          value={String(coverage.pagesAnalyzed)}
        />
        <CoverageStat
          label="Source pages listed"
          value={String(coverage.pagesSelected ?? 0)}
        />
        <CoverageStat
          label="Last deep scrape"
          value={
            coverage.lastDeepScrapeAt
              ? new Date(coverage.lastDeepScrapeAt).toLocaleString()
              : "—"
          }
        />
        <CoverageStat
          label="Latest retraining"
          value={
            coverage.lastRetrainedAt
              ? new Date(coverage.lastRetrainedAt).toLocaleString()
              : "—"
          }
        />
      </dl>

      {coverage.learningMode === "homepage" ? (
        <p className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100/90">
          Homepage intelligence only. Deep Scrape Website can provide broader
          evidence from secondary pages.
        </p>
      ) : null}

      {coverage.sourcePages.length > 0 ? (
        <div className="mt-6">
          <AthenaCollapsibleSection
            title="Analyzed source pages"
            defaultOpen={false}
            className="!rounded-2xl border-white/10"
          >
            <div className="space-y-5">
              {grouped.map(([group, pages]) => (
                <div key={group}>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    {group}
                  </div>
                  <ul className="mt-3 space-y-3">
                    {pages.map((page) => (
                      <li
                        key={page.url}
                        className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                      >
                        <div className="text-sm font-medium text-white/80">
                          {page.title || "Untitled page"}
                        </div>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block break-all text-xs text-[var(--athena-orange)] underline-offset-2 hover:underline"
                        >
                          {page.url}
                        </a>
                        <div className="mt-1 text-xs text-white/40">
                          {page.pageType}
                        </div>
                      </li>
                    ))}
                  </ul>
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
}: {
  signals: IdentityExecutiveIntelligenceData["hidden_signals"];
}) {
  return (
    <article
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Signals Athena noticed
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        Non-obvious business signals
      </h3>

      {signals.length === 0 ? (
        <p className="mt-5 text-sm leading-7 text-white/50">
          No material hidden signals yet. Broader website evidence usually
          improves this after Deep Scrape Website.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {signals.map((signal) => (
            <li
              key={`${signal.finding}:${signal.why_it_matters}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <div className="text-sm font-semibold text-white/85">
                Finding: {signal.finding}
              </div>
              <div className="mt-2 text-sm leading-6 text-white/60">
                Why it matters: {signal.why_it_matters}
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
}: {
  gaps: IdentityExecutiveIntelligenceData["calibration_gaps"];
}) {
  return (
    <article
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Brain Calibration
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight">
        Help Athena understand you better
      </h3>

      {gaps.length === 0 ? (
        <p className="mt-5 text-sm leading-7 text-white/55">
          Athena did not find material gaps to clarify right now. Keep Voice and
          Business Knowledge current as your offers evolve.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {gaps.map((gap) => (
            <li
              key={`${gap.what_is_unclear}:${gap.update_location}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <div className="text-sm font-semibold text-white/85">
                What is unclear: {gap.what_is_unclear}
              </div>
              <div className="mt-2 text-sm leading-6 text-white/60">
                Why it matters: {gap.why_it_matters}
              </div>
              <div className="mt-2 text-sm text-[var(--athena-orange)]">
                Update: {gap.update_location}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm leading-6 text-white/50">
        Update your Voice or Business Knowledge above, then select Train Athena
        to retrain the Brain.
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
