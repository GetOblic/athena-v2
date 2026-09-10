/**
 * V2-UI-3C — Define Your Business / Athena Brain page composition.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { IdentityCalibrationGaps } from "../../components/identity/IdentityCalibrationGaps";
import { IdentityWebsiteKnowledge } from "../../components/identity/IdentityWebsiteKnowledge";
import { IdentityWhatAthenaKnows } from "../../components/identity/IdentityWhatAthenaKnows";
import {
  hasSuccessfulAthenaTraining,
  IDENTITY_UPDATE_LOCATION_HREFS,
  isAthenaBrainTraining,
  localizeUpdateLocation,
  readWebsiteKnowledgeFlags,
  shouldOpenTeachAthena,
} from "../../components/identity/identityPagePresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import type { AthenaIdentity } from "../../services/identity/identityService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(
      ...collectKeyPaths((value as Record<string, unknown>)[key], next),
    );
  }
  return paths;
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const NEW_PAGE_COMPONENTS = [
  "components/identity/IdentityPageHeader.tsx",
  "components/identity/IdentityKnowledgeScore.tsx",
  "components/identity/IdentityWhatAthenaKnows.tsx",
  "components/identity/IdentityTeachAthenaSection.tsx",
  "components/identity/IdentityCalibrationGaps.tsx",
  "components/identity/IdentityWebsiteKnowledge.tsx",
  "components/identity/IdentityAdvancedUnderstanding.tsx",
  "components/identity/IdentityOtherTools.tsx",
  "components/identity/identityPagePresentation.ts",
] as const;

function sampleIdentity(
  overrides: Partial<AthenaIdentity> = {},
): AthenaIdentity {
  return {
    id: "id-1",
    user_id: "user-1",
    organization_id: "org-1",
    greeting_name: "Laurent",
    about_you: "voice",
    expertise: "knowledge",
    website: "https://example.com",
    brain_status: "ready",
    brain_last_updated: "2026-08-31T12:00:00.000Z",
    master_profile: {
      homepage_learning: "Homepage copy Athena learned.",
      executive_intelligence: {
        executive_summary: "A clinic serving local clients.",
        confidence_level: "strong",
        confidence_reasons: ["clear voice"],
        voice_alignment: "strong",
        business_knowledge_coverage: "developing",
        website_evidence_coverage: "limited",
        business_model: {
          business_overview: "Medical aesthetics clinic",
          geographic_reach: "Local city",
        },
        hidden_signals: [],
        calibration_gaps: [
          {
            what_is_unclear: "Offer priority",
            why_it_matters: "Downstream assets may drift",
            update_location: "Your Voice",
          },
        ],
      },
    },
    master_profile_version: "1",
    master_profile_generated_at: "2026-08-31T12:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
}

describe("V2-UI-3C Identity page composition", () => {
  it("keeps TenantAppShell currentPath=/identity and tenant load contracts", () => {
    const page = read("app/identity/page.tsx");
    assert.match(
      page,
      /<TenantAppShell currentPath="\/identity" messages=\{messages\}>/,
    );
    assert.match(page, /getAthenaIdentityByUserId\(userId, organizationId\)/);
    assert.match(page, /requireCurrentOrganizationContext/);
    assert.match(page, /upsertAthenaIdentity/);
    assert.match(page, /redirect\("\/identity\?saved=true"\)/);
    assert.match(page, /saveBrandIdentity/);
    assert.match(page, /saveAiWorkspacePreferences/);
  });

  it("removes V1 Brain Status rail, checklists, continuous learning, and scores", () => {
    const page = read("app/identity/page.tsx");
    const header = read("components/identity/IdentityPageHeader.tsx");
    const knows = read("components/identity/IdentityWhatAthenaKnows.tsx");
    assert.doesNotMatch(page, /lg:grid-cols-\[2fr_1fr\]/);
    assert.doesNotMatch(page, /copy\.continuousLearning/);
    assert.doesNotMatch(page, /copy\.voiceLearned/);
    assert.doesNotMatch(page, /copy\.homepageLearned/);
    assert.doesNotMatch(page, /copy\.terminologyLearned/);
    assert.doesNotMatch(page, /copy\.brainStatus/);
    assert.doesNotMatch(page, /<\/aside>/);
    for (const source of [page, header, knows]) {
      assert.doesNotMatch(source, /readiness|completeness meter|Brain score/i);
      assert.doesNotMatch(source, /JSON\.stringify\(identity\.master_profile/);
    }
    assert.equal(en.identity.continuousLearning, "Continuous learning enabled");
    assert.equal(en.identity.voiceLearned, "Voice learned");
  });

  it("preserves the exact four Train Athena fields and mutation contract", () => {
    const teach = read("components/identity/IdentityTeachAthenaSection.tsx");
    const page = read("app/identity/page.tsx");
    const button = read("components/identity/TrainAthenaSubmitButton.tsx");
    assert.match(teach, /<TrainAthenaForm/);
    assert.match(teach, /<TrainAthenaSubmitButton/);
    assert.match(teach, /name="greeting_name"/);
    assert.match(teach, /name="about_you"/);
    assert.match(teach, /name="expertise"/);
    assert.match(teach, /name="website"/);
    assert.match(teach, /defaultValue=\{identity\?\.greeting_name \?\? ""\}/);
    assert.match(teach, /defaultValue=\{identity\?\.about_you \?\? ""\}/);
    assert.match(teach, /defaultValue=\{identity\?\.expertise \?\? ""\}/);
    assert.match(teach, /defaultValue=\{identity\?\.website \?\? ""\}/);
    assert.match(teach, /rows=\{6\}/);
    assert.match(teach, /rows=\{8\}/);
    assert.match(teach, /id=\{IDENTITY_FIELD_ANCHORS\.voice\}/);
    assert.match(teach, /scroll-mt-24/);
    assert.match(page, /greetingName: String\(formData\.get\("greeting_name"/);
    assert.match(page, /aboutYou: String\(formData\.get\("about_you"/);
    assert.match(page, /expertise: String\(formData\.get\("expertise"/);
    assert.match(page, /website: String\(formData\.get\("website"/);
    assert.match(page, /trainLabel=\{trainLabel\}/);
    assert.match(page, /copy\.retrainAthena/);
    assert.match(button, /pending \? pendingLabel : label/);
    assert.doesNotMatch(teach, /type="button"[^>]*>[\s\S]*Save/);
    assert.doesNotMatch(page, /sticky/);
  });

  it("keeps Brand, Deep Scrape, conversation, workspace, and GetOblic contracts", () => {
    const page = read("app/identity/page.tsx");
    const conversation = read(
      "components/identity/IdentityConversationPanel.tsx",
    );
    const deep = read("components/identity/DeepScrapeWebsiteButton.tsx");
    assert.match(page, /<BrandIdentitySection/);
    assert.match(page, /saveBrandIdentity=\{saveBrandIdentity\}/);
    assert.match(page, /<AiWorkspacePreferencesSection/);
    assert.match(page, /<GetOblicLinksCard/);
    assert.match(
      page,
      /initiallyAvailable=\{identity\?\.brain_status === "ready" && hasWebsite\}/,
    );
    assert.match(conversation, /defaultOpen=\{false\}/);
    assert.match(conversation, /IDENTITY_CONVERSATION_ENDPOINT/);
    assert.match(conversation, /\/api\/identity\/conversation/);
    assert.doesNotMatch(conversation, /Apply|upsertAthenaIdentity|saveIdentity/);
    assert.match(deep, /syncedInitiallyAvailable/);
    assert.equal(en.identity.conversationTitle, "Ask Athena what it understands");
    assert.match(
      en.identity.conversationDescription,
      /do not change the Brain/,
    );
  });

  it("composes untrained vs trained sections in the accepted V2 order", () => {
    const page = read("app/identity/page.tsx");
    const trainedStart = page.indexOf("{trained ? (");
    const splitAt = page.indexOf(") : (", trainedStart);
    const trainedBlock = page.slice(trainedStart, splitAt);
    const untrainedBlock = page.slice(splitAt);
    assert.match(trainedBlock, /IdentityWhatAthenaKnows/);
    assert.match(trainedBlock, /IdentityCalibrationGaps/);
    assert.ok(
      trainedBlock.indexOf("IdentityWhatAthenaKnows") <
        trainedBlock.indexOf("IdentityCalibrationGaps"),
    );
    assert.ok(
      trainedBlock.indexOf("IdentityCalibrationGaps") <
        trainedBlock.indexOf("{askAthena}"),
    );
    assert.ok(
      trainedBlock.indexOf("{askAthena}") <
        trainedBlock.indexOf("{teachAthena}"),
    );
    assert.ok(
      trainedBlock.indexOf("{teachAthena}") <
        trainedBlock.indexOf("{brandIdentity}"),
    );
    assert.ok(
      trainedBlock.indexOf("{brandIdentity}") <
        trainedBlock.indexOf("{otherTools}"),
    );
    assert.ok(
      trainedBlock.indexOf("{otherTools}") <
        trainedBlock.indexOf("IdentityAdvancedUnderstanding"),
    );
    assert.ok(
      trainedBlock.indexOf("IdentityAdvancedUnderstanding") <
        trainedBlock.indexOf("IdentityWebsiteKnowledge"),
    );
    assert.doesNotMatch(untrainedBlock, /IdentityWhatAthenaKnows/);
    assert.doesNotMatch(untrainedBlock, /IdentityCalibrationGaps/);
    assert.doesNotMatch(untrainedBlock, /IdentityWebsiteKnowledge/);
    assert.doesNotMatch(untrainedBlock, /IdentityAdvancedUnderstanding/);
    assert.match(untrainedBlock, /\{askAthena\}/);
    assert.ok(
      untrainedBlock.indexOf("{askAthena}") <
        untrainedBlock.indexOf("{teachAthena}"),
    );
    assert.ok(
      untrainedBlock.indexOf("{teachAthena}") <
        untrainedBlock.indexOf("{brandIdentity}"),
    );
    assert.ok(
      untrainedBlock.indexOf("{brandIdentity}") <
        untrainedBlock.indexOf("{otherTools}"),
    );
    assert.equal(hasSuccessfulAthenaTraining(null), false);
    assert.equal(hasSuccessfulAthenaTraining(sampleIdentity()), true);
    assert.equal(
      isAthenaBrainTraining(sampleIdentity({ brain_status: "processing" })),
      true,
    );
    assert.equal(
      shouldOpenTeachAthena({
        trained: true,
        training: false,
        hasCalibrationGaps: false,
      }),
      false,
    );
    assert.equal(
      shouldOpenTeachAthena({
        trained: true,
        training: false,
        hasCalibrationGaps: true,
      }),
      true,
    );
    assert.equal(
      shouldOpenTeachAthena({
        trained: false,
        training: false,
        hasCalibrationGaps: false,
      }),
      true,
    );
    assert.doesNotMatch(page, /shouldOpenTeachAthena/);
    assert.doesNotMatch(page, /teachAthenaOpen/);
  });

  it("defaults all top-level Identity cards closed and keeps Teach auto-open overridden", () => {
    const page = read("app/identity/page.tsx");
    const teach = read("components/identity/IdentityTeachAthenaSection.tsx");
    const knows = read("components/identity/IdentityWhatAthenaKnows.tsx");
    const gaps = read("components/identity/IdentityCalibrationGaps.tsx");
    const website = read("components/identity/IdentityWebsiteKnowledge.tsx");
    const advanced = read(
      "components/identity/IdentityAdvancedUnderstanding.tsx",
    );
    const other = read("components/identity/IdentityOtherTools.tsx");
    for (const source of [teach, knows, gaps, website, advanced, other]) {
      assert.match(source, /defaultOpen=\{false\}/);
    }
    assert.match(page, /defaultOpen=\{false\}/);
    assert.doesNotMatch(page, /defaultOpen=\{true\}/);
    assert.doesNotMatch(page, /shouldOpenTeachAthena/);
    assert.match(teach, /GraduationCap/);
    assert.match(knows, /<Brain /);
    assert.match(gaps, /<Target /);
    assert.match(page, /MessageCircleQuestionMark/);
    assert.match(page, /<Palette /);
    assert.match(other, /<Wrench /);
    assert.match(advanced, /<BarChart3 /);
    assert.match(website, /<Globe /);
    assert.match(teach, /IDENTITY_SUCCESS_SECTION_CONTOUR_CLASS/);
    assert.match(page, /IDENTITY_SUCCESS_SECTION_CONTOUR_CLASS/);
    assert.match(
      read("components/identity/identityPagePresentation.ts"),
      /border-\[var\(--athena-success\)\]\/35/,
    );
    assert.match(
      read("components/identity/TrainAthenaSubmitButton.tsx"),
      /bg-\[var\(--athena-orange\)\]/,
    );
    assert.match(teach, /IDENTITY_FIELD_ANCHORS\.websiteKnowledge/);
    assert.match(teach, /messages\.deepScrape\.button/);
    assert.doesNotMatch(teach, /DeepScrapeWebsiteButton/);
    assert.doesNotMatch(teach, /\/api\/identity\/deep-scrape/);
    assert.equal(
      (page.match(/<DeepScrapeWebsiteButton/g) ?? []).length,
      1,
    );
    assert.match(page, /deepScrape=\{deepScrape\}/);
    assert.match(website, /\{deepScrape\}/);
    assert.match(website, /headerActions/);
    assert.match(page, /<IdentityKnowledgeScore/);
    assert.match(page, /computeIdentityKnowledgeScore/);
    for (const source of [knows, gaps, website, teach]) {
      assert.doesNotMatch(source, /conic-gradient|Brain score/i);
      assert.doesNotMatch(source, /computeBrainCompletenessScore/);
      assert.doesNotMatch(source, /computeIdentityKnowledgeScore/);
    }
    assert.doesNotMatch(page, /computeBrainCompletenessScore/);
  });

  it("promotes calibration gaps with localized update_location mapping only", () => {
    const stored = "Your Voice" as const;
    assert.equal(
      IDENTITY_UPDATE_LOCATION_HREFS[stored],
      "#identity-voice",
    );
    assert.equal(
      IDENTITY_UPDATE_LOCATION_HREFS["Your Business Knowledge"],
      "#identity-knowledge",
    );
    assert.equal(
      IDENTITY_UPDATE_LOCATION_HREFS["Business Website"],
      "#identity-website",
    );
    assert.equal(
      IDENTITY_UPDATE_LOCATION_HREFS["Website content"],
      "#identity-website-knowledge",
    );
    assert.equal(localizeUpdateLocation(stored, fr.identity.page), fr.identity.page.updateLocationVoice);
    assert.notEqual(fr.identity.page.updateLocationVoice, "Your Voice");
    assert.equal(stored, "Your Voice");

    const html = renderToStaticMarkup(
      createElement(IdentityCalibrationGaps, {
        gaps: [
          {
            what_is_unclear: "Offer priority",
            why_it_matters: "Downstream assets may drift",
            update_location: "Your Voice",
          },
        ],
        messages: fr.identity,
      }),
    );
    assert.ok(html.includes(fr.identity.page.gapsTitle));
    assert.match(html, /aria-expanded="false"/);
    const gapsSource = read("components/identity/IdentityCalibrationGaps.tsx");
    assert.match(gapsSource, /href=\{href\}/);
    assert.match(gapsSource, /gap\.what_is_unclear/);
    assert.match(gapsSource, /defaultOpen=\{false\}/);
    assert.doesNotMatch(gapsSource, /Apply|saved|100%|fully ready|complete/i);
    assert.doesNotMatch(
      gapsSource,
      /fetch\(|upsertAthenaIdentity|saveIdentity/,
    );
  });

  it("does not treat a website URL as homepage-learned evidence before training", () => {
    const untrainedUrl = sampleIdentity({
      brain_status: "pending",
      brain_last_updated: null,
      master_profile: null,
      master_profile_generated_at: null,
      website_intelligence: null,
      last_deep_scrape_at: null,
    });
    const flags = readWebsiteKnowledgeFlags(untrainedUrl);
    assert.equal(flags.hasWebsiteUrl, true);
    assert.equal(flags.hasHomepageLearning, false);
    assert.equal(flags.hasDeepIntelligence, false);

    const html = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity: untrainedUrl,
        messages: en.identity,
        language: "en",
        trained: false,
        deepScrape: null,
      }),
    );
    assert.match(html, /Website knowledge/);
    assert.match(html, /id="identity-website-knowledge"/);
    assert.match(html, /aria-expanded="false"/);
    const website = read("components/identity/IdentityWebsiteKnowledge.tsx");
    assert.match(website, /page\.websiteWillStudy/);
    assert.match(website, /id=\{IDENTITY_FIELD_ANCHORS\.websiteKnowledge\}/);
    assert.match(website, /defaultOpen=\{false\}/);
    assert.doesNotMatch(html, /Athena learned from the homepage during training/);
    assert.doesNotMatch(html, /Pages analyzed/);
    assert.doesNotMatch(read("app/identity/page.tsx"), /pagesAnalyzed = 1/);
  });

  it("phrases What Athena knows as current understanding, not confirmed facts", () => {
    const html = renderToStaticMarkup(
      createElement(IdentityWhatAthenaKnows, {
        identity: sampleIdentity({
          brain_status: "processing",
        }),
        messages: en.identity,
      }),
    );
    assert.match(html, /What Athena knows/);
    assert.match(html, /aria-expanded="false"/);
    const knows = read("components/identity/IdentityWhatAthenaKnows.tsx");
    assert.match(knows, /page\.knowsAttribution/);
    assert.match(knows, /page\.knowsLastSuccessful/);
    assert.match(knows, /executive\.executive_summary/);
    assert.match(knows, /defaultOpen=\{false\}/);
    assert.doesNotMatch(html, /master_profile/);
    assert.doesNotMatch(html, /"executive_intelligence"/);
  });

  it("keeps new presentation files as server components", () => {
    for (const file of NEW_PAGE_COMPONENTS) {
      assert.doesNotMatch(read(file), /"use client"/);
    }
    assert.match(
      read("components/identity/IdentityConversationPanel.tsx"),
      /"use client"/,
    );
    assert.match(
      read("components/identity/TrainAthenaSubmitButton.tsx"),
      /"use client"/,
    );
  });

  it("keeps six-language i18n parity for new Identity page keys", () => {
    const englishPaths = collectKeyPaths(en.identity.page);
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.deepEqual(
        collectKeyPaths(DICTIONARIES[language].identity.page),
        englishPaths,
        language,
      );
    }
    assert.equal(en.identity.title, "Define Your Business");
    assert.notEqual(fr.identity.title, en.identity.title);
    assert.equal(en.identity.retrainAthena, "Retrain Athena");
    assert.notEqual(fr.identity.retrainAthena, en.identity.retrainAthena);
    assert.equal(en.identity.knowledgeScore, "Knowledge Score");
    assert.notEqual(fr.identity.knowledgeScore, en.identity.knowledgeScore);
    assert.match(en.identity.page.gapsEmpty, /Nothing material/);
    assert.doesNotMatch(en.identity.page.gapsEmpty, /complete|100%|fully ready/i);
  });
});
