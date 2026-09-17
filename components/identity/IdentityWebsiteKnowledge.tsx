import type { ReactNode } from "react";
import { Globe, RefreshCw } from "lucide-react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { WebsiteAnalyzedPagesList } from "@/components/websiteLearning/WebsiteAnalyzedPagesList";
import {
  groupSourcePages,
  IDENTITY_CARD_ICON_CLASS,
  IDENTITY_CARD_SURFACE_CLASS,
  IDENTITY_FIELD_ANCHORS,
  IDENTITY_HEADER_RETRAIN_ACTION_CLASS,
  localizePageGroup,
  readPublicWebsiteStudySections,
  readWebsiteKnowledgeFlags,
  shouldDisplayClientDeepScrapeCompletion,
} from "@/components/identity/identityPagePresentation";
import { formatTenantDateTime } from "@/lib/tenantI18n/format";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { buildIdentityWebsiteCoverageView } from "@/services/identity/identityExecutiveIntelligence";
import type { AthenaIdentity } from "@/services/identity/identityService";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type IdentityCopy = TenantMessages["identity"];

type IdentityWebsiteKnowledgeProps = {
  identity: AthenaIdentity | null;
  messages: IdentityCopy;
  language: OrganizationLanguage;
  trained: boolean;
  deepScrape: ReactNode;
  generationLocked?: boolean;
};

export function IdentityWebsiteKnowledge({
  identity,
  messages,
  language,
  trained,
  deepScrape,
  generationLocked = false,
}: IdentityWebsiteKnowledgeProps) {
  const page = messages.page;
  const copy = messages.executive;
  const flags = readWebsiteKnowledgeFlags(identity);

  if (
    !trained &&
    !flags.hasWebsiteUrl &&
    !flags.hasUsableWebsiteIntelligence
  ) {
    return null;
  }

  const coverage = identity
    ? buildIdentityWebsiteCoverageView({
        website: identity.website,
        websiteIntelligence: identity.website_intelligence,
        masterProfileGeneratedAt: identity.master_profile_generated_at,
        lastDeepScrapeAt: identity.last_deep_scrape_at,
        lastDeepScrapePages: identity.last_deep_scrape_pages,
      })
    : null;

  const showInheritedStudy = flags.hasInheritedWebsiteStudy;
  const inheritedSections = showInheritedStudy
    ? readPublicWebsiteStudySections(identity?.website_intelligence)
    : [];
  const showDeepEvidence = flags.hasDeepIntelligence && coverage;
  const showHomepageLearned = trained && flags.hasHomepageLearning;
  const lastDeepLearningAt = shouldDisplayClientDeepScrapeCompletion(identity)
    ? identity?.last_deep_scrape_at ?? null
    : null;
  const deepPagesAnalyzed =
    showDeepEvidence && coverage && typeof coverage.pagesAnalyzed === "number"
      ? coverage.pagesAnalyzed
      : null;

  return (
    <AthenaCollapsibleSection
      id={IDENTITY_FIELD_ANCHORS.websiteKnowledge}
      title={page.websiteKnowledgeTitle}
      summary={
        generationLocked ? page.websiteLearnedHelp : page.websiteDeepScrapeHelp
      }
      defaultOpen={false}
      tone="identity"
      icon={<Globe size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.blue}
      className={`${IDENTITY_CARD_SURFACE_CLASS.blue} scroll-mt-24`}
      headerActions={
        generationLocked ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
            {deepScrape}
            <a
              href={`#${IDENTITY_FIELD_ANCHORS.teach}`}
              className={IDENTITY_HEADER_RETRAIN_ACTION_CLASS}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {trained ? messages.retrainAthena : messages.trainAthena}
            </a>
          </div>
        )
      }
    >
      <div className="space-y-4 text-sm leading-6 text-white/65">
        {!flags.hasWebsiteUrl && !showInheritedStudy ? (
          <p>{page.websiteNoUrl}</p>
        ) : showInheritedStudy ? (
          <>
            <p>{page.websiteAlreadyStudied}</p>
            {flags.hasDeepIntelligence ? (
              <p>{page.websiteAlreadyStudiedDeep}</p>
            ) : null}
            <p>{page.websiteInheritedNeedsTrain}</p>
          </>
        ) : !trained ? (
          <p>{page.websiteWillStudy}</p>
        ) : (
          <>
            {showHomepageLearned ? <p>{page.websiteLearnedHomepage}</p> : null}
            {showDeepEvidence ? <p>{page.websiteLearnedDeep}</p> : null}
          </>
        )}
      </div>

      {inheritedSections.length > 0 ? (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {inheritedSections.map((section) => (
            <div
              key={section.key}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <dt className="text-xs uppercase tracking-[0.2em] text-white/35">
                {section.key.replace(/_/g, " ")}
              </dt>
              <dd className="mt-2 text-sm text-white/75">{section.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {showDeepEvidence ? (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {lastDeepLearningAt ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.2em] text-white/35">
                {page.websiteLastDeepLearning}
              </dt>
              <dd className="mt-2 text-sm text-white/75">
                {formatTenantDateTime(lastDeepLearningAt, language)}
              </dd>
            </div>
          ) : null}
          {deepPagesAnalyzed != null ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.2em] text-white/35">
                {copy.pagesAnalyzed}
              </dt>
              <dd className="mt-2 text-sm text-white/75">{deepPagesAnalyzed}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {showDeepEvidence && coverage.sourcePages.length > 0 ? (
        <div className="mt-6">
          <AthenaCollapsibleSection
            title={copy.analyzedSourcePages}
            defaultOpen={false}
            className="!rounded-2xl border-white/10"
          >
            <div className="space-y-5">
              {groupSourcePages(coverage.sourcePages).map(([group, pages]) => (
                <div key={group}>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    {localizePageGroup(group, copy)}
                  </div>
                  <div className="mt-3">
                    <WebsiteAnalyzedPagesList
                      pages={pages}
                      emptyMessage={copy.emptyPages}
                      untitledLabel={copy.untitledPage}
                    />
                  </div>
                </div>
              ))}
            </div>
          </AthenaCollapsibleSection>
        </div>
      ) : null}

      <p className="mt-6 text-sm leading-6 text-white/50">
        {generationLocked ? page.websiteLearnedHelp : page.websiteDeepScrapeHelp}
      </p>
    </AthenaCollapsibleSection>
  );
}
