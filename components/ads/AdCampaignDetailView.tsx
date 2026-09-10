"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Image,
  Layers,
  ListChecks,
  Megaphone,
  Monitor,
  RefreshCw,
  Search,
  Target,
  Video,
} from "lucide-react";
import { AdAssetSection } from "@/components/ads/AdAssetSection";
import { AdCampaignHeaderDeleteButton } from "@/components/ads/AdCampaignHeaderDeleteButton";
import { AdCampaignStatusPanel } from "@/components/ads/AdCampaignStatusPanel";
import {
  AD_BACK_LINK_CLASS,
  AD_CHIP_META,
  AD_DETAIL_DEFAULT_OPEN,
  AD_DETAIL_ICON,
  AD_DETAIL_SURFACE,
  AD_HEADER_ICON_WELL,
  AD_HEADER_PRIMARY_CLASS,
  adCampaignStatusChipClass,
  presentAdCampaignDirectionSummary,
  presentAdCampaignSnapshot,
} from "@/lib/ads/adCampaignDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  getAdsConfirmDeleteChrome,
  getAdsCopyChrome,
  getLocalizedAdCampaignStatusLabel,
} from "@/lib/tenantI18n/adsPresentation";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { PublicAdCampaignDetail } from "@/services/ads/adCampaignPublic";

type AdCampaignDetailViewProps = {
  campaign: PublicAdCampaignDetail;
  messages?: TenantMessages;
};

