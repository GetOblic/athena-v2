import type { ReactNode } from "react";
import {
  Heart,
  Layers,
  Megaphone,
  MessageSquare,
  PenLine,
  Radio,
  Signal,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { PersonaAthenaRecommendation } from "@/components/personas/PersonaAthenaRecommendation";
import { PersonaEmbeddedAssets } from "@/components/personas/PersonaEmbeddedAssets";
import { PersonaExecutiveSnapshot } from "@/components/personas/PersonaExecutiveSnapshot";
import { PersonaProfileFieldChips } from "@/components/personas/PersonaProfileFieldChips";
import {
  DeploymentAssets,
  type DeploymentAsset,
  type DeploymentAssetsChrome,
  type DeploymentDiscussPayload,
} from "@/components/deployment/DeploymentAssets";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  PERSONA_HOW_TO_REACH_FIELDS,
  PERSONA_WHAT_GETS_IN_THE_WAY_FIELDS,
  PERSONA_WHAT_THEY_CARE_ABOUT_FIELDS,
  PERSONA_WHO_THEY_ARE_FIELDS,
  groupPersonaJourneyAssets,
  presentPersonaFieldGroup,
  type PersonaJourneyChrome,
} from "@/lib/personas/personaDetailPresentation";
import {
  PERSONA_DETAIL_ICON,
  PERSONA_DETAIL_SURFACE,
  PERSONA_NESTED_CARD_CLASS,
} from "@/lib/personas/personaPagePresentation";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Persona } from "@/services/personas/personaService";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import type { AssetCopyTrackingContext } from "@/components/deployment/CopyButton";
import { WhyAthenaMatters } from "@/components/discussions/WhyAthenaMatters";
import { RegenerationMetadata } from "@/components/discussions/RegenerationMetadata";
import type { DiscussionExecutiveChrome } from "@/lib/discussionExecutiveChrome";
import { fillChromeTemplate } from "@/lib/discussionExecutiveChrome";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";
import { buildWhyAthenaBullets } from "@/lib/discussionExecutiveIntel";

type PersonaAudienceJourneyProps = {
  persona: Persona;
  analysis: DiscussionAnalysis | null;
  analysisAssets: DeploymentAsset[];
  deploymentAssets: DeploymentAsset[];
  chrome: PersonaJourneyChrome;
  messages: TenantMessages["personas"];
  executiveChrome?: DiscussionExecutiveChrome | null;
  locale?: string | null;
  generatedAt?: string | null;
  profileEditor: ReactNode;
  crossLinks: ReactNode;
  previousIntelligence: ReactNode;
  evidenceExtra: ReactNode;
  blueprint: ReactNode;
  executiveVersionId?: string | null;
  copyContext?: Omit<AssetCopyTrackingContext, "assetType"> | null;
  doneByAssetType?: Record<string, boolean>;
  tagsByAssetType?: Record<string, AssetUsageTag[]>;
  continuationPreferences?: AiWorkspacePreferences | null;
  onDiscussWithAthena?: (payload: DeploymentDiscussPayload) => void;
  assetChrome?: DeploymentAssetsChrome | null;
};

function whyBullets(
  analysis: DiscussionAnalysis,
  chrome?: DiscussionExecutiveChrome | null,
): string[] {
  const display = normalizeAnalysisForDisplay(analysis);
  if (!chrome) {
    return buildWhyAthenaBullets({ ...analysis, ...display });
  }
  const bullets: string[] = [];
  if (display.pain_points?.trim()) {
    bullets.push(
      fillChromeTemplate(chrome.whyPrimaryConcern, {
        value: display.pain_points.trim(),
      }),
    );
  }
  if (display.opportunity_reason?.trim()) {
    bullets.push(
      fillChromeTemplate(chrome.whyOpportunitySignal, {
        value: display.opportunity_reason.trim(),
      }),
    );
  }
  if (display.confidence != null) {
    bullets.push(
      fillChromeTemplate(chrome.whyConfidence, {
        value: display.confidence,
      }),
    );
  }
  return bullets.slice(0, 5);
}

