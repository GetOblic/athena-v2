/**
 * /personas/import presentation contracts.
 * Does not generate audiences, persist rows, or change API / i18n semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  PERSONA_CARD_ICON_WELL_CLASS,
  PERSONA_DETAIL_ICON,
  PERSONA_DETAIL_SURFACE,
  PERSONA_HEADER_PRIMARY_CLASS,
  PERSONA_HEADER_SECONDARY_CLASS,
  PERSONA_NESTED_CARD_CLASS,
} from "../../lib/personas/personaPagePresentation";
import {
  PERSONA_IMPORT_ADVANCED_ICON,
  PERSONA_IMPORT_ADVANCED_SURFACE,
  PERSONA_IMPORT_BACK_LINK_CLASS,
  PERSONA_IMPORT_CARD_ICON_WELL_CLASS,
  PERSONA_IMPORT_CSV_ICON,
  PERSONA_IMPORT_CSV_SURFACE,
  PERSONA_IMPORT_GENERATE_ICON,
  PERSONA_IMPORT_GENERATE_SURFACE,
  PERSONA_IMPORT_HEADER_ICON_WELL,
  PERSONA_IMPORT_MANUAL_ICON,
  PERSONA_IMPORT_MANUAL_SURFACE,
  PERSONA_IMPORT_NESTED_CARD_CLASS,
  PERSONA_IMPORT_PRIMARY_CLASS,
  PERSONA_IMPORT_SECONDARY_CLASS,
} from "../../lib/personas/personaImportPresentation";
import { PERSONA_FORM_FIELD_CLASS } from "../../components/personas/personaFormFields";
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

describe("/personas/import visual grammar", () => {
  it("uses muted V2 back treatment, UserPlus header well, and existing Traction chrome", () => {
    const page = read("app/personas/import/page.tsx");
    assert.match(page, /PERSONA_IMPORT_BACK_LINK_CLASS/);
    assert.match(page, /copy\.backToPersonas/);
    assert.match(page, /<UserPlus /);
    assert.match(page, /PERSONA_IMPORT_HEADER_ICON_WELL/);
    assert.match(page, /TractionPageHeader/);
    assert.match(page, /copy\.eyebrow/);
    assert.match(page, /copy\.import\.createTitle/);
    assert.match(page, /copy\.import\.subtitle/);
    assert.doesNotMatch(page, /ArrowLeft/);
    assert.doesNotMatch(page, /TractionSiblingNav/);
    assert.match(PERSONA_IMPORT_BACK_LINK_CLASS, /text-white\/45/);
    assert.doesNotMatch(PERSONA_IMPORT_BACK_LINK_CLASS, /text-\[var\(--athena-orange\)\]/);
    assert.equal(
      PERSONA_IMPORT_HEADER_ICON_WELL,
      `grid size-10 shrink-0 place-items-center rounded-2xl ${PERSONA_DETAIL_ICON.orange}`,
    );
  });

  it("aliases accepted persona tokens and stays out of the ads presentation domain", () => {
    const presentation = read("lib/personas/personaImportPresentation.ts");
    assert.equal(PERSONA_IMPORT_PRIMARY_CLASS, PERSONA_HEADER_PRIMARY_CLASS);
    assert.equal(PERSONA_IMPORT_SECONDARY_CLASS, PERSONA_HEADER_SECONDARY_CLASS);
    assert.equal(PERSONA_IMPORT_NESTED_CARD_CLASS, PERSONA_NESTED_CARD_CLASS);
    assert.equal(
      PERSONA_IMPORT_CARD_ICON_WELL_CLASS,
      PERSONA_CARD_ICON_WELL_CLASS,
    );
    assert.equal(PERSONA_IMPORT_GENERATE_SURFACE, PERSONA_DETAIL_SURFACE.orange);
    assert.equal(PERSONA_IMPORT_GENERATE_ICON, PERSONA_DETAIL_ICON.orange);
    assert.equal(PERSONA_IMPORT_MANUAL_SURFACE, PERSONA_DETAIL_SURFACE.violet);
    assert.equal(PERSONA_IMPORT_MANUAL_ICON, PERSONA_DETAIL_ICON.violet);
    assert.equal(PERSONA_IMPORT_CSV_SURFACE, PERSONA_DETAIL_SURFACE.cyan);
    assert.equal(PERSONA_IMPORT_CSV_ICON, PERSONA_DETAIL_ICON.cyan);
    assert.equal(PERSONA_IMPORT_ADVANCED_SURFACE, PERSONA_DETAIL_SURFACE.muted);
    assert.equal(PERSONA_IMPORT_ADVANCED_ICON, PERSONA_DETAIL_ICON.muted);
    assert.doesNotMatch(presentation, /@\/lib\/ads/);
    assert.doesNotMatch(presentation, /adCampaignCreatePresentation/);
    assert.doesNotMatch(presentation, /adCampaignDetailPresentation/);
    assert.match(PERSONA_FORM_FIELD_CLASS, /focus:border-\[rgba\(167,139,250/);
    assert.match(PERSONA_FORM_FIELD_CLASS, /focus:ring-2/);

    const pageTokens = read("lib/personas/personaPagePresentation.ts");
    assert.match(pageTokens, /export const PERSONA_DETAIL_SURFACE/);
    assert.doesNotMatch(
      pageTokens,
      /personaImportPresentation|PERSONA_IMPORT_/,
    );
  });

  it("keeps Suggest open by default with orange primary treatment and Sparkles", () => {
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    assert.match(generate, /title=\{copy\.generateTitle\}/);
    assert.match(generate, /panelId="persona-creation-generate"/);
    assert.match(generate, /defaultOpen/);
    assert.match(generate, /accent="orange"/);
    assert.match(generate, /<Sparkles /);
    assert.match(generate, /PERSONA_IMPORT_PRIMARY_CLASS/);
    assert.match(generate, /PERSONA_IMPORT_STATUS_CLASS/);
    assert.match(generate, /PERSONA_IMPORT_ERROR_CLASS/);
    assert.match(generate, /<AlertTriangle/);
    assert.doesNotMatch(generate, /expandedClassName="lg:max-w-6xl"/);
  });

  it("keeps Create it yourself collapsed with violet treatment and PenLine", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(forms, /title=\{copy\.manualTitle\}/);
    assert.match(forms, /panelId="persona-creation-manual"/);
    assert.match(forms, /expandedClassName="lg:max-w-6xl"/);
    assert.match(forms, /accent="violet"/);
    assert.match(forms, /<PenLine /);
    assert.doesNotMatch(forms, /defaultOpen=\{true\}/);
    assert.match(forms, /PERSONA_IMPORT_PRIMARY_CLASS/);
  });

  it("keeps Import from CSV collapsed with cyan treatment and a collapsed guide", () => {
    const csv = read("components/personas/PersonaCsvImport.tsx");
    assert.match(csv, /title=\{copy\.csvTitle\}/);
    assert.match(csv, /panelId="persona-creation-csv"/);
    assert.match(csv, /accent="cyan"/);
    assert.match(csv, /<FileSpreadsheet /);
    assert.match(csv, /title=\{copy\.guideTitle\}/);
    assert.match(csv, /defaultOpen=\{false\}/);
    assert.doesNotMatch(csv, /defaultOpen=\{true\}/);
    assert.match(csv, /PERSONA_IMPORT_SECONDARY_CLASS/);
    assert.match(csv, /PERSONA_IMPORT_PRIMARY_CLASS/);
    assert.match(csv, /PERSONA_IMPORT_NESTED_CARD_CLASS/);
    assert.match(csv, /PERSONA_IMPORT_SUCCESS_CLASS/);
    assert.match(csv, /text-\[var\(--athena-success\)\]/);
    assert.match(csv, /PERSONA_IMPORT_ERROR_CLASS/);
  });

  it("restyles PersonaCreationBlock in place and keeps children mounted", () => {
    const block = read("components/personas/PersonaCreationBlock.tsx");
    assert.match(block, /defaultOpen = false/);
    assert.match(block, /const \[open, setOpen\] = useState\(defaultOpen\)/);
    assert.match(
      block,
      /onClick=\{\(\) => setOpen\(\(previous\) => !previous\)\}/,
    );
    assert.match(block, /type="button"/);
    assert.match(block, /aria-expanded=\{open\}/);
    assert.match(block, /aria-controls=\{panelId\}/);
    assert.match(block, /id=\{panelId\}/);
    assert.match(block, /hidden=\{!open\}/);
    assert.match(block, /expandedClassName/);
    assert.match(block, /open \? expandedClassName/);
    assert.match(block, /<div id=\{panelId\} hidden=\{!open\}>[\s\S]*\{children\}/);
    assert.doesNotMatch(block, /\{open \?\s*\([\s\S]*\{children\}/);
    assert.doesNotMatch(block, /type="submit"/);
    assert.match(block, /<ChevronDown/);
    assert.doesNotMatch(block, /▲|▼/);
    assert.doesNotMatch(block, /AthenaCollapsibleSection/);
  });

  it("keeps advanced groups collapsed with intelligence tone and SlidersHorizontal", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    for (const source of [forms, generate]) {
      assert.match(source, /tone="intelligence"/);
      assert.match(source, /<SlidersHorizontal /);
      assert.match(source, /defaultOpen=\{false\}/);
      assert.match(source, /PERSONA_IMPORT_ADVANCED_SURFACE/);
      assert.match(source, /PERSONA_IMPORT_ADVANCED_ICON/);
    }
    assert.match(PERSONA_IMPORT_ADVANCED_SURFACE, /167,139,250/);
    assert.match(PERSONA_IMPORT_ADVANCED_ICON, /167,139,250/);
  });

  it("preserves import APIs, generated source, CSV FormData, and block order", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    const csv = read("components/personas/PersonaCsvImport.tsx");
    const generateIndex = forms.indexOf("<PersonaGenerateForm");
    const manualIndex = forms.indexOf("persona-creation-manual");
    const csvIndex = forms.indexOf("<PersonaCsvImport");
    assert.ok(generateIndex > 0 && generateIndex < manualIndex);
    assert.ok(manualIndex > 0 && manualIndex < csvIndex);
    assert.match(generate, /fetch\("\/api\/personas\/generate"/);
    assert.match(generate, /fetch\("\/api\/personas"/);
    assert.match(
      generate,
      /body: JSON\.stringify\(\{\s*\.\.\.candidate,\s*source: "generated",\s*\}\)/,
    );
    assert.doesNotMatch(forms, /source:\s*"generated"/);
    assert.match(forms, /body: JSON\.stringify\(manual\)/);
    assert.match(csv, /form\.append\("file", csvFile\)/);
    assert.match(csv, /fetch\("\/api\/personas\/import\/preview"/);
    assert.match(csv, /fetch\("\/api\/personas\/import"/);
    assert.match(csv, /href="\/templates\/athena-persona-import-template\.csv"/);
    assert.match(csv, /preview\.importableRows <= 0/);
  });

  it("does not change i18n dictionaries or import ads presentation modules", () => {
    const surfaces = [
      "app/personas/import/page.tsx",
      "components/personas/PersonaCreationBlock.tsx",
      "components/personas/PersonaImportForms.tsx",
      "components/personas/PersonaGenerateForm.tsx",
      "components/personas/PersonaCsvImport.tsx",
      "lib/personas/personaImportPresentation.ts",
    ];
    for (const file of surfaces) {
      const source = read(file);
      assert.doesNotMatch(source, /@\/lib\/ads/);
      assert.doesNotMatch(source, /adCampaignCreatePresentation/);
    }
    const canonical = collectKeyPaths(en.personas.import);
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.deepEqual(
        collectKeyPaths(DICTIONARIES[language].personas.import),
        canonical,
        `${language} personas.import`,
      );
    }
    assert.equal(en.personas.import.generateTitle, "Suggest an audience");
    assert.equal(en.personas.import.manualTitle, "Create it yourself");
    assert.equal(en.personas.import.csvTitle, "Import from CSV");
  });
});
