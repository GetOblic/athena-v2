/**
 * Prospect detail — GetOblic Description card.
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProspectGetoblicDescriptionCard } from "../../components/prospects/ProspectGetoblicDescriptionCard";
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

const I18N_KEYS = [
  "title",
  "help",
  "empty",
  "generate",
  "generating",
  "refresh",
  "ready",
  "copy",
  "copied",
  "failed",
  "currentListingCopy",
  "generatedDescription",
] as const;

describe("GetOblic Description UI", () => {
  it("places the card after website intelligence and before commercial detail", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const presentation = read("lib/prospects/prospectDetailPresentation.ts");
    const websiteIndex = page.indexOf("{websiteResearch}");
    const cardIndex = page.indexOf("{getoblicDescription}");
    const profileIndex = page.indexOf("{profileEditor}");
    assert.ok(websiteIndex > 0);
    assert.ok(cardIndex > websiteIndex);
    assert.ok(profileIndex > cardIndex);
    assert.match(page, /ProspectGetoblicDescriptionCard/);
    assert.match(page, /afterProspectRecommendation/);
    assert.match(presentation, /getoblic-description/);
    const order = presentation.match(
      /PROSPECT_DETAIL_SECTION_ORDER = \[([\s\S]*?)\]/,
    )?.[1];
    assert.ok(order);
    assert.ok(
      order.indexOf("website-intelligence") < order.indexOf("getoblic-description"),
    );
    assert.ok(order.indexOf("getoblic-description") < order.indexOf("commercial"));
  });

  it("is collapsed by default with FileText treatment and no write-back actions", () => {
    const empty = renderToStaticMarkup(
      createElement(ProspectGetoblicDescriptionCard, {
        prospectId: "p1",
        currentListingCopy: "Imported GetOblic listing copy.",
        generatedListingDescription: null,
        messages: en.prospects.getoblicDescription,
      }),
    );
    assert.match(empty, /GetOblic Description/);
    assert.match(empty, /A directory description created from Athena&#x27;s stored Website Intelligence/);
    assert.match(empty, /The current GetOblic listing description is shown for comparison only/);
    assert.match(empty, /aria-expanded="false"/);
    assert.match(empty, /Not generated/);
    assert.match(empty, /lucide-file-text/);
    assert.doesNotMatch(empty, /Current listing copy/);
    assert.doesNotMatch(empty, /Apply to GetOblic|Publish|Sync/);
    assert.doesNotMatch(empty, /Opportunity Score/);

    const source = read("components/prospects/ProspectGetoblicDescriptionCard.tsx");
    assert.match(source, /FileText/);
    assert.match(source, /defaultOpen = false/);
    assert.match(source, /defaultOpen=\{defaultOpen\}/);
    assert.match(source, /PROSPECT_GETOBLIC_DESCRIPTION_SURFACE/);
    assert.match(source, /PROSPECT_PRIMARY_ACTION/);
    assert.match(source, /Sparkles/);
    assert.match(source, /messages\.currentListingCopy/);
    assert.match(source, /messages\.generate/);
    assert.match(source, /variant="utility"/);
    assert.match(source, /showContinue=\{false\}/);
    assert.doesNotMatch(source, /Apply to GetOblic|Publish|Sync/);
    assert.doesNotMatch(source, /opportunity_score|Opportunity Score/);
  });

  it("shows generated copy with Copy and Refresh, and keeps imported copy read-only", () => {
    const html = renderToStaticMarkup(
      createElement(ProspectGetoblicDescriptionCard, {
        prospectId: "p1",
        currentListingCopy: "Imported GetOblic listing copy.",
        generatedListingDescription: {
          description: "Acme Clinic provides neighborhood primary care in Dallas.",
          generatedAt: "2026-09-10T12:00:00.000Z",
        },
        messages: en.prospects.getoblicDescription,
        defaultOpen: true,
      }),
    );
    assert.match(html, /GetOblic Description/);
    assert.match(html, /A directory description created from Athena&#x27;s stored Website Intelligence/);
    assert.match(html, /The current GetOblic listing description is shown for comparison only/);
    assert.match(html, /Current GetOblic listing description/);
    assert.match(html, /Imported GetOblic listing copy/);
    assert.match(html, /Athena-generated GetOblic description/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, />Ready</);
    assert.doesNotMatch(html, /Current listing copy/);
    assert.doesNotMatch(html, /Generated GetOblic Description/);
    assert.doesNotMatch(html, /Not generated/);
    assert.doesNotMatch(html, /Apply to GetOblic|Publish|Sync/);

    const source = read("components/prospects/ProspectGetoblicDescriptionCard.tsx");
    assert.match(source, /messages\.generatedDescription/);
    assert.match(source, /messages\.refresh/);
    assert.match(source, /CopyButton/);
    assert.match(source, /hasGenerated \? \(/);
    assert.match(source, /text=\{generated!\.description\}/);
    assert.doesNotMatch(source, /Apply to GetOblic|Publish|Sync/);
  });

  it("keeps required GetOblic Description strings in all six locales", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const block = DICTIONARIES[language].prospects.getoblicDescription;
      for (const key of I18N_KEYS) {
        assert.equal(typeof block[key], "string", `${language}.${key}`);
        assert.ok(block[key].trim(), `${language}.${key} empty`);
      }
      assert.match(block.title, /GetOblic/);
      assert.match(block.currentListingCopy, /GetOblic/);
      assert.match(block.generatedDescription, /GetOblic/);
      assert.match(
        block.help,
        /Website Intelligence|Website-Intelligence|intelligence de site|inteligencia web|intelligence del sito|inteligência de sítio/i,
        `${language}.help should name stored Website Intelligence`,
      );
      assert.match(
        block.help,
        /comparison only|uniquement à titre de comparaison|solo para comparación|solo per confronto|nur zum Vergleich|apenas para comparação/i,
        `${language}.help should keep the listing display-only`,
      );
      assert.doesNotMatch(
        block.help,
        /verified business and website intelligence|intelligence vérifiée de l’entreprise|inteligencia verificada del negocio|intelligence verificata dell’azienda|geprüfter Geschäfts- und Website|inteligência verificada do negócio/i,
      );
      assert.match(
        block.generatedDescription,
        /Athena/,
        `${language}.generatedDescription should name Athena`,
      );
    }
    assert.match(
      en.prospects.getoblicDescription.help,
      /created from Athena's stored Website Intelligence/i,
    );
    assert.match(
      en.prospects.getoblicDescription.empty,
      /Website Intelligence Athena has already gathered/i,
    );
    assert.equal(
      en.prospects.getoblicDescription.currentListingCopy,
      "Current GetOblic listing description",
    );
    assert.equal(
      en.prospects.getoblicDescription.generatedDescription,
      "Athena-generated GetOblic description",
    );
    for (const language of ORGANIZATION_LANGUAGES.filter((code) => code !== "en")) {
      assert.notEqual(
        DICTIONARIES[language].prospects.getoblicDescription.empty,
        en.prospects.getoblicDescription.empty,
        `${language}.empty`,
      );
    }
  });
});
