/**
 * Prospect detail presentation — V2 grammar, CTA hierarchy, and IA.
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProspectDetailHeader } from "../../components/prospects/ProspectDetailHeader";
import { ProspectIntelligenceScore } from "../../components/prospects/ProspectIntelligenceScore";
import {
  PROSPECT_BACK_LINK_CLASS,
  PROSPECT_DETAIL_SECTION_ORDER,
  PROSPECT_PRIMARY_ACTION,
  PROSPECT_SECONDARY_GREEN_ACTION,
  PROSPECT_UTILITY_ACTION,
} from "../../lib/prospects/prospectDetailPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const SCORE_KEYS = [
  "label",
  "help",
  "bandLow",
  "bandMedium",
  "bandStrong",
  "bandExcellent",
] as const;

describe("Prospect detail presentation", () => {
  it("keeps the approved ready-path information architecture", () => {
    assert.deepEqual([...PROSPECT_DETAIL_SECTION_ORDER], [
      "back",
      "header",
      "cta",
      "banners",
      "executive-snapshot",
      "athena-recommendation",
      "identity-contact",
      "website-intelligence",
      "getoblic-description",
      "commercial",
      "outreach",
      "ask-athena",
      "observation",
      "advanced",
    ]);
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /ProspectDetailHeader/);
    assert.match(page, /afterProspectRecommendation/);
    assert.match(page, /ProspectIdentityContactGlance/);
    assert.match(page, /ProspectHomepageIntelligence/);
    assert.match(page, /ProspectGetoblicDescriptionCard/);
    assert.match(page, /GetOblicListingReleaseControl/);
    assert.doesNotMatch(page, /HeaderMetric|DiscussionWorkflowStrip/);
    assert.doesNotMatch(page, /ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS/);
  });

  it("renders Ask Athena as header primary when Ready and Generate when no EV", () => {
    const ready = renderToStaticMarkup(
      createElement(ProspectDetailHeader, {
        backLabel: "Prospects",
        eyebrow: "Prospect",
        title: "Acme Clinic",
        intelligenceLabel: "Ready",
        intelligenceStatus: "Ready",
        ready: true,
        hasDiscussion: true,
        askAthenaLabel: en.prospects.detail.askAthena,
        addObservationLabel: en.prospects.detail.addObservation,
        editProfileLabel: en.prospects.detail.editProfile,
        openWebsiteLabel: en.prospects.detail.openWebsite,
        completenessScore: createElement(ProspectIntelligenceScore, {
          score: 0,
          messages: en.prospects.score,
        }),
        generateActions: createElement("button", { type: "button" }, "Refresh intelligence"),
        researchAction: null,
        lifecycleAction: null,
        destructiveAction: null,
      }),
    );
    assert.match(ready, /data-prospect-header-action="ask-athena"/);
    assert.match(ready, /Prospect Completeness/);
    assert.match(ready, /conic-gradient/);
    assert.doesNotMatch(ready, /Opportunity Score/);
    assert.doesNotMatch(ready, /HeaderMetric/);
    assert.match(ready, new RegExp(PROSPECT_PRIMARY_ACTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const empty = renderToStaticMarkup(
      createElement(ProspectDetailHeader, {
        backLabel: "Prospects",
        eyebrow: "Prospect",
        title: "Acme Clinic",
        intelligenceLabel: "Saved",
        intelligenceStatus: "Saved",
        ready: false,
        hasDiscussion: true,
        askAthenaLabel: en.prospects.detail.askAthena,
        addObservationLabel: en.prospects.detail.addObservation,
        editProfileLabel: en.prospects.detail.editProfile,
        openWebsiteLabel: en.prospects.detail.openWebsite,
        completenessScore: createElement(ProspectIntelligenceScore, {
          score: 8,
          messages: en.prospects.score,
        }),
        generateActions: createElement("button", { type: "button" }, "Generate prospect intelligence"),
        researchAction: null,
        lifecycleAction: null,
        destructiveAction: null,
      }),
    );
    assert.match(empty, /Generate prospect intelligence/);
    assert.match(empty, /data-prospect-header-action="ask-athena"/);
  });

  it("keeps Try another approach green and Refresh utility in the refresh control", () => {
    const refresh = read("components/prospects/ProspectRefreshIntelligenceButton.tsx");
    assert.match(refresh, /PROSPECT_SECONDARY_GREEN_ACTION/);
    assert.match(refresh, /PROSPECT_UTILITY_ACTION/);
    assert.match(refresh, /PROSPECT_PRIMARY_ACTION/);
    assert.match(refresh, /Lightbulb/);
    assert.match(refresh, /Sparkles/);
    assert.match(refresh, /RefreshCw/);
    assert.doesNotMatch(
      refresh,
      /think_differently[\s\S]{0,200}bg-\[var\(--athena-orange\)\]/,
    );
    assert.ok(PROSPECT_SECONDARY_GREEN_ACTION.includes("athena-success"));
    assert.ok(!PROSPECT_UTILITY_ACTION.includes("athena-orange"));
  });

  it("collapses secondary convert cards, outreach, Ask Athena, and observation", () => {
    const sections = read(
      "components/prospects/ProspectIntelligenceSections.tsx",
    );
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const conversation = read(
      "components/prospects/ProspectConversationPanel.tsx",
    );
    const append = read(
      "components/prospects/AppendProspectInformationForm.tsx",
    );
    assert.match(sections, /title=\{convert\.whyMatters\}/);
    assert.match(sections, /title=\{convert\.whatTheyNeed\}/);
    assert.match(sections, /title=\{convert\.timingAndIntent\}/);
    assert.match(sections, /title=\{convert\.risksAndObjections\}/);
    assert.match(sections, /title=\{convert\.commercialReasoning\}/);
    assert.equal((sections.match(/defaultOpen=\{false\}/g) ?? []).length, 5);
    assert.match(workspace, /outreach-drafts-/);
    assert.match(workspace, /defaultOpen=\{false\}/);
    assert.match(conversation, /defaultOpen=\{false\}/);
    assert.match(append, /defaultOpen=\{false\}/);
    assert.match(workspace, /tenantMessages\?\.prospects\.convert\.advanced/);
    assert.match(workspace, /opportunity\?\.score/);
  });

  it("uses a local utility back link and does not change TenantBackLink", () => {
    const header = read("components/prospects/ProspectDetailHeader.tsx");
    const page = read("app/prospects/[id]/page.tsx");
    const backLink = read("components/navigation/TenantBackLink.tsx");
    assert.match(header, /ArrowLeft/);
    assert.match(header, /PROSPECT_BACK_LINK_CLASS/);
    assert.ok(PROSPECT_BACK_LINK_CLASS.includes("text-white/45"));
    assert.match(page, /href="\/prospects"/);
    assert.doesNotMatch(page, /TenantBackLink/);
    assert.doesNotMatch(backLink, /PROSPECT_BACK_LINK_CLASS/);
  });

  it("keeps required Prospect Completeness strings in all six locales", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const score = DICTIONARIES[language].prospects.score;
      for (const key of SCORE_KEYS) {
        assert.equal(typeof score[key], "string", `${language}.${key}`);
        assert.ok(score[key].trim(), `${language}.${key} empty`);
      }
      assert.ok(DICTIONARIES[language].prospects.detail.askAthena.trim());
      assert.ok(DICTIONARIES[language].prospects.detail.openWebsite.trim());
      assert.ok(DICTIONARIES[language].prospects.detail.editProfile.trim());
    }
    for (const language of ORGANIZATION_LANGUAGES.filter((code) => code !== "en")) {
      assert.notEqual(
        DICTIONARIES[language].prospects.score.label,
        en.prospects.score.label,
        `${language}.score.label`,
      );
      assert.notEqual(
        DICTIONARIES[language].prospects.detail.editProfile,
        en.prospects.detail.editProfile,
        `${language}.detail.editProfile`,
      );
    }
  });
});
