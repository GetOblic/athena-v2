import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PERSONA_FORM_KEYS } from "../../components/personas/personaFormFields";
import {
  getLocalizedImportPreviewStatus,
  getLocalizedPersonaImportFieldLabel,
  getLocalizedPersonaImportGroupTitle,
  getLocalizedProspectImportFieldLabel,
} from "../../lib/tenantI18n/importPresentation";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listTsFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(relative));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
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

const DICTIONARIES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const PERSONA_IMPORT_FILES = [
  "app/personas/import/page.tsx",
  "components/personas/PersonaImportForms.tsx",
  "components/personas/PersonaGenerateForm.tsx",
  "components/personas/PersonaCsvImport.tsx",
];

const PROSPECT_IMPORT_FILES = [
  "app/prospects/import/page.tsx",
  "components/prospects/ProspectImportForms.tsx",
  "components/prospects/ProspectCsvImport.tsx",
];

const CLIENT_LANGUAGE_AUTHORITY = [
  /navigator\.language/,
  /accept-language/i,
  /document\.cookie/,
  /pathname.*locale/i,
  /useTenantI18n|I18nProvider|LocaleProvider/,
  /getTenantLocalization/,
  /resolveOrganizationLanguage/,
];

const MANUAL_FIELD_KEYS = [
  "business_name",
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "industry",
  "category",
  "country",
  "state",
  "city",
  "address",
  "decision_maker",
  "first_name",
  "last_name",
  "external_contact_id",
  "timezone",
  "job_title",
  "email",
  "phone",
  "whatsapp_number",
  "google_business_url",
  "company_size",
  "revenue",
  "employee_count",
  "technologies",
  "pain_points",
  "source",
] as const;

const STATUS_LABELS_EN = {
  ready: en.personas.import.statusReady,
  duplicate: en.personas.import.statusDuplicate,
  warning: en.personas.import.statusWarning,
  invalid: en.personas.import.statusInvalid,
};

const STATUS_LABELS_FR = {
  ready: fr.personas.import.statusReady,
  duplicate: fr.personas.import.statusDuplicate,
  warning: fr.personas.import.statusWarning,
  invalid: fr.personas.import.statusInvalid,
};

describe("V31 L3.10.2 tenant import surfaces — server authority", () => {
  it("resolves Persona and Prospect import pages through getTenantLocalization", () => {
    const personaPage = read("app/personas/import/page.tsx");
    const prospectPage = read("app/prospects/import/page.tsx");
    assert.match(personaPage, /getTenantLocalization/);
    assert.match(prospectPage, /getTenantLocalization/);
    assert.match(personaPage, /PersonaImportForms messages=\{messages\}/);
    assert.match(prospectPage, /ProspectImportForms messages=\{messages\}/);
    assert.match(personaPage, /TenantBackLink href="\/personas"/);
    assert.match(prospectPage, /TenantBackLink href="\/prospects"/);
    assert.match(personaPage, /copy\.backToPersonas/);
    assert.match(prospectPage, /copy\.backToProspects/);
    assert.match(personaPage, /copy\.list\.createCta/);
    assert.match(prospectPage, /copy\.list\.importCta/);
  });

  it("does not introduce Client or browser language authority", () => {
    for (const file of [...PERSONA_IMPORT_FILES, ...PROSPECT_IMPORT_FILES]) {
      const source = read(file);
      for (const pattern of CLIENT_LANGUAGE_AUTHORITY) {
        if (file.endsWith("page.tsx") && pattern.source === "getTenantLocalization") {
          continue;
        }
        if (!file.endsWith("page.tsx")) {
          assert.doesNotMatch(source, pattern, `${file} ${pattern}`);
        } else {
          assert.doesNotMatch(source, /navigator\.language/);
          assert.doesNotMatch(source, /accept-language/i);
          assert.doesNotMatch(source, /document\.cookie/);
          assert.doesNotMatch(source, /useTenantI18n|I18nProvider|LocaleProvider/);
        }
      }
    }
  });
});

