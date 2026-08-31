"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdAssetSection } from "@/components/ads/AdAssetSection";
import { AdCampaignHeaderDeleteButton } from "@/components/ads/AdCampaignHeaderDeleteButton";
import { AdCampaignStatusPanel } from "@/components/ads/AdCampaignStatusPanel";
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
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/ads" className="text-sm text-[var(--athena-orange)]">
        {copy.backToAds}
      </Link>

      <div className="mb-8 mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.detail.eyebrow}
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            {campaign.name}
          </h1>
          <p className="mt-3 text-sm text-white/50">
            {copy.detail.statusLabel}:{" "}
            {getLocalizedAdCampaignStatusLabel(dictionary, campaign.status)}
            {campaign.objective ? ` · ${campaign.objective}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {(campaign.status === "Ready" ||
            campaign.status === "Processing Failed") && (
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 disabled:opacity-60"
            >
              {regenerating ? copy.detail.starting : copy.detail.regenerate}
            </button>
          )}
          <AdCampaignHeaderDeleteButton
            campaignId={campaign.id}
            confirmMessage={copy.delete.confirm}
            errorFallback={copy.delete.failed}
            chrome={getAdsConfirmDeleteChrome(dictionary)}
          />
        </div>
      </div>

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
            eyebrow="1"
            emptyValue={emptyValue}
            copy={copyChrome}
            fields={[
              { label: copy.detail.campaignName, value: pkg.strategy.campaignName },
              { label: copy.detail.objective, value: pkg.strategy.objective },
              { label: copy.detail.audience, value: pkg.strategy.audience },
              {
                label: copy.detail.coreOfferOrMessage,
                value: pkg.strategy.coreOfferOrMessage,
              },
              {
                label: copy.detail.positioningAngle,
                value: pkg.strategy.positioningAngle,
              },
              {
                label: copy.detail.primaryValueProposition,
                value: pkg.strategy.primaryValueProposition,
              },
              { label: copy.detail.ctaDirection, value: pkg.strategy.ctaDirection },
              {
                label: copy.detail.landingPageDirection,
                value: pkg.strategy.landingPageDirection,
              },
              { label: copy.detail.rationale, value: pkg.strategy.rationale },
              { label: copy.detail.briefMode, value: pkg.strategy.briefMode },
            ]}
          />

          <AdAssetSection
            title={copy.detail.facebook}
            eyebrow="2"
            emptyValue={emptyValue}
            copy={copyChrome}
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
            eyebrow="3"
            emptyValue={emptyValue}
            copy={copyChrome}
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
            eyebrow="4"
            emptyValue={emptyValue}
            copy={copyChrome}
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
            eyebrow="5"
            emptyValue={emptyValue}
            copy={copyChrome}
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
            eyebrow="6"
            emptyValue={emptyValue}
            copy={copyChrome}
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
        </div>
      ) : null}
    </main>
  );
}
