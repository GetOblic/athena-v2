/**
 * FREE-15E — contextual Full Athena presentation for secondary
 * Full-only / locked methods. Presentation only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { PersonaCsvImport } from "../../components/personas/PersonaCsvImport";
import { UpgradeHint } from "../../components/upgrade/UpgradeHint";
import {
  shouldShowPersonaCsvImport,
  shouldShowPersonaCsvLocked,
  shouldShowPersonaManual,
  shouldShowPersonaSuggest,
} from "../../lib/personas/freeAudiencePresentation";
import {
  shouldShowProspectCreate,
  shouldShowProspectCsvImport,
  shouldShowProspectCsvLocked,
} from "../../lib/prospects/freeConvertPresentation";
import {
  shouldShowFreeVisibilityContinuation,
  shouldShowSeoNewAnalysis,
  shouldShowSeoTechnicalLocked,
  shouldShowSeoTechnicalOption,
} from "../../lib/seo/freeVisibilityPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  audienceUpgradeContent,
  getoblicDirectoryUpgradeContent,
  visibilityUpgradeContent,
} from "../../lib/upgrade/freeFeatureUpgradePresentation";
import {
  personaCsvUpgradeContent,
  prospectCsvUpgradeContent,
  technicalSeoUpgradeContent,
} from "../../lib/upgrade/freeSecondaryUpgradePresentation";
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

const FORBIDDEN_COPY =
  /pricing|trial|unlimited|unlock everything|all features|checkout|billing|paywall|subscribe|buy now|save %/i;

const UNSUPPORTED_CLAIMS =
  /Search Console|Google Analytics|Semrush|Ahrefs|PageSpeed|Core Web Vitals|CRM|automatic outreach|synchroniz/i;

const LOCKED_KEY_PATHS = [
  "seo.free.technicalLocked.headline",
  "seo.free.technicalLocked.capability1",
  "seo.free.technicalLocked.capability2",
  "personas.free.csvLocked.headline",
  "personas.free.csvLocked.capability1",
  "personas.free.csvLocked.capability2",
  "prospects.free.csvUnavailable",
  "prospects.free.csvLocked.headline",
  "prospects.free.csvLocked.capability1",
  "prospects.free.csvLocked.capability2",
] as const;

const TECHNICAL = technicalSeoUpgradeContent({
  locked: en.seo.free.technicalLocked,
  upgrade: en.upgrade,
});

const PERSONA_CSV = personaCsvUpgradeContent({
  locked: en.personas.free.csvLocked,
  upgrade: en.upgrade,
  availabilityLabel: en.personas.free.csvUnavailable,
});

const PROSPECT_CSV = prospectCsvUpgradeContent({
  locked: en.prospects.free.csvLocked,
  upgrade: en.upgrade,
  availabilityLabel: en.prospects.free.csvUnavailable,
});

function assertNonInteractiveHint(html: string, feature: string) {
  assert.match(html, new RegExp(`data-upgrade-feature="${feature}"`));
  assert.match(html, /data-upgrade-variant="hint"/);
  assert.match(html, /role="note"/);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /<a /);
  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /tabIndex/);
  assert.doesNotMatch(html, /data-upgrade-cta-kind="href"/);
  assert.doesNotMatch(html, /data-upgrade-cta-kind="handler"/);
  assert.doesNotMatch(html, /\/pricing|\/checkout|\/billing/);
}

describe("FREE-15E secondary locked capability inventory", () => {
  it("maps each implemented treatment to a verified Full capability", () => {
    assert.equal(TECHNICAL.feature, "technicalSeo");
    assert.equal(PERSONA_CSV.feature, "personaCsv");
    assert.equal(PROSPECT_CSV.feature, "prospectCsv");

    const technicalPipeline = read(
      "services/seo/seoTechnicalGenerationPipeline.ts",
    );
    const technicalTypes = read("services/seo/seoReportTypes.ts");
    const personaCsv = read("services/personas/personaCsv.ts");
    const prospectCsv = read("services/prospects/prospectCsv.ts");
    const personaImport = read("app/api/personas/import/route.ts");
    const prospectImport = read("app/api/prospects/import/route.ts");

    assert.match(technicalPipeline, /generationType === "technical"|generationType=technical/);
    assert.match(technicalTypes, /actionPlan/);
    assert.match(technicalTypes, /SEO_TECHNICAL_REPORT_DISCLAIMER/);
    assert.match(personaCsv, /PERSONA_CSV|parsePersonaCsv|personaCsv/);
    assert.match(personaImport, /CSV|personaCsv|import/);
    assert.match(prospectCsv, /PROSPECT_CSV|parseProspectCsv|prospectCsv/);
    assert.match(prospectImport, /CSV|prospectCsv|import/);

    assert.match(TECHNICAL.headline, /Website Technical Health/);
    assert.match(TECHNICAL.capabilities[0].label, /Website Intelligence/);
    assert.match(TECHNICAL.capabilities[1].label, /Technical SEO/);
    assert.match(PERSONA_CSV.headline, /CSV/);
    assert.match(PERSONA_CSV.capabilities[0].label, /audience/);
    assert.match(PROSPECT_CSV.headline, /CSV/);
    assert.match(PROSPECT_CSV.capabilities[0].label, /business row/);
  });

  it("does not invent unsupported capability claims", () => {
    for (const content of [TECHNICAL, PERSONA_CSV, PROSPECT_CSV]) {
      const blob = JSON.stringify(content);
      assert.doesNotMatch(blob, FORBIDDEN_COPY);
      assert.doesNotMatch(blob, UNSUPPORTED_CLAIMS);
    }
  });
});

describe("FREE-15E Technical SEO", () => {
  it("keeps Technical SEO Full-only and contextual on Free create", () => {
    assert.equal(shouldShowSeoTechnicalOption("full"), true);
    assert.equal(shouldShowSeoTechnicalLocked("full"), false);
    assert.equal(shouldShowSeoTechnicalOption("available"), false);
    assert.equal(shouldShowSeoTechnicalLocked("available"), true);
    assert.equal(shouldShowSeoTechnicalLocked("consumed"), false);
    assert.equal(shouldShowSeoTechnicalLocked("processing"), false);
    assert.equal(shouldShowSeoNewAnalysis("available"), true);
    assert.equal(shouldShowFreeVisibilityContinuation("available"), false);

    const html = renderToStaticMarkup(createElement(UpgradeHint, TECHNICAL));
    assert.match(html, /data-upgrade-feature="technicalSeo"/);
    assert.match(html, /data-upgrade-accent="visibility"/);
    assert.match(html, /Analyze Website Technical Health with Full Athena/);
    assert.match(html, /titles, descriptions, headings, canonicals/);
    assert.match(html, /evidence-backed Technical SEO evaluation/);
    assert.doesNotMatch(html, /Search Console|Semrush|Ahrefs|PageSpeed/);
    assertNonInteractiveHint(html, "technicalSeo");

    const form = read("components/seo/SeoReportGenerateForm.tsx");
    const create = read("app/seo/new/page.tsx");
    assert.match(form, /allowTechnical \? \(/);
    assert.match(form, /technicalSeoUpgradeContent/);
    assert.match(form, /UpgradeHint/);
    assert.match(form, /data-seo-generation-available="false"/);
    assert.match(form, /value="intelligence"/);
    assert.match(form, /value="technical"/);
    assert.match(form, /copy\.startAnalysis/);
    assert.match(create, /allowTechnical=\{shouldShowSeoTechnicalOption/);
    assert.match(
      form,
      /generationType === "technical" &&[\s\S]*\(!technicalSelectable \|\| !allowTechnical\)/,
    );
  });

  it("does not alter the frozen Visibility Strategy continuation", () => {
    const continuation = visibilityUpgradeContent({
      continuation: en.seo.free.continuation,
      upgrade: en.upgrade,
    });
    assert.equal(continuation.feature, "visibility");
    assert.doesNotMatch(
      JSON.stringify(continuation),
      /Technical SEO|Website Technical Health/,
    );
    assert.equal(shouldShowFreeVisibilityContinuation("consumed"), true);

    const landing = read("app/seo/page.tsx");
    const detail = read("app/seo/[id]/page.tsx");
    const create = read("app/seo/new/page.tsx");
    assert.match(landing, /visibilityUpgradeContent/);
    assert.match(landing, /shouldShowFreeVisibilityContinuation\(presentation\)/);
    assert.doesNotMatch(landing, /technicalSeoUpgradeContent|UpgradeHint/);
    assert.doesNotMatch(detail, /technicalSeoUpgradeContent|UpgradeHint/);
    assert.doesNotMatch(create, /UpgradeCompletionCard|visibilityUpgradeContent/);
  });
});

describe("FREE-15E Persona CSV", () => {
  it("keeps CSV unavailable to Free and does not mount the upload workflow", () => {
    assert.equal(shouldShowPersonaCsvImport("full"), true);
    assert.equal(shouldShowPersonaCsvLocked("full"), false);
    assert.equal(shouldShowPersonaCsvImport("available"), false);
    assert.equal(shouldShowPersonaCsvLocked("available"), true);
    assert.equal(shouldShowPersonaSuggest("available"), true);
    assert.equal(shouldShowPersonaManual("available"), true);
    assert.equal(shouldShowPersonaCsvLocked("consumed"), false);

    const locked = renderToStaticMarkup(
      createElement(PersonaCsvImport, {
        messages: en,
        available: false,
      }),
    );
    assert.match(locked, /data-upgrade-feature="personaCsv"/);
    assert.match(locked, /Import audience data from a CSV/);
    assert.match(locked, /preview how each audience row will be read/);
    assert.match(locked, /create those audiences in Athena/);
    assert.match(locked, /Available with Full Athena/);
    assert.doesNotMatch(locked, /type="file"/);
    assert.doesNotMatch(locked, /\/api\/personas\/import/);
    assert.doesNotMatch(locked, /athena-persona-import-template/);
    assert.match(locked, /data-upgrade-variant="hint"/);
    assert.doesNotMatch(locked, /href=/);
    assert.doesNotMatch(locked, /data-upgrade-cta-kind="href"/);
    assert.doesNotMatch(locked, /data-upgrade-cta-kind="handler"/);
    assertNonInteractiveHint(
      renderToStaticMarkup(createElement(UpgradeHint, PERSONA_CSV)),
      "personaCsv",
    );

    const full = renderToStaticMarkup(
      createElement(PersonaCsvImport, {
        messages: en,
        available: true,
      }),
    );
    assert.doesNotMatch(full, /data-upgrade-feature="personaCsv"/);
    assert.match(full, /type="file"/);
    assert.match(full, /accept="\.csv,text\/csv"/);
    const csvSource = read("components/personas/PersonaCsvImport.tsx");
    assert.match(csvSource, /\/api\/personas\/import\/preview/);
    assert.match(csvSource, /!available \? \([\s\S]*UpgradeHint/);

    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(forms, /shouldShowPersonaSuggest\(presentation\)/);
    assert.match(forms, /shouldShowPersonaManual\(presentation\)/);
    assert.match(forms, /shouldShowPersonaCsvLocked\(presentation\)/);
    assert.match(forms, /available=\{showCsv\}/);
    assert.match(forms, /showCsv \|\| showCsvLocked/);
  });
});

describe("FREE-15E Prospect CSV", () => {
  it("keeps CSV unavailable according to existing authority and explains the import workflow", () => {
    assert.equal(shouldShowProspectCsvImport("full"), true);
    assert.equal(shouldShowProspectCsvLocked("full"), false);
    assert.equal(shouldShowProspectCsvImport("available"), false);
    assert.equal(shouldShowProspectCsvLocked("available"), true);
    assert.equal(shouldShowProspectCreate("available"), true);
    assert.equal(shouldShowProspectCsvLocked("consumed"), false);

    const html = renderToStaticMarkup(createElement(UpgradeHint, PROSPECT_CSV));
    assert.match(html, /Import prospects from a CSV/);
    assert.match(html, /preview how each business row will be read/);
    assert.match(html, /add those prospects to Athena/);
    assert.doesNotMatch(html, /CRM|automatic outreach|synchroniz/i);
    assertNonInteractiveHint(html, "prospectCsv");

    const forms = read("components/prospects/ProspectImportForms.tsx");
    const page = read("app/prospects/import/page.tsx");
    assert.match(forms, /copy\.manualTitle/);
    assert.match(forms, /copy\.importCta/);
    assert.match(forms, /showCsvImport \? \(/);
    assert.match(forms, /showCsvLocked \? \(/);
    assert.match(forms, /prospectCsvUpgradeContent/);
    assert.match(forms, /UpgradeHint/);
    assert.match(forms, /<ProspectCsvImport messages=\{messages\} \/>/);
    assert.match(page, /shouldShowProspectCsvImport\(presentation\)/);
    assert.match(page, /shouldShowProspectCsvLocked\(presentation\)/);

    const lockedBranch = forms.slice(forms.indexOf("showCsvLocked ? ("));
    assert.match(lockedBranch, /UpgradeHint/);
    assert.doesNotMatch(lockedBranch, /<ProspectCsvImport/);
    assert.doesNotMatch(lockedBranch, /type="file"/);

    const convertAuthority = read("lib/organization/freeConvertGeneration.ts");
    assert.match(convertAuthority, /FREE_CONVERT_IMPORT_DENIED/);
    assert.doesNotMatch(
      convertAuthority,
      /UpgradeHint|freeSecondaryUpgradePresentation/,
    );
  });
});

describe("FREE-15E GetOblic and duplication control", () => {
  it("does not duplicate the accepted FREE-15D GetOblic Directory treatment", () => {
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const importForms = read("components/prospects/ProspectImportForms.tsx");
    const importPage = read("app/prospects/import/page.tsx");
    const find = read("app/prospects/find/page.tsx");

    assert.equal(
      (methods.match(/getoblicDirectoryUpgradeContent\(/g) ?? []).length,
      1,
    );
    assert.equal((methods.match(/<UpgradeUnavailableCard/g) ?? []).length, 1);
    assert.doesNotMatch(
      importForms,
      /getoblicDirectoryUpgradeContent|UpgradeUnavailableCard/,
    );
    assert.doesNotMatch(
      importPage,
      /getoblicDirectoryUpgradeContent|UpgradeUnavailableCard/,
    );
    assert.doesNotMatch(find, /prospectCsvUpgradeContent|technicalSeoUpgradeContent/);
    assert.match(methods, /googleAvailable \? \(/);
    assert.match(methods, /data-discovery-source="directory"/);
    assert.match(methods, /data-discovery-available="false"/);
  });

  it("does not stack secondary treatments onto consumed primary continuation cards", () => {
    const personasImport = read("app/personas/import/page.tsx");
    const seoLanding = read("app/seo/page.tsx");
    const seoDetail = read("app/seo/[id]/page.tsx");
    const prospectsLanding = read("app/prospects/page.tsx");

    assert.match(personasImport, /shouldShowFreeAudienceContinuation/);
    assert.match(personasImport, /UpgradeCompletionCard/);
    assert.doesNotMatch(personasImport, /personaCsvUpgradeContent|UpgradeHint/);
    assert.match(seoLanding, /visibilityUpgradeContent/);
    assert.doesNotMatch(seoLanding, /technicalSeoUpgradeContent/);
    assert.doesNotMatch(seoDetail, /technicalSeoUpgradeContent/);
    assert.match(prospectsLanding, /convertUpgradeContent/);
    assert.doesNotMatch(prospectsLanding, /prospectCsvUpgradeContent|UpgradeHint/);

    const audience = audienceUpgradeContent({
      continuation: en.personas.free.continuation,
      upgrade: en.upgrade,
    });
    const getoblic = getoblicDirectoryUpgradeContent({
      continuation: en.prospects.find.methods.directoryContinuation,
      upgrade: en.upgrade,
    });
    assert.equal(audience.feature, "audience");
    assert.equal(getoblic.feature, "getoblicDirectory");
  });
});

describe("FREE-15E available Free, Full, CTA, and authority", () => {
  it("keeps available Free primary actions structurally present", () => {
    const personas = read("components/personas/PersonaImportForms.tsx");
    const seo = read("components/seo/SeoReportGenerateForm.tsx");
    const prospects = read("components/prospects/ProspectImportForms.tsx");

    assert.match(personas, /showSuggest \? \(/);
    assert.match(personas, /showManual \? \(/);
    assert.match(personas, /PersonaGenerateForm/);
    assert.match(seo, /value="intelligence"/);
    assert.match(seo, /copy\.startAnalysis/);
    assert.match(prospects, /copy\.manualTitle/);
    assert.match(prospects, /copy\.importCta/);
  });

  it("renders no secondary upgrade treatment on Full workflows", () => {
    const fullCsv = renderToStaticMarkup(
      createElement(PersonaCsvImport, {
        messages: en,
        available: true,
      }),
    );
    assert.doesNotMatch(fullCsv, /data-upgrade-feature=/);
    assert.match(fullCsv, /type="file"/);

    const seo = read("components/seo/SeoReportGenerateForm.tsx");
    const personas = read("components/personas/PersonaImportForms.tsx");
    const prospects = read("components/prospects/ProspectImportForms.tsx");
    assert.match(seo, /allowTechnical \? \(/);
    assert.match(seo, /value="technical"/);
    assert.match(personas, /available=\{showCsv\}/);
    assert.match(prospects, /showCsvImport \? \(/);
    assert.match(prospects, /<ProspectCsvImport messages=\{messages\} \/>/);
  });

  it("preserves action=none and introduces no destination", () => {
    for (const content of [TECHNICAL, PERSONA_CSV, PROSPECT_CSV]) {
      assertNonInteractiveHint(
        renderToStaticMarkup(createElement(UpgradeHint, content)),
        content.feature,
      );
      assert.equal(Boolean(content.ctaLabel), false);
    }

    const presentation = read("lib/upgrade/freeSecondaryUpgradePresentation.ts");
    assert.doesNotMatch(presentation, /kind:\s*["']href["']|kind:\s*["']handler["']/);
    assert.doesNotMatch(presentation, /onContinue|href:\s*["']\//);
    assert.doesNotMatch(presentation, /\/pricing|\/checkout|\/billing/);
    assert.doesNotMatch(presentation, /ctaLabel/);
  });

  it("leaves existing Free authority constants and guards unchanged", () => {
    const authorityFiles = [
      "lib/organization/freeAudienceGeneration.ts",
      "lib/organization/freeVisibilityGeneration.ts",
      "lib/organization/freeConvertGeneration.ts",
      "services/organization/freeAudienceGenerationGuard.ts",
      "services/organization/freeVisibilityGenerationGuard.ts",
      "services/organization/freeConvertGenerationGuard.ts",
    ];
    for (const file of authorityFiles) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /UpgradeHint|freeSecondaryUpgradePresentation|technicalSeoUpgradeContent/,
        file,
      );
    }

    const audience = read("lib/personas/freeAudiencePresentation.ts");
    const visibility = read("lib/seo/freeVisibilityPresentation.ts");
    const convert = read("lib/prospects/freeConvertPresentation.ts");
    assert.match(
      audience,
      /shouldShowPersonaCsvImport[\s\S]*return presentation === "full"/,
    );
    assert.match(
      visibility,
      /shouldShowSeoTechnicalOption[\s\S]*return presentation === "full"/,
    );
    assert.match(
      convert,
      /shouldShowProspectCsvImport[\s\S]*return presentation === "full"/,
    );
  });
});

describe("FREE-15E i18n and accessibility", () => {
  it("keeps six-language key parity without pricing or unsupported claims", () => {
    const canonical = collectKeyPaths(en);
    for (const path of LOCKED_KEY_PATHS) {
      assert.ok(canonical.includes(path), path);
    }

    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      const paths = collectKeyPaths(dictionary);
      assert.deepEqual(
        LOCKED_KEY_PATHS.filter((path) => !paths.includes(path)),
        [],
        `${language} missing FREE-15E keys`,
      );

      const blobs = [
        dictionary.seo.free.technicalLocked,
        dictionary.personas.free.csvLocked,
        dictionary.prospects.free.csvLocked,
      ];
      for (const blob of blobs) {
        assert.ok(blob.headline.trim());
        assert.ok(blob.capability1.trim());
        assert.ok(blob.capability2.trim());
        assert.doesNotMatch(JSON.stringify(blob), FORBIDDEN_COPY, language);
        assert.doesNotMatch(JSON.stringify(blob), UNSUPPORTED_CLAIMS, language);
        assert.doesNotMatch(JSON.stringify(blob), /\bupgrade\b/i, language);
      }
    }

    assert.notEqual(
      fr.seo.free.technicalLocked.headline,
      en.seo.free.technicalLocked.headline,
    );
    assert.notEqual(
      de.personas.free.csvLocked.capability1,
      en.personas.free.csvLocked.capability1,
    );
    assert.notEqual(
      es.prospects.free.csvLocked.headline,
      en.prospects.free.csvLocked.headline,
    );
    assert.notEqual(
      itMessages.seo.free.technicalLocked.capability2,
      en.seo.free.technicalLocked.capability2,
    );
    assert.notEqual(
      pt.personas.free.csvLocked.headline,
      en.personas.free.csvLocked.headline,
    );
    assert.equal(en.personas.free.csvUnavailable, "Available with Full Athena");
    assert.equal(en.prospects.free.csvUnavailable, "Available with Full Athena");
  });

  it("exposes note semantics for compact locked methods", () => {
    const html = renderToStaticMarkup(createElement(UpgradeHint, TECHNICAL));
    assert.match(html, /role="note"/);
    assert.match(html, /aria-labelledby="/);
    assert.match(html, /<ul id="/);
  });
});