describe("V31 L3.10.2 tenant import surfaces — dictionaries", () => {
  it("adds Persona and Prospect import keys in all six locales", () => {
    const personaKeys = collectKeyPaths(en.personas.import);
    const prospectKeys = collectKeyPaths(en.prospects.import);
    assert.ok(personaKeys.includes("manualTitle"));
    assert.ok(personaKeys.includes("generateCta"));
    assert.ok(personaKeys.includes("csvTitle"));
    assert.ok(prospectKeys.includes("manualTitle"));
    assert.ok(prospectKeys.includes("csvTitle"));
    assert.ok(prospectKeys.includes("invalidWebsites"));
    assert.ok(prospectKeys.includes("linkedinUrl"));
    assert.ok(prospectKeys.includes("facebookUrl"));
    assert.ok(prospectKeys.includes("instagramUrl"));
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.deepEqual(
        collectKeyPaths(DICTIONARIES[language].personas.import),
        personaKeys,
        `${language} personas.import`,
      );
      assert.deepEqual(
        collectKeyPaths(DICTIONARIES[language].prospects.import),
        prospectKeys,
        `${language} prospects.import`,
      );
    }
  });

  it("keeps locked product terms exact in import chrome", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      assert.match(dictionary.personas.import.subtitle, /Athena Brain/);
      assert.match(dictionary.personas.import.generateSummary, /Athena Brain/);
      assert.match(dictionary.personas.import.generating, /Athena/);
      assert.match(dictionary.prospects.import.guideBackground, /Executive Intelligence/);
      assert.match(dictionary.chrome.tagline, /Intelligence OS/);
      assert.equal(dictionary.chrome.tagline, "Intelligence OS");
    }
    assert.equal(en.personas.import.csvTitle, "CSV Import");
    assert.equal(fr.personas.import.csvTitle.includes("CSV"), true);
    assert.equal(de.prospects.import.csvTitle.includes("CSV"), true);
  });

  it("localizes import chrome away from English in non-English dictionaries", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      if (language === "en") continue;
      const dictionary = DICTIONARIES[language];
      assert.notEqual(
        dictionary.personas.import.manualTitle,
        en.personas.import.manualTitle,
      );
      assert.notEqual(
        dictionary.personas.import.generateCta,
        en.personas.import.generateCta,
      );
      assert.notEqual(
        dictionary.prospects.import.manualTitle,
        en.prospects.import.manualTitle,
      );
      assert.notEqual(
        dictionary.prospects.import.importCta,
        en.prospects.import.importCta,
      );
    }
  });
});

