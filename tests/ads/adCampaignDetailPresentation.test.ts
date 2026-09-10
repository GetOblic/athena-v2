/**
 * Ads campaign detail visual polish — presentation contracts only.
 * Does not generate campaigns or change package / API / status semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Image, Monitor, Target } from "lucide-react";
import { AdAssetSection } from "../../components/ads/AdAssetSection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "../../components/ui/athenaExecutiveCard";
import {
  AD_DETAIL_DEFAULT_OPEN,
  AD_DETAIL_FIELD_LABEL_CLASS,
  AD_DETAIL_FIELD_LIST_CLASS,
  AD_DETAIL_FIELD_ROW_CLASS,
  AD_DETAIL_FIELD_VALUE_CLASS,
  AD_DETAIL_ICON,
  AD_DETAIL_SECTION_KEYS,
  AD_DETAIL_SECTION_PRESENTATION,
  AD_DETAIL_SURFACE,
  adCampaignStatusChipClass,
  presentAdCampaignDirectionSummary,
  presentAdCampaignSnapshot,
  presentAdCampaignTheme,
} from "../../lib/ads/adCampaignDetailPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DICTIONARIES: TenantMessages[] = [en, fr, es, itMessages, de, pt];

describe("ads campaign detail presentation", () => {
  it("keeps the six package sections plus Advanced and the collapse contract", () => {
    assert.deepEqual([...AD_DETAIL_SECTION_KEYS], [
      "campaignStrategy",
      "facebook",
      "instagram",
      "tiktok",
      "googleSearchAds",
      "recommendedKeywordThemes",
      "advanced",
    ]);
    assert.equal(AD_DETAIL_DEFAULT_OPEN.campaignStrategy, false);
    assert.equal(AD_DETAIL_DEFAULT_OPEN.facebook, false);
    assert.equal(AD_DETAIL_DEFAULT_OPEN.instagram, false);
    assert.equal(AD_DETAIL_DEFAULT_OPEN.tiktok, false);
    assert.equal(AD_DETAIL_DEFAULT_OPEN.googleSearchAds, false);
    assert.equal(AD_DETAIL_DEFAULT_OPEN.recommendedKeywordThemes, false);
    assert.equal(AD_DETAIL_DEFAULT_OPEN.advanced, false);
    for (const key of AD_DETAIL_SECTION_KEYS) {
      assert.equal(AD_DETAIL_DEFAULT_OPEN[key], false);
      assert.equal(AD_DETAIL_SECTION_PRESENTATION[key].defaultOpen, false);
    }
    assert.equal(AD_DETAIL_SECTION_PRESENTATION.campaignStrategy.icon, "Target");
    assert.equal(AD_DETAIL_SECTION_PRESENTATION.facebook.icon, "Monitor");
    assert.equal(AD_DETAIL_SECTION_PRESENTATION.instagram.icon, "Image");
    assert.equal(AD_DETAIL_SECTION_PRESENTATION.tiktok.icon, "Video");
    assert.equal(AD_DETAIL_SECTION_PRESENTATION.googleSearchAds.icon, "Search");
    assert.equal(
      AD_DETAIL_SECTION_PRESENTATION.recommendedKeywordThemes.icon,
      "ListChecks",
    );
    assert.equal(AD_DETAIL_SECTION_PRESENTATION.advanced.icon, "Layers");
  });

  it("uses real strategy fields for snapshot and direction summary", () => {
    assert.deepEqual(
      presentAdCampaignSnapshot({
        name: "Lyon summer launch",
        objective: "Store visits",
        campaignTheme: "Lyon summer launch",
        strategyAudience: "Local boutique shoppers",
        strategyObjective: "Drive boutique visits",
        strategyCampaignName: "Lyon summer launch",
        strategyCampaignTheme: "Summer terrace",
      }),
      {
        objective: "Drive boutique visits",
        audience: "Local boutique shoppers",
        campaignTheme: "Summer terrace",
      },
    );
    assert.equal(
      presentAdCampaignDirectionSummary({
        audience: "Local boutique shoppers",
        objective: "Drive boutique visits",
      }),
      "Drive boutique visits · Local boutique shoppers",
    );
    assert.equal(presentAdCampaignTheme("Lyon summer launch", "Lyon summer launch"), null);
    assert.equal(presentAdCampaignTheme("  ", "Name"), null);
  });

  it("maps status chips without inventing a score", () => {
    assert.match(adCampaignStatusChipClass("Ready"), /athena-success/);
    assert.match(adCampaignStatusChipClass("Queued"), /56,189,248/);
    assert.match(adCampaignStatusChipClass("Processing"), /56,189,248/);
    assert.match(adCampaignStatusChipClass("Processing Failed"), /rose/);
    const presentation = read("lib/ads/adCampaignDetailPresentation.ts");
    assert.doesNotMatch(
      presentation,
      /Traction Score|Campaign Score|Readiness Score|Confidence Score|Quality Score|Completion Score/,
    );
  });

  it("opts Ads detail into semantic V2 cards, utility copy, and the collapse contract", () => {
    const detail = read("components/ads/AdCampaignDetailView.tsx");
    const asset = read("components/ads/AdAssetSection.tsx");
    assert.match(detail, /tone="intelligence"/);
    assert.match(detail, /copyVariant="utility"/);
    assert.match(detail, /<Megaphone /);
    assert.match(detail, /<Target /);
    assert.match(detail, /<Monitor /);
    assert.match(detail, /<Image /);
    assert.match(detail, /<Video /);
    assert.match(detail, /<Search /);
    assert.match(detail, /<ListChecks /);
    assert.match(detail, /<Layers /);
    assert.match(detail, /<RefreshCw /);
    assert.match(detail, /<ArrowLeft /);
    assert.match(detail, /href="\/ads"/);
    assert.match(detail, /AD_DETAIL_DEFAULT_OPEN\.campaignStrategy/);
    assert.match(detail, /AD_DETAIL_DEFAULT_OPEN\.facebook/);
    assert.match(detail, /AD_DETAIL_DEFAULT_OPEN\.instagram/);
    assert.match(detail, /AD_DETAIL_DEFAULT_OPEN\.tiktok/);
    assert.match(detail, /AD_DETAIL_DEFAULT_OPEN\.googleSearchAds/);
    assert.match(detail, /AD_DETAIL_DEFAULT_OPEN\.recommendedKeywordThemes/);
    assert.match(detail, /AD_DETAIL_DEFAULT_OPEN\.advanced/);
    assert.match(detail, /copy\.detail\.summaryTikTok/);
    assert.match(detail, /copy\.traction\.readyStay/);
    assert.match(detail, /POST|\/api\/ads\/\$\{campaign\.id\}\/regenerate/);
    assert.match(asset, /tone = "default"/);
    assert.match(asset, /copyVariant = "default"/);
    assert.match(asset, /defaultOpen = true/);
    assert.match(asset, /variant=\{copyVariant\}/);
    assert.match(asset, /showContinue=\{false\}/);
    assert.match(asset, /tracking=\{null\}/);
    assert.doesNotMatch(detail, /eyebrow="[1-6]"/);
    assert.doesNotMatch(detail, /ATHENA_EXECUTIVE_CARD_OUTLINE/);
    assert.doesNotMatch(detail, /tone="default"/);
    assert.doesNotMatch(detail, /TractionSiblingNav/);
    assert.doesNotMatch(detail, /DeploymentAssets/);
    assert.doesNotMatch(detail, /Discuss with Athena|DiscussWithAthena/);
    assert.doesNotMatch(detail, /AudiencePicker|persona_id|audience_id/);
    assert.doesNotMatch(
      detail,
      /Traction Score|Campaign Score|Readiness Score|Confidence Score/,
    );
    assert.match(AD_DETAIL_SURFACE.violet, /!border-\[rgba\(167,139,250/);
    assert.match(AD_DETAIL_SURFACE.cyan, /!border-\[rgba\(56,189,248/);
    assert.match(asset, /AD_DETAIL_FIELD_LIST_CLASS/);
    assert.match(asset, /AD_DETAIL_FIELD_ROW_CLASS/);
    assert.match(asset, /AD_DETAIL_FIELD_LABEL_CLASS/);
    assert.match(asset, /AD_DETAIL_FIELD_VALUE_CLASS/);
    assert.doesNotMatch(asset, /rounded-2xl border border-white\/10 bg-black\/20/);
    assert.doesNotMatch(asset, /tracking-\[0\.22em\]/);
    assert.doesNotMatch(asset, /space-y-5/);
  });

  it("renders every Ads asset card collapsed by default and still expandable", () => {
    const cards = [
      {
        title: en.ads.detail.campaignStrategy,
        summary: "Drive boutique visits · Local boutique shoppers",
        icon: createElement(Target, { "aria-hidden": true }),
        iconClassName: AD_DETAIL_ICON.violet,
        className: AD_DETAIL_SURFACE.violet,
        defaultOpen: AD_DETAIL_DEFAULT_OPEN.campaignStrategy,
        fields: [
          { label: en.ads.detail.audience, value: "Local boutique shoppers" },
          {
            label: en.ads.detail.objective,
            value: "Drive boutique visits",
          },
        ],
        accent: /!border-\[rgba\(167,139,250/,
      },
      {
        title: en.ads.detail.facebook,
        summary: en.ads.detail.summaryFacebook,
        icon: createElement(Monitor, { "aria-hidden": true }),
        iconClassName: AD_DETAIL_ICON.cyan,
        className: AD_DETAIL_SURFACE.cyan,
        defaultOpen: AD_DETAIL_DEFAULT_OPEN.facebook,
        fields: [
          { label: en.ads.detail.primaryText, value: "Facebook primary text" },
          { label: en.ads.detail.headline, value: "Facebook headline" },
        ],
        accent: /!border-\[rgba\(56,189,248/,
      },
      {
        title: en.ads.detail.instagram,
        summary: en.ads.detail.summaryInstagram,
        icon: createElement(Image, { "aria-hidden": true }),
        iconClassName: AD_DETAIL_ICON.cyan,
        className: AD_DETAIL_SURFACE.cyan,
        defaultOpen: AD_DETAIL_DEFAULT_OPEN.instagram,
        fields: [
          { label: en.ads.detail.feedCaption, value: "Instagram feed caption" },
          { label: en.ads.detail.openingHook, value: "Instagram opening hook" },
        ],
        accent: /!border-\[rgba\(56,189,248/,
      },
    ] as const;

    for (const card of cards) {
      assert.equal(card.defaultOpen, false);
      const collapsed = renderToStaticMarkup(
        createElement(AdAssetSection, {
          title: card.title,
          summary: card.summary,
          icon: card.icon,
          iconClassName: card.iconClassName,
          className: card.className,
          defaultOpen: card.defaultOpen,
          tone: "intelligence",
          copyVariant: "utility",
          fields: [...card.fields],
        }),
      );

      assert.match(collapsed, /aria-expanded="false"/);
      assert.doesNotMatch(collapsed, /aria-expanded="true"/);
      assert.match(collapsed, new RegExp(card.title));
      assert.match(collapsed, new RegExp(card.summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(collapsed, card.accent);
      assert.match(collapsed, /<svg /);
      assert.doesNotMatch(collapsed, new RegExp(AD_DETAIL_FIELD_LIST_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(collapsed, new RegExp(AD_DETAIL_FIELD_ROW_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(collapsed, new RegExp(AD_DETAIL_FIELD_VALUE_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(collapsed, /rounded-2xl border border-white\/10 bg-black\/20/);
      assert.doesNotMatch(collapsed, /tracking-\[0\.22em\]/);
      assert.doesNotMatch(collapsed, /eyebrow="[1-6]"|>1<|>01</);
      assert.doesNotMatch(collapsed, />▲<|>▼</);
      assert.doesNotMatch(collapsed, /tone="default"/);
      assert.match(collapsed, new RegExp(card.className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.ok(
        collapsed.includes("!border-") && collapsed.includes(ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS),
        "semantic !border override must sit on the shared executive outline class",
      );

      const expanded = renderToStaticMarkup(
        createElement(AdAssetSection, {
          title: card.title,
          summary: card.summary,
          icon: card.icon,
          iconClassName: card.iconClassName,
          className: card.className,
          defaultOpen: true,
          tone: "intelligence",
          copyVariant: "utility",
          fields: [...card.fields],
        }),
      );

      assert.match(expanded, /aria-expanded="true"/);
      assert.match(expanded, new RegExp(AD_DETAIL_FIELD_LIST_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(expanded, new RegExp(AD_DETAIL_FIELD_LABEL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(expanded, new RegExp(AD_DETAIL_FIELD_ROW_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(expanded, new RegExp(AD_DETAIL_FIELD_VALUE_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(expanded, /bg-white\/\[0\.04\]/);
      assert.match(expanded, /size-3\.5/);
      for (const field of card.fields) {
        assert.match(expanded, new RegExp(field.label));
        assert.match(expanded, new RegExp(field.value));
      }
      assert.match(expanded, card.accent);
      assert.match(expanded, new RegExp(card.className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    for (const key of AD_DETAIL_SECTION_KEYS) {
      assert.equal(AD_DETAIL_DEFAULT_OPEN[key], false);
      const collapsed = renderToStaticMarkup(
        createElement(AdAssetSection, {
          title: key,
          defaultOpen: AD_DETAIL_DEFAULT_OPEN[key],
          fields: [{ label: `${key} label`, value: `${key} value` }],
        }),
      );
      const expanded = renderToStaticMarkup(
        createElement(AdAssetSection, {
          title: key,
          defaultOpen: true,
          fields: [{ label: `${key} label`, value: `${key} value` }],
        }),
      );
      assert.match(collapsed, /aria-expanded="false"/);
      assert.doesNotMatch(collapsed, new RegExp(`${key} value`));
      assert.match(expanded, /aria-expanded="true"/);
      assert.match(expanded, new RegExp(`${key} value`));
    }

    const detail = read("components/ads/AdCampaignDetailView.tsx");
    assert.doesNotMatch(detail, /eyebrow=/);
    assert.match(detail, /defaultOpen=\{AD_DETAIL_DEFAULT_OPEN\.campaignStrategy\}/);
    assert.match(detail, /defaultOpen=\{AD_DETAIL_DEFAULT_OPEN\.facebook\}/);
    assert.match(detail, /defaultOpen=\{AD_DETAIL_DEFAULT_OPEN\.instagram\}/);
    assert.match(detail, /defaultOpen=\{AD_DETAIL_DEFAULT_OPEN\.tiktok\}/);
    assert.match(detail, /defaultOpen=\{AD_DETAIL_DEFAULT_OPEN\.googleSearchAds\}/);
    assert.match(detail, /defaultOpen=\{AD_DETAIL_DEFAULT_OPEN\.recommendedKeywordThemes\}/);
    assert.match(detail, /defaultOpen=\{AD_DETAIL_DEFAULT_OPEN\.advanced\}/);
  });

  it("keeps generated package fields verbatim and does not invent platforms", () => {
    const detail = read("components/ads/AdCampaignDetailView.tsx");
    assert.match(detail, /\{campaign\.name\}/);
    assert.match(detail, /pkg\.strategy\.audience/);
    assert.match(detail, /pkg\.facebook\.primaryText/);
    assert.match(detail, /pkg\.facebook\.headline/);
    assert.match(detail, /pkg\.instagram\.feedCaption/);
    assert.match(detail, /pkg\.tiktok\.shortVideoScript/);
    assert.match(detail, /pkg\.googleSearch\.headlines\.join/);
    assert.match(detail, /pkg\.keywordThemes\.disclaimer/);
    assert.match(detail, /pkg\.strategy\.rationale/);
    assert.match(detail, /pkg\.strategy\.briefMode/);
    assert.doesNotMatch(detail, /LinkedIn/);
    assert.doesNotMatch(detail, /translateHeadline|localizePackage/);
    assert.doesNotMatch(detail, /campaign\.brief\b|brief_json|brief\.guidance/);
  });

  it("restyles the Ads-only status panel without changing polling or actions", () => {
    const status = read("components/ads/AdCampaignStatusPanel.tsx");
    assert.match(status, /<LoaderCircle /);
    assert.match(status, /<AlertTriangle /);
    assert.match(status, /AD_STATUS_PANEL_PROGRESS/);
    assert.match(status, /AD_STATUS_PANEL_FAILED/);
    assert.match(status, /\/api\/ads\/\$\{campaignId\}\/status/);
    assert.match(status, /\/api\/ads\/\$\{campaignId\}\/generate/);
    assert.match(status, /\/api\/ads\/\$\{campaignId\}\/regenerate/);
    assert.match(status, /Assembling organization context/);
    assert.match(status, /Generating Facebook assets/i);
    assert.match(status, /copy\.regenerateAsNew/);
    assert.match(status, /copy\.retry/);
    assert.match(status, /setInterval/);
    assert.doesNotMatch(status, /seoTechnicalReportPresentation|personaPagePresentation/);
  });

  it("adds Ads presentation labels in all six locales without rewriting generated copy", () => {
    assert.equal(en.ads.detail.backLabel, "Advertising");
    assert.equal(en.ads.detail.summaryTikTok, "Short-form video creative");
    for (const dictionary of DICTIONARIES) {
      assert.equal(typeof dictionary.ads.detail.backLabel, "string");
      assert.ok(dictionary.ads.detail.backLabel.trim());
      assert.ok(dictionary.ads.detail.summaryFacebook.trim());
      assert.ok(dictionary.ads.detail.summaryInstagram.trim());
      assert.ok(dictionary.ads.detail.summaryTikTok.trim());
      assert.ok(dictionary.ads.detail.summaryGoogleSearch.trim());
      assert.ok(dictionary.ads.detail.summaryKeywordThemes.trim());
      assert.ok(dictionary.ads.detail.summaryAdvanced.trim());
      assert.equal(dictionary.ads.detail.facebook, "Facebook");
      assert.equal(dictionary.ads.detail.instagram, "Instagram");
      assert.equal(dictionary.ads.detail.tiktok, "TikTok");
    }
    assert.notEqual(fr.ads.detail.backLabel, en.ads.detail.backLabel);
    assert.notEqual(de.ads.detail.summaryTikTok, en.ads.detail.summaryTikTok);
    assert.doesNotMatch(fr.ads.detail.summaryFacebook, /Book Today/);
  });

  it("does not import SEO or Persona visual modules and leaves shared defaults untouched", () => {
    const presentation = read("lib/ads/adCampaignDetailPresentation.ts");
    const detail = read("components/ads/AdCampaignDetailView.tsx");
    const asset = read("components/ads/AdAssetSection.tsx");
    const collapsible = read("components/ui/AthenaCollapsibleSection.tsx");
    const copyButton = read("components/deployment/CopyButton.tsx");
    assert.doesNotMatch(presentation, /seoTechnicalReportPresentation|personaPagePresentation|seoStrategyReportPresentation/);
    assert.doesNotMatch(detail, /from "@\/components\/seo|from "@\/lib\/personas|from "@\/lib\/seo/);
    assert.match(collapsible, /tone = "default"/);
    assert.match(collapsible, /defaultOpen = false/);
    assert.match(copyButton, /variant\?: "default" \| "utility"/);
    assert.match(
      copyButton,
      /rounded-xl border border-\[var\(--athena-orange\)\]\/30 bg-\[var\(--athena-orange\)\]\/10 px-4 py-2 text-sm font-medium text-\[var\(--athena-orange\)\] transition hover:bg-\[var\(--athena-orange\)\]\/20/,
    );
    assert.match(asset, /AthenaCollapsibleSection/);
    assert.doesNotMatch(asset, /DeploymentAssets|CollapsiblePromptBlock/);
  });
});
