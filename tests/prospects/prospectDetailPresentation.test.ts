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
  PROSPECT_CTA_GROUP_LABEL,
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

const SECTION_LABEL_KEYS = [
  "intelligence",
  "prospectTools",
  "getoblicDirectory",
] as const;

function headerProps(
  overrides: Partial<Parameters<typeof ProspectDetailHeader>[0]> = {},
) {
  return {
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
    directoryAction: null,
    intelligenceGroupLabel: en.prospects.detail.intelligence,
    prospectToolsLabel: en.prospects.detail.prospectTools,
    directoryGroupLabel: en.prospects.detail.getoblicDirectory,
    ...overrides,
  };
}

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
    const header = read("components/prospects/ProspectDetailHeader.tsx");
    assert.match(page, /ProspectDetailHeader/);
    assert.doesNotMatch(header, /destructiveAction/);
    assert.doesNotMatch(header, /data-prospect-header-actions="destructive"/);
    assert.doesNotMatch(header, /data-prospect-header-actions="primary"/);
    assert.match(page, /afterProspectRecommendation/);
    assert.match(page, /ProspectIdentityContactGlance/);
    assert.match(page, /ProspectHomepageIntelligence/);
    assert.match(page, /ProspectGetoblicDescriptionCard/);
    assert.match(page, /GetOblicListingReleaseControl/);
    assert.equal(
      (page.match(/<GetOblicListingOutboundControls/g) ?? []).length,
      1,
    );
    assert.equal(
      (page.match(/<GetOblicListingReleaseControl/g) ?? []).length,
      1,
    );
    assert.match(page, /directoryAction=/);
    assert.doesNotMatch(page, /ProspectHeaderDeleteButton/);
    assert.doesNotMatch(page, /destructiveAction/);
    assert.doesNotMatch(page, /HeaderMetric|DiscussionWorkflowStrip/);
    assert.doesNotMatch(page, /ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS/);
  });

  it("renders Ask Athena as header primary when Ready and Generate when no EV", () => {
    const ready = renderToStaticMarkup(
      createElement(ProspectDetailHeader, headerProps()),
    );
    assert.match(ready, /data-prospect-header-action="ask-athena"/);
    assert.match(ready, /data-prospect-header-actions="intelligence"/);
    assert.doesNotMatch(ready, /data-prospect-header-actions="primary"/);
    assert.match(ready, /Prospect Completeness/);
    assert.match(ready, /conic-gradient/);
    assert.doesNotMatch(ready, /Opportunity Score/);
    assert.doesNotMatch(ready, /HeaderMetric/);
    assert.match(ready, new RegExp(PROSPECT_PRIMARY_ACTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const empty = renderToStaticMarkup(
      createElement(
        ProspectDetailHeader,
        headerProps({
          intelligenceLabel: "Saved",
          intelligenceStatus: "Saved",
          ready: false,
          completenessScore: createElement(ProspectIntelligenceScore, {
            score: 8,
            messages: en.prospects.score,
          }),
          generateActions: createElement(
            "button",
            { type: "button" },
            "Generate prospect intelligence",
          ),
        }),
      ),
    );
    assert.match(empty, /Generate prospect intelligence/);
    assert.match(empty, /data-prospect-header-action="ask-athena"/);
    assert.match(empty, /data-prospect-header-actions="intelligence"/);
    assert.doesNotMatch(empty, /data-prospect-header-actions="primary"/);
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
      for (const key of SECTION_LABEL_KEYS) {
        assert.equal(
          typeof DICTIONARIES[language].prospects.detail[key],
          "string",
          `${language}.detail.${key}`,
        );
        assert.ok(
          DICTIONARIES[language].prospects.detail[key].trim(),
          `${language}.detail.${key} empty`,
        );
      }
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
      assert.notEqual(
        DICTIONARIES[language].prospects.detail.prospectTools,
        en.prospects.detail.prospectTools,
        `${language}.detail.prospectTools`,
      );
      assert.notEqual(
        DICTIONARIES[language].prospects.detail.getoblicDirectory,
        en.prospects.detail.getoblicDirectory,
        `${language}.detail.getoblicDirectory`,
      );
    }
  });

  it("uses the frozen CTA group-label token and does not change button tokens", () => {
    assert.equal(
      PROSPECT_CTA_GROUP_LABEL,
      "text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40",
    );
    assert.ok(PROSPECT_PRIMARY_ACTION.includes("athena-orange"));
    assert.ok(PROSPECT_SECONDARY_GREEN_ACTION.includes("athena-success"));
    assert.ok(!PROSPECT_UTILITY_ACTION.includes("athena-orange"));
  });

  it("renders the approved semantic CTA hierarchy", () => {
    const html = renderToStaticMarkup(
      createElement(
        ProspectDetailHeader,
        headerProps({
          websiteHref: "https://acme.example",
          generateActions: createElement(
            "span",
            null,
            createElement(
              "button",
              {
                type: "button",
                "data-prospect-header-action": "think-differently",
              },
              "Try another approach",
            ),
            createElement(
              "button",
              { type: "button", "data-prospect-header-action": "refresh" },
              "Refresh intelligence",
            ),
          ),
          researchAction: createElement(
            "div",
            { "data-research-bundle": "true" },
            createElement(
              "button",
              {
                type: "button",
                "data-prospect-header-action": "research-website",
              },
              "Research this website",
            ),
            createElement("div", null, "Last Deep Scrape"),
          ),
          lifecycleAction: createElement(
            "div",
            { "data-prospect-header-action": "lifecycle" },
            "Working status",
          ),
          directoryAction: createElement(
            "div",
            null,
            createElement("button", { type: "button" }, "Send Description to GetOblic"),
            createElement("button", { type: "button" }, "Send Knowledge Base to GetOblic"),
            createElement("button", { type: "button" }, "Release GetOblic listing"),
          ),
        }),
      ),
    );

    const intelligence = html.indexOf('data-prospect-header-actions="intelligence"');
    const tools = html.indexOf('data-prospect-header-actions="tools"');
    const lifecycle = html.indexOf('data-prospect-header-actions="lifecycle"');
    const directory = html.indexOf('data-prospect-header-actions="directory"');
    const askAthena = html.indexOf('data-prospect-header-action="ask-athena"');
    const thinkDifferently = html.indexOf(
      'data-prospect-header-action="think-differently"',
    );
    const refresh = html.indexOf('data-prospect-header-action="refresh"');
    const research = html.indexOf('data-prospect-header-action="research-website"');
    const researchMeta = html.indexOf("Last Deep Scrape");
    const openWebsite = html.indexOf('data-prospect-header-action="open-website"');
    const sendDescription = html.indexOf("Send Description to GetOblic");
    const sendKnowledgeBase = html.indexOf("Send Knowledge Base to GetOblic");
    const releaseListing = html.indexOf("Release GetOblic listing");
    const groups = [
      ...html.matchAll(/data-prospect-header-actions="([^"]+)"/g),
    ].map((match) => match[1]);
    const intelligenceSlice = html.slice(intelligence, tools);

    assert.deepEqual(groups, ["intelligence", "tools", "lifecycle", "directory"]);
    assert.doesNotMatch(html, /data-prospect-header-actions="primary"/);
    assert.doesNotMatch(html, /data-prospect-header-actions="destructive"/);
    assert.doesNotMatch(html, /data-prospect-header-actions="utility"/);
    assert.equal(
      (html.match(/data-prospect-header-actions="intelligence"/g) ?? []).length,
      1,
    );
    assert.equal(
      (html.match(new RegExp(en.prospects.detail.intelligence, "g")) ?? []).length,
      1,
    );

    assert.ok(intelligence >= 0);
    assert.ok(tools > intelligence);
    assert.ok(lifecycle > tools);
    assert.ok(directory > lifecycle);
    assert.equal(groups.at(-1), "directory");

    assert.ok(askAthena > intelligence && askAthena < tools);
    assert.ok(thinkDifferently > askAthena && thinkDifferently < tools);
    assert.ok(refresh > thinkDifferently && refresh < tools);
    assert.ok(research > refresh && research < tools);
    assert.ok(researchMeta > research && researchMeta < tools);
    assert.match(intelligenceSlice, /data-prospect-header-action="ask-athena"/);
    assert.match(
      intelligenceSlice,
      /data-prospect-header-action="think-differently"/,
    );
    assert.match(intelligenceSlice, /data-prospect-header-action="refresh"/);
    assert.match(
      intelligenceSlice,
      /data-prospect-header-action="research-website"/,
    );
    assert.match(intelligenceSlice, /Last Deep Scrape/);
    assert.doesNotMatch(
      html.slice(tools, lifecycle),
      /data-prospect-header-action="ask-athena"|data-prospect-header-action="think-differently"|data-prospect-header-action="refresh"|data-prospect-header-action="research-website"/,
    );

    assert.ok(openWebsite > tools && openWebsite < lifecycle);
    assert.match(html, /data-prospect-header-action="edit-profile"/);
    assert.match(html, /data-prospect-header-action="observation"/);

    assert.ok(sendDescription > directory);
    assert.ok(sendKnowledgeBase > sendDescription);
    assert.ok(releaseListing > sendKnowledgeBase);

    assert.match(html, new RegExp(en.prospects.detail.prospectTools));
    assert.match(html, new RegExp(en.prospects.detail.getoblicDirectory));
    assert.equal((html.match(/Working status/g) ?? []).length, 1);
  });

  it("keeps Ready and not-Ready intelligence ordering inside one group", () => {
    const researchAction = createElement(
      "button",
      { type: "button", "data-prospect-header-action": "research-website" },
      "Research this website",
    );

    const ready = renderToStaticMarkup(
      createElement(
        ProspectDetailHeader,
        headerProps({
          generateActions: createElement(
            "button",
            { type: "button", "data-prospect-header-action": "refresh" },
            "Refresh intelligence",
          ),
          researchAction,
        }),
      ),
    );
    const readyAsk = ready.indexOf('data-prospect-header-action="ask-athena"');
    const readyRefresh = ready.indexOf('data-prospect-header-action="refresh"');
    const readyResearch = ready.indexOf(
      'data-prospect-header-action="research-website"',
    );
    assert.ok(readyAsk > 0 && readyRefresh > readyAsk && readyResearch > readyRefresh);

    const notReady = renderToStaticMarkup(
      createElement(
        ProspectDetailHeader,
        headerProps({
          ready: false,
          intelligenceLabel: "Saved",
          intelligenceStatus: "Saved",
          generateActions: createElement(
            "button",
            { type: "button", "data-prospect-header-action": "generate" },
            "Generate prospect intelligence",
          ),
          researchAction,
        }),
      ),
    );
    const notReadyGenerate = notReady.indexOf(
      'data-prospect-header-action="generate"',
    );
    const notReadyAsk = notReady.indexOf('data-prospect-header-action="ask-athena"');
    const notReadyResearch = notReady.indexOf(
      'data-prospect-header-action="research-website"',
    );
    assert.ok(
      notReadyGenerate > 0 &&
        notReadyAsk > notReadyGenerate &&
        notReadyResearch > notReadyAsk,
    );
    assert.doesNotMatch(ready, /data-prospect-header-actions="primary"/);
    assert.doesNotMatch(notReady, /data-prospect-header-actions="primary"/);
  });

  it("keeps the Intelligence group when Research is absent and hides empty later slots", () => {
    const html = renderToStaticMarkup(
      createElement(ProspectDetailHeader, headerProps()),
    );
    assert.doesNotMatch(html, /data-prospect-header-actions="primary"/);
    assert.match(html, /data-prospect-header-actions="intelligence"/);
    assert.match(html, /data-prospect-header-action="ask-athena"/);
    assert.match(html, /Refresh intelligence/);
    assert.doesNotMatch(html, /data-prospect-header-action="research-website"/);
    assert.match(html, /data-prospect-header-actions="tools"/);
    assert.doesNotMatch(html, /data-prospect-header-actions="lifecycle"/);
    assert.doesNotMatch(html, /data-prospect-header-actions="directory"/);
    assert.doesNotMatch(html, /data-prospect-header-actions="destructive"/);
    assert.equal(
      (html.match(new RegExp(en.prospects.detail.intelligence, "g")) ?? []).length,
      1,
    );
  });
});