describe("V31 L3.10.2 tenant import surfaces — Persona", () => {
  it("localizes Persona import shell, manual-create, generate, and CSV chrome", () => {
    const page = read("app/personas/import/page.tsx");
    const forms = read("components/personas/PersonaImportForms.tsx");
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    const csv = read("components/personas/PersonaCsvImport.tsx");
    assert.match(page, /copy\.eyebrow/);
    assert.match(page, /copy\.import\.subtitle/);
    assert.match(forms, /copy\.manualTitle/);
    assert.match(forms, /copy\.createCta/);
    assert.match(forms, /meta\.personaName/);
    assert.match(forms, /getLocalizedPersonaImportFieldLabel/);
    assert.match(generate, /copy\.generateTitle/);
    assert.match(generate, /copy\.generateCta/);
    assert.match(generate, /copy\.portfolioInsightTitle/);
    assert.match(csv, /copy\.csvTitle/);
    assert.match(csv, /copy\.reviewCta/);
    assert.match(csv, /copy\.statusReady/);
    assert.match(csv, /getLocalizedImportPreviewStatus/);
  });

  it("keeps canonical Persona field keys and posts user values verbatim", () => {
    const fields = read("components/personas/personaFormFields.ts");
    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(fields, /"persona_name"/);
    assert.match(fields, /\["gender_identity", "Gender or Gender Identity"\]/);
    assert.deepEqual([...PERSONA_FORM_KEYS].slice(0, 7), [
      "persona_name",
      "short_description",
      "additional_context",
      "reference_website",
      "notes",
      "ads_content",
      "category",
    ]);
    assert.match(forms, /body: JSON\.stringify\(manual\)/);
    assert.doesNotMatch(forms, /language:|locale:/);
    assert.doesNotMatch(forms, /translatePersona|localizePersonaValue/);
    for (const key of PERSONA_FORM_KEYS) {
      assert.notEqual(
        getLocalizedPersonaImportFieldLabel(en, key),
        key,
        key,
      );
    }
    assert.equal(
      getLocalizedPersonaImportFieldLabel(fr, "persona_name"),
      fr.personas.metadata.personaName,
    );
    assert.equal(
      getLocalizedPersonaImportFieldLabel(en, "unknown_field"),
      "unknown_field",
    );
    assert.equal(
      getLocalizedPersonaImportFieldLabel(en, "reference_website"),
      "Reference Website",
    );
    assert.equal(en.personas.metadata.referenceWebsite, "Reference Website");
    assert.doesNotMatch(
      read("components/personas/PersonaImportForms.tsx"),
      /linkedin|facebook|instagram/,
    );
    assert.equal(
      getLocalizedPersonaImportGroupTitle(fr, "Demographics"),
      fr.personas.metadata.groupDemographics,
    );
    assert.equal(
      getLocalizedPersonaImportGroupTitle(fr, "Family and Household"),
      fr.personas.import.groupFamilyHousehold,
    );
    assert.equal(
      getLocalizedPersonaImportGroupTitle(en, "Unknown Group"),
      "Unknown Group",
    );
  });

  it("keeps generated candidate values and portfolio insight verbatim", () => {
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    assert.match(generate, /personaCandidateToFormState\(payload\.candidate\)/);
    assert.match(generate, /\{portfolioCoverageInsight\}/);
    assert.match(generate, /value=\{candidate\.persona_name/);
    assert.match(
      generate,
      /body: JSON\.stringify\(\{\s*instruction,?\s*\}\)/,
    );
    assert.doesNotMatch(generate, /language:|locale:/);
    assert.doesNotMatch(generate, /translateCandidate|localizeInsight/);
    assert.match(generate, /payload\.message \|\| errorMessage/);
    assert.match(generate, /error instanceof Error \? error\.message/);
  });

  it("maps canonical CSV status tokens to localized labels only", () => {
    assert.equal(
      getLocalizedImportPreviewStatus(STATUS_LABELS_EN, "ready"),
      "Ready",
    );
    assert.equal(
      getLocalizedImportPreviewStatus(STATUS_LABELS_FR, "ready"),
      fr.personas.import.statusReady,
    );
    assert.equal(
      getLocalizedImportPreviewStatus(STATUS_LABELS_FR, "duplicate"),
      fr.personas.import.statusDuplicate,
    );
    assert.equal(
      getLocalizedImportPreviewStatus(STATUS_LABELS_EN, "unexpected"),
      "unexpected",
    );
    assert.notEqual(fr.personas.import.statusReady, "ready");
    const csv = read("components/personas/PersonaCsvImport.tsx");
    assert.match(csv, /status: "ready" \| "duplicate" \| "warning" \| "invalid"/);
    assert.match(csv, /getLocalizedImportPreviewStatus\(\s*statusLabels,\s*row\.status/);
    assert.match(csv, /row\.displayLabel/);
    assert.match(csv, /row\.warnings\[0\]/);
    assert.match(csv, /row\.reason/);
    assert.match(csv, /href="\/templates\/athena-persona-import-template\.csv"/);
    assert.match(csv, /download="Athena_Persona_Import_Template\.csv"/);
  });
});

describe("V31 L3.10.2 tenant import surfaces — Prospect", () => {
  it("localizes Prospect import shell, manual, and CSV chrome", () => {
    const page = read("app/prospects/import/page.tsx");
    const forms = read("components/prospects/ProspectImportForms.tsx");
    const csv = read("components/prospects/ProspectCsvImport.tsx");
    assert.match(page, /copy\.eyebrow/);
    assert.match(page, /copy\.import\.subtitle/);
    assert.match(forms, /copy\.manualTitle/);
    assert.match(forms, /copy\.importCta/);
    assert.match(forms, /getLocalizedProspectImportFieldLabel/);
    assert.match(forms, /meta\.getoblicType/);
    assert.match(forms, /meta\.notSet/);
    assert.match(csv, /copy\.csvTitle/);
    assert.match(csv, /copy\.invalidWebsites/);
    assert.match(csv, /copy\.withoutWebsite/);
    assert.match(csv, /getLocalizedImportPreviewStatus/);
  });

  it("keeps canonical MANUAL_FIELDS keys and posts user values verbatim", () => {
    const forms = read("components/prospects/ProspectImportForms.tsx");
    for (const key of MANUAL_FIELD_KEYS) {
      assert.match(forms, new RegExp(`\\["${key}"`));
      assert.notEqual(
        getLocalizedProspectImportFieldLabel(en, key),
        key,
        key,
      );
    }
    assert.equal(
      getLocalizedProspectImportFieldLabel(fr, "business_name"),
      fr.prospects.metadata.businessName,
    );
    assert.equal(
      getLocalizedProspectImportFieldLabel(en, "source"),
      en.prospects.detail.source,
    );
    assert.equal(
      getLocalizedProspectImportFieldLabel(en, "unknown_field"),
      "unknown_field",
    );
    assert.equal(
      getLocalizedProspectImportFieldLabel(en, "linkedin"),
      "LinkedIn URL",
    );
    assert.equal(
      getLocalizedProspectImportFieldLabel(en, "facebook"),
      "Facebook URL",
    );
    assert.equal(
      getLocalizedProspectImportFieldLabel(en, "instagram"),
      "Instagram URL",
    );
    assert.equal(
      getLocalizedProspectImportFieldLabel(en, "decision_maker"),
      "Decision Maker / Contact Name",
    );
    assert.equal(
      getLocalizedProspectImportFieldLabel(en, "google_business_url"),
      "Google Business URL",
    );
    assert.equal(en.prospects.metadata.linkedin, "LinkedIn");
    assert.equal(en.prospects.metadata.facebook, "Facebook");
    assert.equal(en.prospects.metadata.instagram, "Instagram");
    assert.notEqual(
      getLocalizedProspectImportFieldLabel(en, "linkedin"),
      en.prospects.metadata.linkedin,
    );
    assert.match(forms, /\["linkedin", "LinkedIn URL"\]/);
    assert.match(forms, /\["facebook", "Facebook URL"\]/);
    assert.match(forms, /\["instagram", "Instagram URL"\]/);
    assert.match(forms, /body: JSON\.stringify\(manual\)/);
    assert.doesNotMatch(forms, /language:|locale:/);
    assert.match(forms, /PROSPECT_GETOBLIC_TYPES\.map\(\(value\) =>/);
    assert.match(forms, /<option key=\{value\} value=\{value\}>/);
  });

  it("preserves pre-L3.10.2 Prospect social URL field-label semantics", () => {
    assert.equal(en.prospects.import.linkedinUrl, "LinkedIn URL");
    assert.equal(en.prospects.import.facebookUrl, "Facebook URL");
    assert.equal(en.prospects.import.instagramUrl, "Instagram URL");
    const expected = {
      en: ["LinkedIn URL", "Facebook URL", "Instagram URL"],
      fr: ["URL LinkedIn", "URL Facebook", "URL Instagram"],
      es: ["URL de LinkedIn", "URL de Facebook", "URL de Instagram"],
      it: ["URL LinkedIn", "URL Facebook", "URL Instagram"],
      de: ["LinkedIn-URL", "Facebook-URL", "Instagram-URL"],
      pt: ["URL do LinkedIn", "URL do Facebook", "URL do Instagram"],
    } as const;
    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      const [linkedin, facebook, instagram] = expected[language];
      assert.equal(dictionary.prospects.import.linkedinUrl, linkedin);
      assert.equal(dictionary.prospects.import.facebookUrl, facebook);
      assert.equal(dictionary.prospects.import.instagramUrl, instagram);
      assert.equal(
        getLocalizedProspectImportFieldLabel(dictionary, "linkedin"),
        linkedin,
      );
      assert.equal(
        getLocalizedProspectImportFieldLabel(dictionary, "facebook"),
        facebook,
      );
      assert.equal(
        getLocalizedProspectImportFieldLabel(dictionary, "instagram"),
        instagram,
      );
      assert.match(linkedin, /LinkedIn/);
      assert.match(facebook, /Facebook/);
      assert.match(instagram, /Instagram/);
      assert.match(linkedin, /URL/);
      assert.match(facebook, /URL/);
      assert.match(instagram, /URL/);
      assert.equal(dictionary.prospects.metadata.linkedin, "LinkedIn");
      assert.equal(dictionary.prospects.metadata.facebook, "Facebook");
      assert.equal(dictionary.prospects.metadata.instagram, "Instagram");
    }
    const csv = read("services/prospects/prospectCsv.ts");
    assert.match(csv, /linkedin_url: "linkedin"/);
    assert.match(csv, /facebook_url: "facebook"/);
    assert.match(csv, /instagram_url: "instagram"/);
    const template = read("public/templates/athena-prospect-import-template.csv");
    assert.match(template, /LinkedIn URL/);
    assert.match(template, /Facebook URL/);
    assert.match(template, /Instagram URL/);
  });

  it("keeps Prospect CSV tokens, imported cells, and template contract unchanged", () => {
    const csv = read("components/prospects/ProspectCsvImport.tsx");
    assert.match(csv, /status: "ready" \| "duplicate" \| "warning" \| "invalid"/);
    assert.match(csv, /row\.businessName \?\? emptyValue/);
    assert.match(csv, /row\.warnings\[0\]/);
    assert.match(csv, /row\.reason/);
    assert.match(csv, /href="\/templates\/athena-prospect-import-template\.csv"/);
    assert.match(csv, /download="Athena_Prospect_Import_Template\.csv"/);
    assert.match(csv, /copy\.ignoredWarningOne/);
    assert.equal(
      interpolateTenantMessage(en.prospects.import.ignoredWarningMany, {
        count: 2,
        columns: "extra, bonus",
      }),
      "2 ignored columns will not be imported: extra, bonus",
    );
    const template = read("public/templates/athena-prospect-import-template.csv");
    assert.match(template, /Business Name/);
    assert.match(template, /WhatsApp Number/);
    const personaTemplate = read(
      "public/templates/athena-persona-import-template.csv",
    );
    assert.match(personaTemplate, /Persona Name/);
    assert.match(personaTemplate, /Reference Website/);
  });
});

describe("V31 L3.10.2 tenant import surfaces — shared isolation", () => {
  it("passes localized AthenaBrandLink chrome and keeps the component tenant-neutral", () => {
    const personaPage = read("app/personas/import/page.tsx");
    const prospectPage = read("app/prospects/import/page.tsx");
    const brand = read("components/branding/AthenaBrandLink.tsx");
    assert.match(personaPage, /logoutLabel=\{messages\.chrome\.logOut\}/);
    assert.match(personaPage, /sessionActionsLabel=\{messages\.chrome\.sessionActions\}/);
    assert.match(personaPage, /tagline=\{messages\.chrome\.tagline\}/);
    assert.match(prospectPage, /logoutLabel=\{messages\.chrome\.logOut\}/);
    assert.match(prospectPage, /sessionActionsLabel=\{messages\.chrome\.sessionActions\}/);
    assert.doesNotMatch(brand, /tenantI18n|lib\/tenantI18n/);
    assert.match(brand, /tagline = "Intelligence OS"/);
  });

  it("keeps parser, generation, and worker modules free of tenantI18n", () => {
    const isolated = [
      "services/personas/personaCsv.ts",
      "services/personas/personaImporter.ts",
      "services/personas/personaImportPreparation.ts",
      "services/personas/personaGeneration.ts",
      "services/prospects/prospectImporter.ts",
      "services/prospects/prospectImportPreparation.ts",
      "app/api/personas/route.ts",
      "app/api/personas/generate/route.ts",
      "app/api/personas/import/route.ts",
      "app/api/personas/import/preview/route.ts",
      "app/api/prospects/route.ts",
      "app/api/prospects/import/route.ts",
      "app/api/prospects/import/preview/route.ts",
    ];
    for (const file of isolated) {
      if (!existsSync(join(ROOT, file))) continue;
      assert.doesNotMatch(read(file), /tenantI18n|lib\/tenantI18n/, file);
    }
    for (const file of [
      "app/api/personas/route.ts",
      "app/api/personas/generate/route.ts",
      "app/api/personas/import/route.ts",
      "app/api/personas/import/preview/route.ts",
      "app/api/prospects/route.ts",
      "app/api/prospects/import/route.ts",
      "app/api/prospects/import/preview/route.ts",
      "components/personas/PersonaImportForms.tsx",
      "components/personas/PersonaGenerateForm.tsx",
      "components/prospects/ProspectImportForms.tsx",
    ]) {
      assert.doesNotMatch(read(file), /\blanguage:|\blocale:/, file);
    }
    assert.deepEqual(
      listTsFiles("workers").filter((file) =>
        /tenantI18n|lib\/tenantI18n/.test(read(file)),
      ),
      [],
    );
  });

  it("does not start L3.11 regression work", () => {
    const prompt = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.doesNotMatch(prompt, /tenantI18n|lib\/tenantI18n/);
    assert.doesNotMatch(
      read("components/personas/PersonaConversationPanel.tsx"),
      /personas\.import/,
    );
    assert.doesNotMatch(
      read("components/prospects/ProspectConversationPanel.tsx"),
      /prospects\.import/,
    );
    assert.doesNotMatch(
      read("app/communities/[id]/page.tsx"),
      /personas\.import|prospects\.import/,
    );
    assert.doesNotMatch(
      read("app/login/page.tsx"),
      /getTenantLocalization|personas\.import/,
    );
  });
});
