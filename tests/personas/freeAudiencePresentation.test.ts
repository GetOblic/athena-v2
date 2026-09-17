import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  deriveFreeAudiencePresentation,
  shouldShowPersonaAddObservation,
  shouldShowPersonaCreate,
  shouldShowPersonaCreateWorkflows,
  shouldShowPersonaCsvImport,
  shouldShowPersonaCsvLocked,
  shouldShowPersonaDeepScrape,
  shouldShowPersonaGenerateAgain,
  shouldShowPersonaManual,
  shouldShowPersonaRefreshIntelligence,
  shouldShowPersonaSuggest,
  shouldShowPersonaThinkDifferently,
  shouldShowProspectCreateAudience,
} from "../../lib/personas/freeAudiencePresentation";
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

describe("FREE-13 Audience presentation", () => {
  it("keeps Full UI on the current create + suggest + manual + CSV contract", () => {
    const presentation = deriveFreeAudiencePresentation({
      athenaPlan: "full",
      defineKind: "ready",
    });
    assert.equal(presentation, "full");
    assert.equal(shouldShowPersonaCreate(presentation), true);
    assert.equal(shouldShowPersonaSuggest(presentation), true);
    assert.equal(shouldShowPersonaManual(presentation), true);
    assert.equal(shouldShowPersonaCsvImport(presentation), true);
    assert.equal(shouldShowPersonaCsvLocked(presentation), false);
    assert.equal(shouldShowPersonaGenerateAgain(presentation), true);
    assert.equal(shouldShowPersonaRefreshIntelligence(presentation), true);
    assert.equal(shouldShowPersonaThinkDifferently(presentation), true);
    assert.equal(shouldShowPersonaDeepScrape(presentation), true);
    assert.equal(shouldShowPersonaAddObservation(presentation), true);
    assert.equal(shouldShowProspectCreateAudience(presentation), true);
  });

  it("shows Create audience, Suggest, and manual for trained available Free", () => {
    const presentation = deriveFreeAudiencePresentation({
      athenaPlan: "free",
      defineKind: "ready",
      audienceStatus: "available",
    });
    assert.equal(presentation, "available");
    assert.equal(shouldShowPersonaCreate(presentation), true);
    assert.equal(shouldShowPersonaSuggest(presentation), true);
    assert.equal(shouldShowPersonaManual(presentation), true);
    assert.equal(shouldShowPersonaCsvImport(presentation), false);
    assert.equal(shouldShowPersonaCsvLocked(presentation), true);
    assert.equal(shouldShowPersonaGenerateAgain(presentation), false);
    assert.equal(shouldShowPersonaRefreshIntelligence(presentation), false);
    assert.equal(shouldShowPersonaThinkDifferently(presentation), false);
    assert.equal(shouldShowPersonaDeepScrape(presentation), false);
    assert.equal(shouldShowPersonaAddObservation(presentation), false);
    assert.equal(shouldShowPersonaCreateWorkflows(presentation), true);
  });

  it("hides Create audience and creation workflows when reserved or consumed", () => {
    const reserved = deriveFreeAudiencePresentation({
      athenaPlan: "free",
      defineKind: "ready",
      audienceStatus: "reserved",
    });
    const consumed = deriveFreeAudiencePresentation({
      athenaPlan: "free",
      defineKind: "ready",
      audienceStatus: "consumed",
      hasPersona: true,
    });
    assert.equal(reserved, "reserved");
    assert.equal(consumed, "consumed");
    assert.equal(shouldShowPersonaCreate(reserved), false);
    assert.equal(shouldShowPersonaCreate(consumed), false);
    assert.equal(shouldShowPersonaCreateWorkflows(reserved), false);
    assert.equal(shouldShowPersonaCreateWorkflows(consumed), false);
    assert.equal(shouldShowPersonaSuggest(consumed), false);
    assert.equal(shouldShowPersonaManual(consumed), false);
    assert.equal(shouldShowPersonaCsvImport(consumed), false);
    assert.equal(shouldShowPersonaCsvLocked(reserved), false);
    assert.equal(shouldShowPersonaCsvLocked(consumed), false);
    assert.equal(shouldShowProspectCreateAudience(consumed), false);
    assert.equal(shouldShowPersonaRefreshIntelligence(consumed), false);
    assert.equal(shouldShowPersonaThinkDifferently(consumed), false);
    assert.equal(shouldShowPersonaDeepScrape(consumed), false);
    assert.equal(shouldShowPersonaAddObservation(consumed), false);
  });

  it("wires consumed /personas/[id] from plan + FREE-13 authority, not persona count", () => {
    const page = read("app/personas/[id]/page.tsx");
    const header = read("components/personas/PersonaDetailHeader.tsx");
    const generate = read(
      "components/personas/PersonaGenerateIntelligenceButton.tsx",
    );
    assert.match(page, /loadFreeAudiencePageState/);
    assert.match(page, /deriveFreeAudiencePresentation/);
    assert.match(page, /audienceStatus: audience.status/);
    assert.match(page, /boundPersonaId: audience.personaId/);
    assert.doesNotMatch(page, /hasPersona|personas\.length|personaCount/);
    assert.match(page, /shouldShowPersonaRefreshIntelligence/);
    assert.match(page, /shouldShowPersonaThinkDifferently/);
    assert.match(page, /shouldShowPersonaDeepScrape/);
    assert.match(page, /shouldShowPersonaAddObservation/);
    assert.match(page, /allowRefresh=\{allowRefresh\}/);
    assert.match(page, /allowThinkDifferently=\{allowThinkDifferently\}/);
    assert.match(page, /showObservation=\{allowObservation\}/);
    assert.match(page, /allowDeepScrape \?/);
    assert.match(page, /copy\.free\.completedNote/);
    assert.match(page, /PersonaConversationPanel/);
    assert.match(page, /PersonaMetadataEditor/);
    assert.match(page, /PersonaLifecycleStatusControl/);
    assert.match(page, /PersonaHeaderDeleteButton/);
    assert.match(page, /href=\{`\/ads\/new\?personaId=\$\{persona\.id\}`\}/);
    assert.match(page, /href=\{`\/social-planner\?personaId=\$\{persona\.id\}`\}/);
    assert.doesNotMatch(page, /shouldShowAdsCreate|shouldShowFreeStarter/);
    assert.doesNotMatch(page, /paywall|1\/1|quota/i);
    assert.doesNotMatch(page, /UpgradeCompletionCard|audienceUpgradeContent/);
    assert.match(header, /showObservation/);
    assert.match(generate, /allowRefresh/);
    assert.match(generate, /allowThinkDifferently/);
  });

  it("wires /personas and /personas/import from persisted presentation", () => {
    const landing = read("app/personas/page.tsx");
    const importPage = read("app/personas/import/page.tsx");
    const forms = read("components/personas/PersonaImportForms.tsx");
    const csv = read("components/personas/PersonaCsvImport.tsx");
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    assert.match(landing, /shouldShowPersonaCreate/);
    assert.match(landing, /copy\.list\.createCta/);
    assert.match(landing, /copy\.free\.completedNote/);
    assert.match(importPage, /loadFreeAudiencePageState/);
    assert.match(importPage, /presentation === "consumed"/);
    assert.match(importPage, /PersonaImportForms/);
    assert.match(forms, /shouldShowPersonaSuggest/);
    assert.match(forms, /shouldShowPersonaManual/);
    assert.match(forms, /shouldShowPersonaCsvImport/);
    assert.match(forms, /shouldShowPersonaCsvLocked/);
    assert.match(csv, /csvUnavailable/);
    assert.match(csv, /personaCsvUpgradeContent/);
    assert.match(csv, /UpgradeHint/);
    assert.match(csv, /available\?: boolean/);
    assert.match(forms, /available=\{showCsv\}/);
    assert.match(generate, /allowGenerateAgain/);
    assert.doesNotMatch(landing, /paywall|1\/1/i);
    assert.doesNotMatch(importPage, /paywall|1\/1/i);
    assert.match(landing, /shouldShowFreeAudienceContinuation/);
    assert.match(importPage, /shouldShowFreeAudienceContinuation/);
  });

  it("renders the consumed audience sentence once on /personas/import", () => {
    const importPage = read("app/personas/import/page.tsx");
    const completedNoteHits =
      importPage.match(/copy\.free\.completedNote/g) ?? [];
    assert.equal(completedNoteHits.length, 1);
    assert.match(importPage, /title=\{copy\.import\.createTitle\}/);
    assert.doesNotMatch(
      importPage,
      /subtitle=\{\s*presentation === "consumed"[\s\S]*copy\.free\.completedNote/,
    );

    const consumedBlock = importPage.slice(
      importPage.indexOf(
        'presentation === "consumed" || presentation === "reserved"',
      ),
    );
    assert.match(consumedBlock, /copy\.free\.completedNote/);
    assert.match(consumedBlock, /copy\.free\.openAudience/);
    assert.match(consumedBlock, /shouldShowFreeAudienceContinuation/);
    assert.match(consumedBlock, /UpgradeCompletionCard/);
  });

  it("renders the reserved audience sentence once on /personas/import", () => {
    const importPage = read("app/personas/import/page.tsx");
    const reservedNoteHits = importPage.match(/copy\.free\.reservedNote/g) ?? [];
    assert.equal(reservedNoteHits.length, 1);
    assert.match(importPage, /subtitle=\{copy\.import\.subtitle\}/);
    assert.doesNotMatch(
      importPage,
      /subtitle=\{\s*presentation === "reserved"/,
    );
  });

  it("adds Free Audience copy to all six locales without pricing", () => {
    const required = [
      "personas.free.availableContext",
      "personas.free.reservedNote",
      "personas.free.completedNote",
      "personas.free.csvUnavailable",
      "personas.free.csvLocked.headline",
      "personas.free.csvLocked.capability1",
      "personas.free.csvLocked.capability2",
      "personas.free.openAudience",
    ];
    const canonical = collectKeyPaths(en);
    for (const path of required) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      const paths = collectKeyPaths(dictionary);
      assert.deepEqual(
        required.filter((path) => !paths.includes(path)),
        [],
        `${language} missing Free Audience keys`,
      );
      const blob = JSON.stringify(dictionary.personas.free);
      assert.doesNotMatch(blob, /upgrade|paywall|1\/1|€|\$|price/i);
    }
    assert.notEqual(
      fr.personas.free.availableContext,
      en.personas.free.availableContext,
    );
    assert.notEqual(
      de.personas.free.completedNote,
      en.personas.free.completedNote,
    );
    assert.notEqual(es.personas.free.reservedNote, en.personas.free.reservedNote);
    assert.notEqual(
      itMessages.personas.free.openAudience,
      en.personas.free.openAudience,
    );
    assert.notEqual(pt.personas.free.csvUnavailable, en.personas.free.csvUnavailable);
    assert.equal(en.personas.free.csvUnavailable, "Available with Full Athena");
  });
});
