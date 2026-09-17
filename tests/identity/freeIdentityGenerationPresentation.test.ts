/**
 * FREE-7 — honest Identity presentation for trained Free.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { IdentityTeachAthenaSection } from "../../components/identity/IdentityTeachAthenaSection";
import { IdentityWebsiteKnowledge } from "../../components/identity/IdentityWebsiteKnowledge";
import {
  evaluateFreeIdentityGeneration,
  isFreeIdentityGenerationLocked,
} from "../../lib/organization/freeIdentityGeneration";
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

function sampleIdentity(
  overrides: Partial<AthenaIdentity> = {},
): AthenaIdentity {
  return {
    id: "id-1",
    user_id: "user-1",
    organization_id: "org-1",
    greeting_name: "Laurent",
    about_you: "Warm professional voice",
    expertise: "Five-step methodology",
    website: "https://example.com",
    brain_status: "ready",
    brain_last_updated: "2026-09-17T12:00:00.000Z",
    master_profile: {
      homepage_learning: "Homepage copy Athena learned.",
    },
    master_profile_version: "1",
    master_profile_generated_at: "2026-09-17T12:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-17T12:00:00.000Z",
    ...overrides,
  };
}

describe("FREE-7 Identity generation presentation", () => {
  it("keeps the first Free Train form and action", () => {
    assert.equal(
      isFreeIdentityGenerationLocked({ athenaPlan: "free", trained: false }),
      false,
    );
    const html = renderToStaticMarkup(
      createElement(IdentityTeachAthenaSection, {
        identity: null,
        messages: en.identity,
        action: async () => undefined,
        trainLabel: en.identity.trainAthena,
        pendingLabel: en.identity.trainingAthena,
        generationLocked: false,
      }),
    );
    assert.match(html, /Teach Athena/);
    assert.match(html, /Athena learns from these four things/);
    assert.doesNotMatch(html, /Athena has learned your business/);

    const teach = read("components/identity/IdentityTeachAthenaSection.tsx");
    assert.match(teach, /<TrainAthenaForm/);
    assert.match(teach, /<TrainAthenaSubmitButton/);
    assert.match(teach, /name="greeting_name"/);
    assert.match(teach, /name="about_you"/);
    assert.match(teach, /name="expertise"/);
    assert.match(teach, /name="website"/);
    assert.match(teach, /generationLocked/);
  });

  it("replaces trained Free Retrain and Deep Scrape with honest learned presentation", () => {
    assert.equal(
      evaluateFreeIdentityGeneration({ athenaPlan: "free", trained: true }).allow,
      false,
    );
    const identity = sampleIdentity();
    const teach = renderToStaticMarkup(
      createElement(IdentityTeachAthenaSection, {
        identity,
        messages: en.identity,
        action: async () => undefined,
        trainLabel: en.identity.retrainAthena,
        pendingLabel: en.identity.retrainingAthena,
        generationLocked: true,
      }),
    );
    assert.match(teach, /Athena has learned your business/);
    assert.doesNotMatch(teach, /name="greeting_name"/);
    assert.doesNotMatch(teach, /name="about_you"/);
    assert.doesNotMatch(teach, /Retrain Athena/);
    assert.doesNotMatch(teach, /Deep Scrape Website/);
    assert.doesNotMatch(teach, /upgrade|price|subscription|Upgrade/i);

    const teachSource = read("components/identity/IdentityTeachAthenaSection.tsx");
    const lockedTeach = teachSource.slice(
      teachSource.indexOf("{generationLocked ? ("),
      teachSource.indexOf(") : ("),
    );
    assert.match(lockedTeach, /page\.teachLearned/);
    assert.match(lockedTeach, /page\.teachLearnedHelper/);
    assert.match(lockedTeach, /ReadOnlyFact/);
    assert.match(lockedTeach, /identity\?\.greeting_name/);
    assert.match(lockedTeach, /identity\?\.about_you/);
    assert.match(lockedTeach, /identity\?\.expertise/);
    assert.match(lockedTeach, /identity\?\.website/);
    assert.doesNotMatch(lockedTeach, /TrainAthenaForm|TrainAthenaSubmitButton|name="/);

    const website = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity,
        messages: en.identity,
        language: "en",
        trained: true,
        deepScrape: createElement("button", null, "Deep Scrape Website"),
        generationLocked: true,
      }),
    );
    assert.match(website, /Website knowledge/);
    assert.match(website, /Athena already learned from this website/);
    assert.doesNotMatch(website, /Deep Scrape Website/);
    assert.doesNotMatch(website, /Retrain Athena/);
    assert.doesNotMatch(website, /upgrade|price|subscription/i);
  });

  it("keeps Full trained Retrain and Deep Scrape actions", () => {
    assert.equal(
      isFreeIdentityGenerationLocked({ athenaPlan: "full", trained: true }),
      false,
    );
    const website = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity: sampleIdentity(),
        messages: en.identity,
        language: "en",
        trained: true,
        deepScrape: createElement("button", null, "Deep Scrape Website"),
        generationLocked: false,
      }),
    );
    assert.match(website, /Deep Scrape Website/);
    assert.match(website, /Retrain Athena/);

    const page = read("app/identity/page.tsx");
    assert.match(page, /isFreeIdentityGenerationLocked/);
    assert.match(page, /generationLocked=\{identityGenerationLocked\}/);
    assert.match(page, /identityGenerationLocked \? null : \(/);
    assert.match(page, /<DeepScrapeWebsiteButton/);
    assert.match(page, /<BrandIdentitySection/);
    assert.match(page, /<IdentityConversationPanel/);
    assert.match(page, /<IdentityWhatAthenaKnows/);
    assert.match(page, /<IdentityKnowledgeScore/);
  });

  it("does not gate Brand Identity or Ask Athena", () => {
    const page = read("app/identity/page.tsx");
    const brandSave = page.slice(
      page.indexOf("async function saveBrandIdentity"),
      page.indexOf("async function saveAiWorkspacePreferences"),
    );
    assert.doesNotMatch(
      brandSave,
      /assertCurrentFreeIdentityGeneration|FreeIdentityGeneration/,
    );
    assert.match(page, /<IdentityConversationPanel/);
    assert.match(page, /<BrandIdentitySection/);
    assert.doesNotMatch(
      read("app/api/identity/conversation/route.ts"),
      /assertCurrentFreeIdentityGeneration|FreeIdentityGeneration/,
    );
    assert.doesNotMatch(
      read("services/identity/brandIdentityService.ts"),
      /assertCurrentFreeIdentityGeneration|FreeIdentityGeneration/,
    );
  });

  it("keeps six-language parity without pricing copy", () => {
    const englishPaths = collectKeyPaths(en.identity.page);
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.deepEqual(
        collectKeyPaths(DICTIONARIES[language].identity.page),
        englishPaths,
        language,
      );
    }
    assert.equal(en.identity.page.teachLearned, "Athena has learned your business");
    assert.notEqual(fr.identity.page.teachLearned, en.identity.page.teachLearned);
    assert.notEqual(es.identity.page.teachLearned, en.identity.page.teachLearned);
    assert.notEqual(de.identity.page.teachLearned, en.identity.page.teachLearned);
    assert.notEqual(pt.identity.page.teachLearned, en.identity.page.teachLearned);
    assert.notEqual(itMessages.identity.page.teachLearned, en.identity.page.teachLearned);
    for (const language of ORGANIZATION_LANGUAGES) {
      const page = DICTIONARIES[language].identity.page;
      assert.doesNotMatch(page.teachLearned, /upgrade|price|subscription|€|\$/i);
      assert.doesNotMatch(page.teachLearnedHelper, /upgrade|price|subscription|€|\$/i);
      assert.doesNotMatch(page.websiteLearnedHelp, /upgrade|price|subscription|€|\$/i);
    }
  });
});
