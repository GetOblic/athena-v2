/**
 * Help Center catalog integrity and V2-only CTA contracts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HELP_CENTER_TOPICS,
  HELP_DEFAULT_OPEN_SECTION_IDS,
  HELP_FORBIDDEN_PRIMARY_HREFS,
  HELP_OUTCOME_ORDER,
  HELP_PRIMARY_V2_HREFS,
  HELP_QUICK_START_ORDER,
  HELP_SAFE_INTERNAL_HREF_PATTERN,
  HELP_SECTION_ANCHORS,
  getHelpTopic,
  isHelpAskDestination,
  isHelpTopicId,
  isSafeHelpHref,
  listPrimaryHelpCtas,
} from "../../lib/gettingStarted/helpCenterCatalog";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import {
  filterHelpTopics,
  resolveHelpTopics,
} from "../../lib/gettingStarted/helpCenterTopics";

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

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

describe("help center catalog integrity", () => {
  it("keeps unique topic ids and unique anchors", () => {
    const ids = HELP_CENTER_TOPICS.map((topic) => topic.id);
    const anchors = HELP_CENTER_TOPICS.map((topic) => topic.anchor);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(anchors).size, anchors.length);
    assert.equal(isHelpTopicId("howto-audience-vs-prospect"), true);
    assert.equal(isHelpTopicId("inbox-onboarding"), false);
    assert.equal(isHelpTopicId(HELP_SECTION_ANCHORS.ask), false);
    assert.equal(isHelpAskDestination("ask"), true);
    assert.equal(isHelpAskDestination("#ask"), true);
    assert.equal(isHelpAskDestination("start"), false);
    assert.equal(isHelpAskDestination("howto-audience-vs-prospect"), false);
  });

  it("includes four outcomes and four quick-start steps", () => {
    assert.deepEqual([...HELP_OUTCOME_ORDER], [
      "outcome-define",
      "outcome-visibility",
      "outcome-traction",
      "outcome-convert",
    ]);
    assert.deepEqual([...HELP_QUICK_START_ORDER], [
      "qs-train-brain",
      "qs-visibility",
      "qs-audience",
      "qs-prospect",
    ]);
    assert.ok(getHelpTopic("concept-audience-vs-prospect"));
    assert.ok(getHelpTopic("howto-audience-vs-prospect"));
    assert.ok(getHelpTopic("ts-generation-failed"));
    assert.ok(getHelpTopic("ts-identity-changes"));
  });

  it("limits default-open behavior to Start here and Quick start", () => {
    assert.deepEqual([...HELP_DEFAULT_OPEN_SECTION_IDS], [
      "start",
      "quick-start",
    ]);
    for (const topic of HELP_CENTER_TOPICS) {
      if (topic.section === "start" || topic.section === "quick-start") {
        assert.equal(topic.defaultOpen, true, topic.id);
      } else {
        assert.equal(topic.defaultOpen, false, topic.id);
      }
    }
  });

  it("uses only current V2 primary routes as primary Help CTAs", () => {
    const primary = listPrimaryHelpCtas();
    assert.ok(primary.length > 0);
    for (const href of primary) {
      assert.ok(
        (HELP_PRIMARY_V2_HREFS as readonly string[]).includes(href),
        href,
      );
      assert.ok(!HELP_FORBIDDEN_PRIMARY_HREFS.some((forbidden) => href === forbidden || href.startsWith(`${forbidden}/`)));
    }
  });

  it("does not leak licensee, super, or V1 onboarding routes as primary CTAs", () => {
    const joined = listPrimaryHelpCtas().join("\n");
    assert.doesNotMatch(joined, /\/inbox\b/);
    assert.doesNotMatch(joined, /\/discussions\b/);
    assert.doesNotMatch(joined, /\/opportunities\b/);
    assert.doesNotMatch(joined, /\/briefings\b/);
    assert.doesNotMatch(joined, /\/licensee\b/);
    assert.doesNotMatch(joined, /\/super\b/);
    assert.doesNotMatch(joined, /\/intelligence-domains\b/);
  });

  it("keeps every catalog href as a safe internal V2 path", () => {
    for (const topic of HELP_CENTER_TOPICS) {
      for (const href of topic.hrefs) {
        assert.equal(isSafeHelpHref(href), true, `${topic.id} ${href}`);
        assert.match(href, HELP_SAFE_INTERNAL_HREF_PATTERN);
      }
    }
  });

  it("does not teach Inbox as a quick-start or outcome CTA", () => {
    const onboarding = [
      ...HELP_QUICK_START_ORDER,
      ...HELP_OUTCOME_ORDER,
    ].flatMap((id) => getHelpTopic(id)?.hrefs ?? []);
    assert.ok(!onboarding.includes("/inbox"));
    assert.ok(!onboarding.includes("/discussions"));
    assert.ok(!onboarding.includes("/opportunities"));
    assert.ok(!onboarding.includes("/briefings"));
  });
});

describe("help center locale parity", () => {
  it("keeps identical gettingStarted keys across six locales", () => {
    const canonical = collectKeyPaths(en.gettingStarted);
    assert.ok(canonical.includes("quickStart.steps.trainBrain.title"));
    assert.ok(canonical.includes("howTo.audienceVsProspect.title"));
    assert.ok(canonical.includes("troubleshoot.identityChanges.body"));
    assert.ok(canonical.includes("askAthenaCta"));
    assert.ok(canonical.includes("askAthenaHint"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language].gettingStarted);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra keys`,
      );
    }
  });

  it("resolves catalog topics against localized copy without empty titles", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const topics = resolveHelpTopics(DICTIONARIES[language].gettingStarted);
      assert.equal(topics.length, HELP_CENTER_TOPICS.length);
      for (const topic of topics) {
        assert.ok(topic.title.trim().length > 0, `${language} ${topic.id}`);
      }
    }
  });

  it("filters localized topics client-side", () => {
    const audienceHits = filterHelpTopics(en.gettingStarted, "Audience vs Prospect");
    assert.ok(audienceHits.some((topic) => topic.id === "howto-audience-vs-prospect"));
    assert.ok(audienceHits.some((topic) => topic.id === "concept-audience-vs-prospect"));
    assert.deepEqual(filterHelpTopics(en.gettingStarted, "zzzz-not-a-help-topic"), []);
  });
});

const AUTO_RETRAIN_BY_LANGUAGE: Record<string, RegExp> = {
  en: /retrains Athena Brain automatically/,
  fr: /réentraîne automatiquement Athena Brain/,
  es: /reentrena Athena Brain automáticamente/,
  de: /trainiert Athena Brain automatisch neu/,
  it: /riaddestra automaticamente Athena Brain/,
  pt: /retreina automaticamente o Athena Brain/,
};

const MANUAL_EDIT_RETRAIN_BY_LANGUAGE: Record<string, RegExp> = {
  en: /Editing Identity fields does not update Athena until you Train or Retrain/,
  fr: /Modifier les champs Identity n’actualise pas Athena tant que vous n’avez pas fait Train ou Retrain/,
  es: /Editar los campos de Identidad no actualiza a Athena hasta que elijas Entrenar o Reentrenar/,
  de: /Identity-Felder zu bearbeiten aktualisiert Athena erst, wenn Sie trainieren oder neu trainieren/,
  it: /Modificare i campi di Identità non aggiorna Athena finché non scegli Addestra o Riaddestra/,
  pt: /Editar campos da Identidade não atualiza a Athena até Treinar ou Retreinar/,
};

const FORBIDDEN_DEEP_SCRAPE_THEN_RETRAIN = [
  /After Identity Deep Scrape,\s*(the user should )?Retrain/,
  /After Deep Scrape,\s*Retrain so/,
  /Retrain again after Deep Scrape/,
  /Après un Deep Scrape Identity, faites Retrain/,
  /Après Deep Scrape, faites Retrain/,
  /Faites Retrain à nouveau après Deep Scrape/,
  /Después de Deep Scrape en Identidad, elige Reentrenar/,
  /Después de Deep Scrape, elige Reentrenar/,
  /Vuelve a Reentrenar después de Deep Scrape/,
  /Nach Identity Deep Scrape trainieren Sie neu/,
  /Nach Deep Scrape trainieren Sie neu/,
  /Nach Deep Scrape erneut neu trainieren/,
  /Dopo un Deep Scrape in Identità, Riaddestra/,
  /Dopo Deep Scrape, Riaddestra/,
  /Riaddestra di nuovo dopo Deep Scrape/,
  /Após o Deep Scrape da Identidade, retreine/,
  /Após o Deep Scrape, retreine/,
  /Retreine novamente após o Deep Scrape/,
];

describe("help center Deep Scrape vs Retrain contract", () => {
  it("requires Train/Retrain for Identity edits and auto-retrains after Deep Scrape", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language].gettingStarted;
      const serialized = JSON.stringify(copy);
      assert.match(
        copy.concepts.trainVsRetrain.body,
        MANUAL_EDIT_RETRAIN_BY_LANGUAGE[language],
        `${language} trainVsRetrain`,
      );
      assert.match(
        copy.concepts.deepScrape.body,
        AUTO_RETRAIN_BY_LANGUAGE[language],
        `${language} deepScrape`,
      );
      assert.match(
        copy.howTo.improveKnowledge.expect,
        AUTO_RETRAIN_BY_LANGUAGE[language],
        `${language} improveKnowledge.expect`,
      );
      for (const forbidden of FORBIDDEN_DEEP_SCRAPE_THEN_RETRAIN) {
        assert.doesNotMatch(serialized, forbidden, `${language} ${forbidden}`);
      }
    }
  });
});

describe("help center href safety", () => {
  it("rejects javascript, data, external, and control-plane hrefs", () => {
    assert.equal(isSafeHelpHref("javascript:alert(1)"), false);
    assert.equal(isSafeHelpHref("javascript:void(0)"), false);
    assert.equal(isSafeHelpHref("data:text/html,hi"), false);
    assert.equal(isSafeHelpHref("https://example.com"), false);
    assert.equal(isSafeHelpHref("http://evil.test/path"), false);
    assert.equal(isSafeHelpHref("/super"), false);
    assert.equal(isSafeHelpHref("/super/users"), false);
    assert.equal(isSafeHelpHref("/licensee"), false);
    assert.equal(isSafeHelpHref("/licensee/orgs"), false);
    assert.equal(isSafeHelpHref("/identity"), true);
    assert.equal(isSafeHelpHref("/"), true);
  });
});