export function AdCampaignDetailView({
  campaign,
  messages,
}: AdCampaignDetailViewProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.ads;
  const emptyValue = copy.emptyValue;
  const copyChrome = getAdsCopyChrome(dictionary);
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg = campaign.package;
  const snapshot = presentAdCampaignSnapshot({
    name: campaign.name,
    objective: campaign.objective,
    campaignTheme: campaign.campaignTheme,
    strategyAudience: pkg?.strategy.audience,
    strategyObjective: pkg?.strategy.objective,
    strategyCampaignName: pkg?.strategy.campaignName,
    strategyCampaignTheme: pkg?.googleSearch.campaignTheme,
  });
  const canCreateAnotherVersion =
    campaign.status === "Ready" || campaign.status === "Processing Failed";

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/ads/${campaign.id}/regenerate`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        campaign?: { id?: string };
        error?: { message?: string };
      }>(response);
      if (!payload.ok || !payload.campaign?.id) {
        setError(payload.error?.message || copy.detail.regenerateFailed);
        return;
      }
      router.push(`/ads/${payload.campaign.id}`);
      router.refresh();
    } catch {
      setError(copy.detail.regenerateFailed);
    } finally {
      setRegenerating(false);
    }
  }

  function themeLabel(template: string, n: number) {
    return interpolateTenantMessage(
      template.includes("{n}") ? template : en.ads.detail.themeN,
      { n },
    );
  }

  return (
    <div className="min-w-0 text-white">
      <Link href="/ads" className={AD_BACK_LINK_CLASS}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {copy.detail.backLabel}
      </Link>

      <header className="mb-8 mt-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className={AD_HEADER_ICON_WELL} aria-hidden="true">
                <Megaphone className="size-5" />
              </span>
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                {copy.detail.eyebrow}
              </div>
            </div>
            <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              {campaign.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={adCampaignStatusChipClass(campaign.status)}>
                {getLocalizedAdCampaignStatusLabel(dictionary, campaign.status)}
              </span>
              {snapshot.objective ? (
                <span className={AD_CHIP_META}>
                  {copy.detail.objective}: {snapshot.objective}
                </span>
              ) : null}
              {snapshot.campaignTheme ? (
                <span className={AD_CHIP_META}>{snapshot.campaignTheme}</span>
              ) : null}
            </div>
            {snapshot.audience ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">
                {copy.detail.audience}: {snapshot.audience}
              </p>
            ) : null}
            {campaign.status === "Ready" ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/40">
                {copy.traction.readyStay}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-start">
            {canCreateAnotherVersion ? (
              <button
                type="button"
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
                className={AD_HEADER_PRIMARY_CLASS}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                {regenerating ? copy.detail.starting : copy.detail.regenerate}
              </button>
            ) : null}
            <AdCampaignHeaderDeleteButton
              campaignId={campaign.id}
              confirmMessage={copy.delete.confirm}
              errorFallback={copy.delete.failed}
              chrome={getAdsConfirmDeleteChrome(dictionary)}
            />
          </div>
        </div>
      </header>

      {error ? (
        <p className="mb-6 text-sm text-rose-200">{error}</p>
      ) : null}

      <AdCampaignStatusPanel
        campaignId={campaign.id}
        initialStatus={campaign.status}
        initialStage={campaign.generationStage}
        initialErrorMessage={campaign.errorMessage}
        messages={dictionary}
      />

      {pkg ? (
        <div className="space-y-6">
          <AdAssetSection
            title={copy.detail.campaignStrategy}
            emptyValue={emptyValue}
            copy={copyChrome}
            tone="intelligence"
            icon={<Target aria-hidden="true" />}
            iconClassName={AD_DETAIL_ICON.violet}
            className={AD_DETAIL_SURFACE.violet}
            defaultOpen={AD_DETAIL_DEFAULT_OPEN.campaignStrategy}
            summary={presentAdCampaignDirectionSummary({
              audience: pkg.strategy.audience,
              objective: pkg.strategy.objective,
            }) ?? undefined}
            copyVariant="utility"
            fields={[
              { label: copy.detail.audience, value: pkg.strategy.audience },
              {
                label: copy.detail.coreOfferOrMessage,
                value: pkg.strategy.coreOfferOrMessage,
              },
              {
                label: copy.detail.primaryValueProposition,
                value: pkg.strategy.primaryValueProposition,
              },
              {
                label: copy.detail.positioningAngle,
                value: pkg.strategy.positioningAngle,
              },
              { label: copy.detail.ctaDirection, value: pkg.strategy.ctaDirection },
              {
                label: copy.detail.landingPageDirection,
                value: pkg.strategy.landingPageDirection,
              },
              { label: copy.detail.objective, value: pkg.strategy.objective },
              { label: copy.detail.campaignName, value: pkg.strategy.campaignName },
            ]}
          />

          <AdAssetSection
            title={copy.detail.facebook}
            emptyValue={emptyValue}
            copy={copyChrome}
            tone="intelligence"
            icon={<Monitor aria-hidden="true" />}
            iconClassName={AD_DETAIL_ICON.cyan}
            className={AD_DETAIL_SURFACE.cyan}
            defaultOpen={AD_DETAIL_DEFAULT_OPEN.facebook}
            summary={copy.detail.summaryFacebook}
            copyVariant="utility"
            fields={[
              { label: copy.detail.primaryText, value: pkg.facebook.primaryText },
              { label: copy.detail.headline, value: pkg.facebook.headline },
              { label: copy.detail.description, value: pkg.facebook.description },
              {
                label: copy.detail.ctaRecommendation,
                value: pkg.facebook.ctaRecommendation,
              },
              {
                label: copy.detail.audienceDirection,
                value: pkg.facebook.audienceDirection,
              },
              {
                label: copy.detail.creativeConcept,
                value: pkg.facebook.creativeConcept,
              },
              { label: copy.detail.imagePrompt, value: pkg.facebook.imagePrompt },
            ]}
          />

          <AdAssetSection
            title={copy.detail.instagram}
            emptyValue={emptyValue}
            copy={copyChrome}
            tone="intelligence"
            icon={<Image aria-hidden="true" />}
            iconClassName={AD_DETAIL_ICON.cyan}
            className={AD_DETAIL_SURFACE.cyan}
            defaultOpen={AD_DETAIL_DEFAULT_OPEN.instagram}
            summary={copy.detail.summaryInstagram}
            copyVariant="utility"
            fields={[
              { label: copy.detail.feedCaption, value: pkg.instagram.feedCaption },
              { label: copy.detail.openingHook, value: pkg.instagram.openingHook },
              {
                label: copy.detail.reelOrStoryScript,
                value: pkg.instagram.reelOrStoryScript,
              },
              { label: copy.detail.onScreenText, value: pkg.instagram.onScreenText },
              { label: copy.detail.cta, value: pkg.instagram.cta },
              {
                label: copy.detail.hashtagDirection,
                value: pkg.instagram.hashtagDirection ?? emptyValue,
              },
              {
                label: copy.detail.creativeConcept,
                value: pkg.instagram.creativeConcept,
              },
              {
                label: copy.detail.imageOrShortVideoPrompt,
                value: pkg.instagram.imageOrShortVideoPrompt,
              },
            ]}
          />

          <AdAssetSection
            title={copy.detail.tiktok}
            emptyValue={emptyValue}
            copy={copyChrome}
            tone="intelligence"
            icon={<Video aria-hidden="true" />}
            iconClassName={AD_DETAIL_ICON.cyan}
            className={AD_DETAIL_SURFACE.cyan}
            defaultOpen={AD_DETAIL_DEFAULT_OPEN.tiktok}
            summary={copy.detail.summaryTikTok}
            copyVariant="utility"
            fields={[
              { label: copy.detail.openingHook, value: pkg.tiktok.openingHook },
              {
                label: copy.detail.shortVideoScript,
                value: pkg.tiktok.shortVideoScript,
              },
              { label: copy.detail.sceneDirection, value: pkg.tiktok.sceneDirection },
              { label: copy.detail.onScreenText, value: pkg.tiktok.onScreenText },
              { label: copy.detail.caption, value: pkg.tiktok.caption },
              { label: copy.detail.cta, value: pkg.tiktok.cta },
              {
                label: copy.detail.creatorOrProductionDirection,
                value: pkg.tiktok.creatorOrProductionDirection,
              },
            ]}
          />

          <AdAssetSection
            title={copy.detail.googleSearchAds}
            emptyValue={emptyValue}
            copy={copyChrome}
            tone="intelligence"
            icon={<Search aria-hidden="true" />}
            iconClassName={AD_DETAIL_ICON.cyan}
            className={AD_DETAIL_SURFACE.cyan}
            defaultOpen={AD_DETAIL_DEFAULT_OPEN.googleSearchAds}
            summary={copy.detail.summaryGoogleSearch}
            copyVariant="utility"
            fields={[
              {
                label: copy.detail.campaignTheme,
                value: pkg.googleSearch.campaignTheme,
              },
              {
                label: copy.detail.adGroupThemes,
                value: pkg.googleSearch.adGroupThemes.join("\n"),
              },
              {
                label: copy.detail.headlines,
                value: pkg.googleSearch.headlines.join("\n"),
              },
              {
                label: copy.detail.descriptions,
                value: pkg.googleSearch.descriptions.join("\n"),
              },
              {
                label: copy.detail.sitelinkIdeas,
                value: pkg.googleSearch.sitelinkIdeas.join("\n"),
              },
              {
                label: copy.detail.calloutIdeas,
                value: pkg.googleSearch.calloutIdeas.join("\n"),
              },
              {
                label: copy.detail.structuredSnippetIdeas,
                value: pkg.googleSearch.structuredSnippetIdeas.join("\n"),
              },
              {
                label: copy.detail.negativeKeywordSuggestions,
                value: pkg.googleSearch.negativeKeywordSuggestions.join("\n"),
              },
              {
                label: copy.detail.landingPageDirection,
                value: pkg.googleSearch.landingPageDirection,
              },
            ]}
          />

          <AdAssetSection
            title={copy.detail.recommendedKeywordThemes}
            emptyValue={emptyValue}
            copy={copyChrome}
            tone="intelligence"
            icon={<ListChecks aria-hidden="true" />}
            iconClassName={AD_DETAIL_ICON.amber}
            className={AD_DETAIL_SURFACE.amber}
            defaultOpen={AD_DETAIL_DEFAULT_OPEN.recommendedKeywordThemes}
            summary={copy.detail.summaryKeywordThemes}
            copyVariant="utility"
            fields={[
              { label: copy.detail.keywordLabel, value: pkg.keywordThemes.label },
              {
                label: copy.detail.keywordDisclaimer,
                value: pkg.keywordThemes.disclaimer,
              },
              ...pkg.keywordThemes.themes.flatMap((theme, index) => [
                {
                  label: themeLabel(copy.detail.themeN, index + 1),
                  value: theme.theme,
                },
                {
                  label: themeLabel(copy.detail.themeNIntent, index + 1),
                  value: theme.intentClassification,
                },
                {
                  label: themeLabel(copy.detail.themeNAudience, index + 1),
                  value: theme.audienceRelevance,
                },
                {
                  label: themeLabel(copy.detail.themeNMessage, index + 1),
                  value: theme.suggestedMessageAngle,
                },
                {
                  label: themeLabel(copy.detail.themeNLanding, index + 1),
                  value: theme.suggestedLandingPageDirection,
                },
                {
                  label: themeLabel(copy.detail.themeNNegative, index + 1),
                  value: theme.negativeKeywordTheme ?? emptyValue,
                },
              ]),
            ]}
          />

          {pkg.strategy.rationale || pkg.strategy.briefMode ? (
            <AdAssetSection
              title={copy.traction.advanced}
              emptyValue={emptyValue}
              copy={copyChrome}
              tone="intelligence"
              icon={<Layers aria-hidden="true" />}
              iconClassName={AD_DETAIL_ICON.muted}
              className={AD_DETAIL_SURFACE.muted}
              defaultOpen={AD_DETAIL_DEFAULT_OPEN.advanced}
              summary={copy.detail.summaryAdvanced}
              copyVariant="utility"
              fields={[
                { label: copy.detail.rationale, value: pkg.strategy.rationale },
                { label: copy.detail.briefMode, value: pkg.strategy.briefMode },
              ]}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