export function PersonaAudienceJourney({
  persona,
  analysis,
  analysisAssets,
  deploymentAssets,
  chrome,
  messages,
  executiveChrome = null,
  locale = null,
  generatedAt = null,
  profileEditor,
  crossLinks,
  previousIntelligence,
  evidenceExtra,
  blueprint,
  executiveVersionId = null,
  copyContext = null,
  doneByAssetType = {},
  tagsByAssetType = {},
  continuationPreferences = null,
  onDiscussWithAthena,
  assetChrome = null,
}: PersonaAudienceJourneyProps) {
  const grouped = groupPersonaJourneyAssets(analysisAssets);
  const identityFields = presentPersonaFieldGroup(
    persona,
    PERSONA_WHO_THEY_ARE_FIELDS,
    chrome.fieldLabels,
  );
  const careFields = presentPersonaFieldGroup(
    persona,
    PERSONA_WHAT_THEY_CARE_ABOUT_FIELDS,
    chrome.fieldLabels,
  );
  const frictionFields = presentPersonaFieldGroup(
    persona,
    PERSONA_WHAT_GETS_IN_THE_WAY_FIELDS,
    chrome.fieldLabels,
  );
  const reachFields = presentPersonaFieldGroup(
    persona,
    PERSONA_HOW_TO_REACH_FIELDS,
    chrome.fieldLabels,
  );
  const display = analysis ? normalizeAnalysisForDisplay(analysis) : null;
  const reachAssets = [
    {
      id: "messaging",
      title: chrome.messaging,
      assets: grouped.reach.filter((asset) =>
        /messaging/i.test(`${asset.assetKey} ${asset.title}`),
      ),
    },
    {
      id: "tone",
      title: chrome.tone,
      assets: grouped.reach.filter((asset) =>
        /language|tone/i.test(`${asset.assetKey} ${asset.title}`),
      ),
    },
    {
      id: "channels",
      title: chrome.channels,
      assets: grouped.reach.filter((asset) =>
        /channel/i.test(`${asset.assetKey} ${asset.title}`),
      ),
    },
    {
      id: "offer",
      title: chrome.offerPositioning,
      assets: grouped.reach.filter((asset) =>
        /offer/i.test(`${asset.assetKey} ${asset.title}`),
      ),
    },
    {
      id: "value",
      title: chrome.valueProposition,
      assets: grouped.reach.filter((asset) =>
        /value_proposition|value proposition/i.test(
          `${asset.assetKey} ${asset.title}`,
        ),
      ),
    },
  ];

  const assetProps = {
    executiveVersionId,
    copyContext,
    doneByAssetType,
    tagsByAssetType,
    continuationPreferences,
    onDiscussWithAthena,
    chrome: assetChrome,
    analysisTitles: chrome.analysisTitles,
  };

  return (
    <div className="mt-8 space-y-8" data-persona-detail-journey="phase-1">
      {analysis ? (
        <PersonaExecutiveSnapshot
          analysis={analysis}
          chrome={chrome}
          messages={messages}
        />
      ) : null}

      {analysis ? (
        <PersonaAthenaRecommendation analysis={analysis} chrome={chrome} />
      ) : null}

      <AthenaCollapsibleSection
        id="persona-who-they-are"
        title={chrome.whoTheyAre}
        defaultOpen
        tone="intelligence"
        className={PERSONA_DETAIL_SURFACE.violet}
        icon={<UserRound />}
        iconClassName={PERSONA_DETAIL_ICON.violet}
      >
        <div data-persona-journey="who-they-are" className="space-y-6">
          {identityFields.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-white/80">
                {chrome.identitySlice}
              </h3>
              <div className="mt-3">
                <PersonaProfileFieldChips fields={identityFields} />
              </div>
            </div>
          ) : null}
          {grouped.who.length > 0 ? (
            <div data-persona-analysis-key="PERSONA_EXECUTIVE_PROFILE">
              <h3 className="mb-3 text-sm font-semibold text-white/80">
                {chrome.audienceProfile}
              </h3>
              <PersonaEmbeddedAssets assets={grouped.who} {...assetProps} />
            </div>
          ) : null}
          {profileEditor}
        </div>
      </AthenaCollapsibleSection>

      <AthenaCollapsibleSection
        id="persona-what-they-care-about"
        title={chrome.whatTheyCareAbout}
        defaultOpen
        tone="intelligence"
        className={PERSONA_DETAIL_SURFACE.green}
        icon={<Heart />}
        iconClassName={PERSONA_DETAIL_ICON.green}
      >
        <div
          data-persona-journey="what-they-care-about"
          data-persona-care-source="stored-profile"
        >
          <PersonaProfileFieldChips fields={careFields} />
        </div>
      </AthenaCollapsibleSection>

      <AthenaCollapsibleSection
        id="persona-what-gets-in-the-way"
        title={chrome.whatGetsInTheWay}
        defaultOpen
        tone="intelligence"
        className={PERSONA_DETAIL_SURFACE.amber}
        icon={<TriangleAlert />}
        iconClassName={PERSONA_DETAIL_ICON.amber}
      >
        <div data-persona-journey="what-gets-in-the-way" className="space-y-6">
          <PersonaProfileFieldChips fields={frictionFields} />
          {grouped.friction.length > 0 ? (
            <div data-persona-analysis-key="OBJECTION_HANDLING">
              <PersonaEmbeddedAssets assets={grouped.friction} {...assetProps} />
            </div>
          ) : null}
        </div>
      </AthenaCollapsibleSection>

      <AthenaCollapsibleSection
        id="persona-how-to-reach-them"
        title={chrome.howToReachThem}
        defaultOpen
        tone="intelligence"
        className={PERSONA_DETAIL_SURFACE.cyan}
        icon={<MessageSquare />}
        iconClassName={PERSONA_DETAIL_ICON.cyan}
      >
        <div data-persona-journey="how-to-reach-them" className="space-y-5">
          {reachFields.length > 0 ? (
            <PersonaProfileFieldChips fields={reachFields} />
          ) : null}
          {reachAssets.map((group) =>
            group.assets.length > 0 ? (
              <div
                key={group.id}
                className={PERSONA_NESTED_CARD_CLASS}
                data-persona-reach-card={group.id}
                data-persona-analysis-key={
                  group.id === "value"
                    ? "VALUE_PROPOSITION"
                    : group.id === "messaging"
                      ? "MESSAGING_FRAMEWORK"
                      : group.id === "tone"
                        ? "LANGUAGE_AND_TONE_GUIDE"
                        : group.id === "channels"
                          ? "CHANNEL_STRATEGY"
                          : "OFFER_POSITIONING"
                }
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`grid size-8 place-items-center rounded-xl ${PERSONA_DETAIL_ICON.cyan}`}
                  >
                    <Radio className="size-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-white">
                    {group.title}
                  </h3>
                </div>
                <PersonaEmbeddedAssets assets={group.assets} {...assetProps} />
              </div>
            ) : null,
          )}
        </div>
      </AthenaCollapsibleSection>

      <div data-persona-journey="what-to-create">
      <AthenaCollapsibleSection
        id="persona-what-to-create"
        title={chrome.whatToCreate}
        defaultOpen={false}
        tone="intelligence"
        className={PERSONA_DETAIL_SURFACE.orange}
        icon={<Megaphone />}
        iconClassName={PERSONA_DETAIL_ICON.orange}
      >
        <div data-persona-journey="what-to-create" className="space-y-6">
          <AthenaCollapsibleSection
            title={chrome.strategicCreation}
            defaultOpen={false}
            tone="intelligence"
            className={PERSONA_DETAIL_SURFACE.violet}
            icon={<PenLine />}
            iconClassName={PERSONA_DETAIL_ICON.violet}
          >
            <div
              data-persona-create-group="strategic"
              className="space-y-4"
            >
              {grouped.create.map((asset) => (
                <div
                  key={asset.assetKey ?? asset.title}
                  data-persona-analysis-key={canonicalAnalysisKey(asset)}
                >
                  <PersonaEmbeddedAssets assets={[asset]} {...assetProps} />
                </div>
              ))}
            </div>
          </AthenaCollapsibleSection>

          {deploymentAssets.length > 0 ? (
            <AthenaCollapsibleSection
              title={chrome.readyToUseAssets}
              defaultOpen={false}
              tone="intelligence"
              className={PERSONA_DETAIL_SURFACE.orange}
              icon={<Megaphone />}
              iconClassName={PERSONA_DETAIL_ICON.orange}
            >
              <div
                data-persona-create-group="publishable"
                data-persona-publishable-count={deploymentAssets.length}
              >
                <DeploymentAssets
                  executiveVersionId={executiveVersionId}
                  assets={deploymentAssets}
                  copyContext={copyContext}
                  doneByAssetType={doneByAssetType}
                  tagsByAssetType={tagsByAssetType}
                  continuationPreferences={continuationPreferences}
                  onDiscussWithAthena={onDiscussWithAthena}
                  chrome={{
                    ...assetChrome,
                    heading: chrome.readyToUseAssets,
                    hideGalleryChrome: true,
                    cardPresentation: "persona",
                    personaAccent: "orange",
                  }}
                  variant="embedded"
                />
              </div>
            </AthenaCollapsibleSection>
          ) : null}

          {blueprint}
        </div>
      </AthenaCollapsibleSection>
      {crossLinks}
      </div>

      <div data-persona-journey="evidence-signals">
      <AthenaCollapsibleSection
        id="persona-evidence-signals"
        title={chrome.evidenceSignals}
        defaultOpen={false}
        tone="intelligence"
        className={PERSONA_DETAIL_SURFACE.blue}
        icon={<Signal />}
        iconClassName={PERSONA_DETAIL_ICON.blue}
      >
        <div data-persona-journey="evidence-signals" className="space-y-6">
          {analysis ? (
            <WhyAthenaMatters
              bullets={whyBullets(analysis, executiveChrome)}
              title={chrome.whyMatters}
              presentation="persona"
            />
          ) : null}
          {analysis ? (
            <RegenerationMetadata
              analysis={analysis}
              generatedAt={generatedAt}
              chrome={executiveChrome}
              locale={locale}
            />
          ) : null}
          {evidenceExtra}
        </div>
      </AthenaCollapsibleSection>
      </div>

      <div data-persona-journey="advanced">
      <AthenaCollapsibleSection
        id="persona-advanced"
        title={chrome.advanced}
        defaultOpen={false}
        tone="intelligence"
        className={PERSONA_DETAIL_SURFACE.muted}
        icon={<Layers />}
        iconClassName={PERSONA_DETAIL_ICON.muted}
      >
        <div data-persona-journey="advanced" className="space-y-6">
          {display ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <AdvancedPill label={chrome.buyerStage} value={display.buyer_stage} />
              <AdvancedPill label={chrome.intent} value={display.intent} />
              <AdvancedPill label={chrome.risk} value={display.risk_level} />
            </div>
          ) : null}
          {display ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdvancedField
                label={executiveChrome?.sentiment ?? "Sentiment"}
                value={display.sentiment}
              />
              <AdvancedField
                label={executiveChrome?.opportunityTitle ?? chrome.recommendedAction}
                value={display.opportunity_title}
              />
              <AdvancedField
                label={executiveChrome?.opportunityReason ?? "Opportunity"}
                value={display.opportunity_reason}
              />
              <AdvancedField
                label={`${chrome.confidence} (raw)`}
                value={
                  display.confidence != null ? `${display.confidence}%` : null
                }
              />
            </div>
          ) : null}
          {grouped.leftover.length > 0 ? (
            <div data-persona-leftover-analysis="true">
              <PersonaEmbeddedAssets assets={grouped.leftover} {...assetProps} />
            </div>
          ) : null}
          {previousIntelligence}
        </div>
      </AthenaCollapsibleSection>
      </div>
    </div>
  );
}

function canonicalAnalysisKey(asset: DeploymentAsset): string {
  const fromTitle = String(asset.title ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (fromTitle) return fromTitle;
  return String(asset.assetKey ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function AdvancedPill({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className={`flex items-center justify-between ${PERSONA_NESTED_CARD_CLASS}`}>
      <span className="text-sm text-white/45">{label}</span>
      <span className="text-sm font-medium capitalize text-white/80">
        {value?.trim() || "—"}
      </span>
    </div>
  );
}

function AdvancedField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className={PERSONA_NESTED_CARD_CLASS}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-white/70">{value?.trim() || "—"}</p>
    </div>
  );
}
