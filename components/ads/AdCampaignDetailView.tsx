"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdAssetSection } from "@/components/ads/AdAssetSection";
import { AdCampaignHeaderDeleteButton } from "@/components/ads/AdCampaignHeaderDeleteButton";
import { AdCampaignStatusPanel } from "@/components/ads/AdCampaignStatusPanel";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicAdCampaignDetail } from "@/services/ads/adCampaignPublic";

type AdCampaignDetailViewProps = {
  campaign: PublicAdCampaignDetail;
};

export function AdCampaignDetailView({ campaign }: AdCampaignDetailViewProps) {
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
        setError(payload.error?.message || "Failed to regenerate campaign.");
        return;
      }
      router.push(`/ads/${payload.campaign.id}`);
      router.refresh();
    } catch {
      setError("Failed to regenerate campaign.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/ads" className="text-sm text-[var(--athena-orange)]">
        ← Ads
      </Link>

      <div className="mb-8 mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Organization Ads
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            {campaign.name}
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Status: {campaign.status}
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
              {regenerating ? "Starting…" : "Regenerate"}
            </button>
          )}
          <AdCampaignHeaderDeleteButton campaignId={campaign.id} />
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
      />

      {pkg ? (
        <div className="space-y-6">
          <AdAssetSection
            title="Campaign Strategy"
            eyebrow="1"
            fields={[
              { label: "Campaign name", value: pkg.strategy.campaignName },
              { label: "Objective", value: pkg.strategy.objective },
              { label: "Audience", value: pkg.strategy.audience },
              {
                label: "Core offer / message",
                value: pkg.strategy.coreOfferOrMessage,
              },
              {
                label: "Positioning angle",
                value: pkg.strategy.positioningAngle,
              },
              {
                label: "Primary value proposition",
                value: pkg.strategy.primaryValueProposition,
              },
              { label: "CTA direction", value: pkg.strategy.ctaDirection },
              {
                label: "Landing page direction",
                value: pkg.strategy.landingPageDirection,
              },
              { label: "Rationale", value: pkg.strategy.rationale },
              { label: "Brief mode", value: pkg.strategy.briefMode },
            ]}
          />

          <AdAssetSection
            title="Facebook"
            eyebrow="2"
            fields={[
              { label: "Primary text", value: pkg.facebook.primaryText },
              { label: "Headline", value: pkg.facebook.headline },
              { label: "Description", value: pkg.facebook.description },
              {
                label: "CTA recommendation",
                value: pkg.facebook.ctaRecommendation,
              },
              {
                label: "Audience direction",
                value: pkg.facebook.audienceDirection,
              },
              {
                label: "Creative concept",
                value: pkg.facebook.creativeConcept,
              },
              { label: "Image prompt", value: pkg.facebook.imagePrompt },
            ]}
          />

          <AdAssetSection
            title="Instagram"
            eyebrow="3"
            fields={[
              { label: "Feed caption", value: pkg.instagram.feedCaption },
              { label: "Opening hook", value: pkg.instagram.openingHook },
              {
                label: "Reel / story script",
                value: pkg.instagram.reelOrStoryScript,
              },
              { label: "On-screen text", value: pkg.instagram.onScreenText },
              { label: "CTA", value: pkg.instagram.cta },
              {
                label: "Hashtag direction",
                value: pkg.instagram.hashtagDirection ?? "—",
              },
              {
                label: "Creative concept",
                value: pkg.instagram.creativeConcept,
              },
              {
                label: "Image / short video prompt",
                value: pkg.instagram.imageOrShortVideoPrompt,
              },
            ]}
          />

          <AdAssetSection
            title="TikTok"
            eyebrow="4"
            fields={[
              { label: "Opening hook", value: pkg.tiktok.openingHook },
              {
                label: "Short video script",
                value: pkg.tiktok.shortVideoScript,
              },
              { label: "Scene direction", value: pkg.tiktok.sceneDirection },
              { label: "On-screen text", value: pkg.tiktok.onScreenText },
              { label: "Caption", value: pkg.tiktok.caption },
              { label: "CTA", value: pkg.tiktok.cta },
              {
                label: "Creator / production direction",
                value: pkg.tiktok.creatorOrProductionDirection,
              },
            ]}
          />

          <AdAssetSection
            title="Google Search Ads"
            eyebrow="5"
            fields={[
              {
                label: "Campaign theme",
                value: pkg.googleSearch.campaignTheme,
              },
              {
                label: "Ad group themes",
                value: pkg.googleSearch.adGroupThemes.join("\n"),
              },
              {
                label: "Headlines",
                value: pkg.googleSearch.headlines.join("\n"),
              },
              {
                label: "Descriptions",
                value: pkg.googleSearch.descriptions.join("\n"),
              },
              {
                label: "Sitelink ideas",
                value: pkg.googleSearch.sitelinkIdeas.join("\n"),
              },
              {
                label: "Callout ideas",
                value: pkg.googleSearch.calloutIdeas.join("\n"),
              },
              {
                label: "Structured snippet ideas",
                value: pkg.googleSearch.structuredSnippetIdeas.join("\n"),
              },
              {
                label: "Negative keyword suggestions",
                value: pkg.googleSearch.negativeKeywordSuggestions.join("\n"),
              },
              {
                label: "Landing page direction",
                value: pkg.googleSearch.landingPageDirection,
              },
            ]}
          />

          <AdAssetSection
            title="Recommended Keyword Themes"
            eyebrow="6"
            fields={[
              { label: "Label", value: pkg.keywordThemes.label },
              { label: "Disclaimer", value: pkg.keywordThemes.disclaimer },
              ...pkg.keywordThemes.themes.flatMap((theme, index) => [
                {
                  label: `Theme ${index + 1}`,
                  value: theme.theme,
                },
                {
                  label: `Theme ${index + 1} intent`,
                  value: theme.intentClassification,
                },
                {
                  label: `Theme ${index + 1} audience relevance`,
                  value: theme.audienceRelevance,
                },
                {
                  label: `Theme ${index + 1} message angle`,
                  value: theme.suggestedMessageAngle,
                },
                {
                  label: `Theme ${index + 1} landing page`,
                  value: theme.suggestedLandingPageDirection,
                },
                {
                  label: `Theme ${index + 1} negative theme`,
                  value: theme.negativeKeywordTheme ?? "—",
                },
              ]),
            ]}
          />
        </div>
      ) : null}
    </main>
  );
}
