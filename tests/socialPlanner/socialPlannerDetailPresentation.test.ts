/**
 * Social Planner Ready-detail visual polish — presentation contracts only.
 * Does not generate calendars or change package / API / conversation semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "../../components/ui/athenaExecutiveCard";
import {
  SOCIAL_DETAIL_BACK_LINK,
  SOCIAL_DETAIL_CHIP_FAILED,
  SOCIAL_DETAIL_CHIP_READY,
  SOCIAL_DETAIL_DAY_SURFACE,
  SOCIAL_DETAIL_DEFAULT_OPEN,
  SOCIAL_DETAIL_HEADER_WELL,
  SOCIAL_DETAIL_PRODUCTION_SURFACE,
  presentSocialDetailSnapshot,
  presentSocialDetailStrategyPreview,
  shouldShowSocialDetailGenerationMode,
  socialPlannerDetailStatusChipClass,
} from "../../lib/socialPlanner/socialPlannerDetailPresentation";
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

describe("social planner detail presentation", () => {
  it("keeps list and detail presentation modules isolated", () => {
    const detail = read("lib/socialPlanner/socialPlannerDetailPresentation.ts");
    const list = read("lib/socialPlanner/socialPlannerPagePresentation.ts");
    assert.match(detail, /SOCIAL_DETAIL_BACK_LINK/);
    assert.match(detail, /SOCIAL_DETAIL_HEADER_WELL/);
    assert.match(detail, /SOCIAL_DETAIL_SNAPSHOT/);
    assert.match(detail, /SOCIAL_DETAIL_STRATEGY_SURFACE/);
    assert.match(detail, /SOCIAL_DETAIL_DAY_SURFACE/);
    assert.match(detail, /SOCIAL_DETAIL_DAY_ICON/);
    assert.match(detail, /SOCIAL_DETAIL_META_CHIP/);
    assert.match(detail, /SOCIAL_DETAIL_PRODUCTION_SURFACE/);
    assert.match(detail, /SOCIAL_DETAIL_ASK_SURFACE/);
    assert.match(detail, /SOCIAL_DETAIL_UTILITY_ACTION/);
    assert.doesNotMatch(detail, /socialPlannerPagePresentation/);
    assert.doesNotMatch(list, /socialPlannerDetailPresentation/);
    assert.equal(SOCIAL_DETAIL_DEFAULT_OPEN.strategy, false);
    assert.equal(SOCIAL_DETAIL_DEFAULT_OPEN.day, false);
    assert.equal(SOCIAL_DETAIL_DEFAULT_OPEN.askAthena, false);
  });

  it("uses ArrowLeft, MessagesSquare, and a green Ready chip", () => {
    const page = read("app/social-planner/[id]/page.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(page, /<ArrowLeft /);
    assert.match(page, /href="\/social-planner"/);
    assert.match(page, /SOCIAL_DETAIL_BACK_LINK/);
    assert.match(page, /copy\.backToSocialPlanner/);
    assert.doesNotMatch(page, /text-\[var\(--athena-orange\)\]/);
    assert.match(detail, /<MessagesSquare /);
    assert.match(detail, /SOCIAL_DETAIL_HEADER_WELL/);
    assert.match(socialPlannerDetailStatusChipClass("Ready"), /athena-success/);
    assert.match(socialPlannerDetailStatusChipClass("Queued"), /167,139,250/);
    assert.match(socialPlannerDetailStatusChipClass("Processing"), /167,139,250/);
    assert.match(socialPlannerDetailStatusChipClass("Processing Failed"), /rose/);
    assert.match(SOCIAL_DETAIL_CHIP_READY, /athena-success/);
    assert.match(SOCIAL_DETAIL_CHIP_FAILED, /rose/);
    assert.match(SOCIAL_DETAIL_BACK_LINK, /text-white\/45/);
    assert.match(SOCIAL_DETAIL_HEADER_WELL, /56,189,248/);
  });

  it("surfaces version and non-standard generation mode from existing DTO fields", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(detail, /calendar\.versionNumber/);
    assert.match(detail, /formatSocialPlannerVersionLabel/);
    assert.match(detail, /calendar\.generationMode/);
    assert.match(detail, /getLocalizedSocialPlannerGenerationModeLabel/);
    assert.match(detail, /shouldShowSocialDetailGenerationMode/);
    assert.equal(shouldShowSocialDetailGenerationMode("standard"), false);
    assert.equal(shouldShowSocialDetailGenerationMode("think_differently"), true);
    assert.equal(
      shouldShowSocialDetailGenerationMode("conversation_revision"),
      true,
    );
    assert.deepEqual(
      presentSocialDetailSnapshot({
        userGuidance: "  Launch week  ",
        strategySummary: "A".repeat(160),
      }),
      {
        userGuidance: "Launch week",
        strategyPreview: `${"A".repeat(140).trimEnd()}…`,
      },
    );
    assert.equal(presentSocialDetailStrategyPreview("  "), null);
  });

  it("collapses week strategy, day bodies, and Ask Athena by default", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const panel = read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx");
    assert.match(detail, /SOCIAL_DETAIL_DEFAULT_OPEN\.strategy/);
    assert.match(detail, /AthenaCollapsibleSection/);
    assert.match(detail, /<Target /);
    assert.match(card, /SOCIAL_DETAIL_DEFAULT_OPEN\.day/);
    assert.match(panel, /SOCIAL_DETAIL_DEFAULT_OPEN\.askAthena/);
    assert.match(panel, /<MessageCircleQuestionMark /);
    assert.match(panel, /tone="intelligence"/);
    assert.match(panel, /id="social-planner-conversation"/);
    assert.match(panel, /copy\.askAthenaTitle/);
    assert.match(panel, /copy\.applySuggestions/);
    assert.match(panel, /messages.length > 0 && onApply/);
  });

  it("compacts the collapsed day header and moves body content out of it", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const header = card.slice(
      card.indexOf("<header"),
      card.indexOf("</header>"),
    );
    const body = card.slice(card.indexOf("id={panelId}"));
    assert.match(header, /<CalendarDays /);
    assert.match(header, /asset\.concept/);
    assert.match(header, /line-clamp-1/);
    assert.match(header, /recommendedPlatforms/);
    assert.match(header, /SOCIAL_DETAIL_PLATFORM_CHIP/);
    assert.match(header, /copy\.discussWithAthena/);
    assert.match(header, /<CopyButton/);
    assert.match(header, /showContinue/);
    assert.match(header, /variant="utility"/);
    assert.match(header, /<ChevronDown /);
    assert.match(header, /<ChevronUp /);
    assert.match(header, /copy\.openAsset/);
    assert.match(header, /copy\.closeAsset/);
    assert.match(header, /aria-expanded=\{open\}/);
    assert.doesNotMatch(header, /copy\.whoThisIsFor/);
    assert.doesNotMatch(header, /formatSocialPlannerCalendarOpportunity/);
    assert.doesNotMatch(header, /previewSocialCopy/);
    assert.doesNotMatch(header, /copy\.socialCopy/);
    assert.doesNotMatch(header, /SocialCalendarProductionSpec/);
    assert.doesNotMatch(header, /asset\.cta/);
    assert.match(body, /copy\.whoThisIsFor/);
    assert.match(body, /formatSocialPlannerCalendarOpportunity/);
    assert.match(body, /copy\.socialCopy/);
    assert.match(body, /<MessageSquareText /);
    assert.match(body, /asset\.cta/);
    assert.match(body, /SocialCalendarProductionSpec/);
    assert.match(body, /SOCIAL_DETAIL_PRODUCTION_SURFACE/);
    assert.match(body, /<Clapperboard /);
    assert.doesNotMatch(card, /previewSocialCopy/);
    assert.match(SOCIAL_DETAIL_DAY_SURFACE, /56,189,248/);
    assert.doesNotMatch(card, /ATHENA_EXECUTIVE_CARD_OUTLINE/);
    assert.doesNotMatch(SOCIAL_DETAIL_DAY_SURFACE, /255,102,0/);
  });

  it("keeps Copy \+ Continue, day Ask Athena, and production field copies", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(card, /data-asset-actions/);
    assert.match(card, /onDiscussWithAthena\(\{ date: asset\.date \}\)/);
    assert.match(card, /<MessageCircleQuestionMark /);
    assert.doesNotMatch(card, /showContinue=\{false\}/);
    assert.match(detail, /onDiscussWithAthena=\{handleDiscussWithAthena\}/);
    assert.match(detail, /data-ask-athena-slot/);
    assert.match(spec, /variant="utility"/);
    assert.match(spec, /showContinue=\{false\}/);
    assert.match(spec, /copy\.imagePrompt/);
    assert.match(spec, /copy\.slideN/);
    assert.match(spec, /copy\.shotN/);
    assert.match(spec, /copy\.productionDirection/);
    assert.doesNotMatch(spec, /text-\[var\(--athena-orange\)\]/);
    assert.match(SOCIAL_DETAIL_PRODUCTION_SURFACE, /251,191,36/);
  });

  it("keeps Try another approach green and Apply orange", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const panel = read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx");
    const thinkStart = detail.indexOf("copy.thinkDifferentlyTitle");
    const thinkBlock = detail.slice(
      detail.lastIndexOf("<button", thinkStart),
      detail.indexOf("</button>", thinkStart),
    );
    assert.match(thinkBlock, /<RefreshCw /);
    assert.match(thinkBlock, /border-\[var\(--athena-success\)\]\/30/);
    assert.match(thinkBlock, /bg-\[var\(--athena-success\)\]\/15/);
    assert.match(thinkBlock, /text-\[var\(--athena-success\)\]/);
    assert.doesNotMatch(thinkBlock, /athena-orange/);
    assert.match(panel, /bg-\[var\(--athena-orange\)\]/);
    assert.match(panel, /copy\.applySuggestions/);
    assert.match(panel, /onClick=\{onApply\}/);
  });

  it("does not add scores, provenance, sibling nav, or platform rainbow", () => {
    const files = [
      "lib/socialPlanner/socialPlannerDetailPresentation.ts",
      "components/socialPlanner/SocialCalendarDetail.tsx",
      "components/socialPlanner/SocialCalendarDayCard.tsx",
      "components/socialPlanner/SocialPlannerAskAthenaPanel.tsx",
      "app/social-planner/[id]/page.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /TractionSiblingNav|TractionPageHeader/);
      assert.doesNotMatch(
        source,
        /weekFingerprint|generationMetadata|sourceSignals|creativeFingerprint|personaIds/,
      );
      assert.doesNotMatch(
        source,
        /diversity score|intelligence confidence|geography confidence|divergence score|quality score|readiness score|performance score/i,
      );
      assert.doesNotMatch(source, /\bPublish\b|\bSchedule\b/);
      assert.doesNotMatch(source, /#E4405F|#1877F2|#0A66C2|#000000/);
    }
    assert.doesNotMatch(
      read("lib/socialPlanner/socialPlannerDetailPresentation.ts"),
      /ATHENA_EXECUTIVE_CARD_OUTLINE/,
    );
    assert.equal(
      ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS,
      "border border-[rgba(255,102,0,0.18)] hover:border-[rgba(255,102,0,0.35)]",
    );
  });

  it("locks Think Differently mode labels and keeps Show more / Show less keys", () => {
    for (const dictionary of DICTIONARIES) {
      assert.equal(
        dictionary.socialPlanner.generationModes.thinkDifferently,
        "Think Differently",
      );
      assert.match(dictionary.socialPlanner.openAsset, /\S/);
      assert.match(dictionary.socialPlanner.closeAsset, /\S/);
      assert.match(dictionary.socialPlanner.askAthenaTitle, /Ask Athena/);
      assert.match(dictionary.socialPlanner.productionGuidance, /\S/);
    }
    assert.equal(en.socialPlanner.thinkDifferently, "Try another approach");
    assert.equal(en.socialPlanner.backToSocialPlanner, "Back to Social Content");
    const copyButton = read("components/deployment/CopyButton.tsx");
    const collapsible = read("components/ui/AthenaCollapsibleSection.tsx");
    assert.match(copyButton, /variant = "default"/);
    assert.match(copyButton, /showContinue = true/);
    assert.match(collapsible, /defaultOpen = false/);
    assert.match(collapsible, /tone = "default"/);
  });
});
