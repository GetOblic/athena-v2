import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ORGANIZATION_LANGUAGES,
  ORGANIZATION_LANGUAGE_LABELS,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";
import {
  formatTenantDate,
  formatTenantDateTime,
  formatTenantTimelineDateTime,
  toFormattingLocale,
} from "../../lib/tenantI18n/format";
import { getTenantMessages } from "../../lib/tenantI18n/getTenantMessages";
import { getLocalizedBrainStatus } from "../../lib/tenantI18n/brainStatus";
import { getLocalizedStatusLabel } from "../../lib/tenantI18n/statusLabels";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";

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

function collectLeaves(
  value: unknown,
  prefix = "",
): Array<{ path: string; text: string }> {
  if (typeof value === "string") {
    return prefix ? [{ path: prefix, text: value }] : [];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as object).flatMap((key) =>
    collectLeaves(
      (value as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

const DICTIONARIES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const EXPECTED_FORMATTING_LOCALES = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  de: "de-DE",
  pt: "pt-PT",
} as const;

const PRODUCT_TERMS = [
  "Athena",
  "GetOblic",
  "Ask Athena",
  "Athena Brain",
  "Social Planner",
  "Intelligence Domains",
] as const;

describe("V31 L3.1 tenant i18n — language contract", () => {
  it("keeps the existing six organization languages authoritative", () => {
    assert.deepEqual([...ORGANIZATION_LANGUAGES], [
      "en",
      "fr",
      "es",
      "it",
      "de",
      "pt",
    ]);
    assert.equal(ORGANIZATION_LANGUAGES.length, 6);
    assert.deepEqual(Object.keys(DICTIONARIES).sort(), [
      "de",
      "en",
      "es",
      "fr",
      "it",
      "pt",
    ]);
  });

  it("does not duplicate the language allowlist or autonyms", () => {
    const foundationFiles = [
      "lib/tenantI18n/types.ts",
      "lib/tenantI18n/getTenantMessages.ts",
      "lib/tenantI18n/getTenantLocalization.ts",
      "lib/tenantI18n/format.ts",
      "lib/tenantI18n/statusLabels.ts",
      "lib/tenantI18n/brainStatus.ts",
      "lib/tenantI18n/deepScrapeProgress.ts",
      "lib/tenantI18n/discussionPresentation.ts",
      "lib/tenantI18n/personaPresentation.ts",
      "lib/tenantI18n/prospectPresentation.ts",
      "lib/tenantI18n/opportunityPresentation.ts",
      "lib/tenantI18n/briefingPresentation.ts",
      "lib/tenantI18n/adsPresentation.ts",
      "lib/tenantI18n/seoPresentation.ts",
      "lib/tenantI18n/socialPlannerPresentation.ts",
      "lib/tenantI18n/intelligenceDomainStatus.ts",
      "lib/tenantI18n/intelligenceDomainPresentation.ts",
      "lib/tenantI18n/importPresentation.ts",
      "lib/tenantI18n/messages/en.ts",
      "lib/tenantI18n/messages/fr.ts",
      "lib/tenantI18n/messages/es.ts",
      "lib/tenantI18n/messages/it.ts",
      "lib/tenantI18n/messages/de.ts",
      "lib/tenantI18n/messages/pt.ts",
    ];
    for (const file of foundationFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /ORGANIZATION_LANGUAGES/);
      assert.doesNotMatch(source, /ORGANIZATION_LANGUAGE_LABELS/);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const leaves = collectLeaves(DICTIONARIES[language]);
      for (const leaf of leaves) {
        for (const label of Object.values(ORGANIZATION_LANGUAGE_LABELS)) {
          assert.notEqual(leaf.text, label);
        }
      }
    }
  });
});

describe("V31 L3.1 tenant i18n — dictionaries", () => {
  it("maps all six languages through getTenantMessages", () => {
    assert.equal(getTenantMessages("en"), en);
    assert.equal(getTenantMessages("fr"), fr);
    assert.equal(getTenantMessages("es"), es);
    assert.equal(getTenantMessages("it"), itMessages);
    assert.equal(getTenantMessages("de"), de);
    assert.equal(getTenantMessages("pt"), pt);
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.equal(getTenantMessages(language), DICTIONARIES[language]);
    }
  });

  it("falls back to English for impossible runtime language values", () => {
    assert.equal(
      getTenantMessages("zz" as OrganizationLanguage),
      en,
    );
  });

  it("requires identical nested key structure with no missing or extra keys", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("common.save"));
    assert.ok(canonical.includes("copyChrome.done"));
    assert.ok(canonical.includes("copyChrome.saveTagFailed"));
    assert.ok(canonical.includes("copyChrome.usageTags.selected"));
    assert.ok(canonical.includes("nav.dashboard"));
    assert.ok(canonical.includes("status.new"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      const missing = canonical.filter((path) => !paths.includes(path));
      const extra = paths.filter((path) => !canonical.includes(path));
      assert.deepEqual(missing, [], `${language} missing keys`);
      assert.deepEqual(extra, [], `${language} extra keys`);
    }
  });

  it("contains no empty-string translations", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      for (const leaf of collectLeaves(DICTIONARIES[language])) {
        assert.ok(
          leaf.text.trim().length > 0,
          `${language} ${leaf.path} is empty`,
        );
      }
    }
  });

  it("keeps product terminology unchanged where it appears", () => {
    const englishLeaves = collectLeaves(en);
    for (const language of ORGANIZATION_LANGUAGES) {
      if (language === "en") continue;
      const otherLeaves = new Map(
        collectLeaves(DICTIONARIES[language]).map((leaf) => [
          leaf.path,
          leaf.text,
        ]),
      );
      for (const leaf of englishLeaves) {
        for (const term of PRODUCT_TERMS) {
          if (!leaf.text.includes(term)) continue;
          const translated = otherLeaves.get(leaf.path) ?? "";
          assert.ok(
            translated.includes(term),
            `${language} ${leaf.path} must keep "${term}"`,
          );
        }
      }
    }
  });
});

describe("V31 L3.1 tenant i18n — formatting", () => {
  it("maps organization language to the exact UX formatting locales", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.equal(
        toFormattingLocale(language),
        EXPECTED_FORMATTING_LOCALES[language],
      );
    }
  });

  it("does not use browser locale authority", () => {
    const source = read("lib/tenantI18n/format.ts");
    assert.doesNotMatch(source, /navigator\.language/);
    assert.doesNotMatch(source, /accept-language/i);
    assert.doesNotMatch(source, /document\.cookie/);
    assert.doesNotMatch(source, /Intl\.DateTimeFormat\(\s*undefined/);
    assert.doesNotMatch(source, /toLocaleDateString\(\s*undefined/);
    assert.doesNotMatch(source, /toLocaleString\(\s*undefined/);
    assert.match(source, /toFormattingLocale\(language\)/);
  });

  it("formats date-only values without UTC rollover", () => {
    const formatted = formatTenantDate("2026-08-31", "en");
    assert.match(formatted, /31/);
    assert.doesNotMatch(formatted, /30/);
    assert.equal(formatTenantDate("not-a-date", "fr"), "");
    assert.ok(formatTenantDateTime("2026-08-31T15:04:00.000Z", "de"));
  });

  it("formats timeline datetimes with tenant locale and no year", () => {
    const stamp = "2026-08-20T15:04:00.000Z";
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    for (const language of ORGANIZATION_LANGUAGES) {
      const locale = EXPECTED_FORMATTING_LOCALES[language];
      const formatted = formatTenantTimelineDateTime(stamp, language);
      assert.equal(
        formatted,
        new Intl.DateTimeFormat(locale, options).format(new Date(stamp)),
      );
      const types = new Set(
        new Intl.DateTimeFormat(locale, options)
          .formatToParts(new Date(stamp))
          .map((part) => part.type),
      );
      assert.equal(types.has("year"), false);
      assert.doesNotMatch(formatted, /2026/);
    }
    assert.notEqual(
      formatTenantTimelineDateTime(stamp, "fr"),
      formatTenantTimelineDateTime(stamp, "en"),
    );
    assert.match(formatTenantDateTime(stamp, "en"), /2026/);
  });
});

describe("V31 L3.1 tenant i18n — server localization entry point", () => {
  it("derives organization language server-side and does not take Client input", () => {
    const source = read("lib/tenantI18n/getTenantLocalization.ts");
    const start = source.indexOf(
      "export async function getTenantLocalization",
    );
    const bodyStart = source.indexOf("{", start);
    const resolver = source.slice(start, source.indexOf("\n}", bodyStart) + 2);
    assert.match(resolver, /export async function getTenantLocalization\(\)/);
    assert.match(resolver, /requireCurrentOrganizationContext/);
    assert.match(resolver, /resolveOrganizationLanguage\(organizationId\)/);
    assert.match(resolver, /getTenantMessages\(language\)/);
    assert.match(resolver, /toFormattingLocale\(language\)/);
    assert.doesNotMatch(resolver, /navigator\.language|accept-language/i);
    assert.doesNotMatch(resolver, /document\.cookie|searchParams|formData/);
    assert.doesNotMatch(
      resolver,
      /function getTenantLocalization\([^)]*organizationId/,
    );
  });
});

describe("V31 L3.1 tenant i18n — status presentation", () => {
  it("returns localized status text and never a raw key", () => {
    assert.equal(getLocalizedStatusLabel(fr, "draft"), "Brouillon");
    assert.equal(getLocalizedStatusLabel(en, "completed"), "Completed");
    assert.equal(getLocalizedStatusLabel(de, "failed"), "Fehlgeschlagen");
    const missing = {
      ...en,
      status: { ...en.status, draft: "" },
    };
    assert.equal(getLocalizedStatusLabel(missing, "draft"), "Draft");
    assert.notEqual(getLocalizedStatusLabel(missing, "draft"), "draft");
  });

  it("does not add Brain stored tokens to the generic status dictionary", () => {
    assert.equal("ready" in en.status, false);
    assert.equal("pending" in en.status, false);
    assert.equal("processing" in en.status, false);
  });
});

describe("V31 L3.3 tenant i18n — Brain status presentation", () => {
  it("keeps the stored ready token and localizes presentation per language", () => {
    const stored = "ready";
    assert.equal(getLocalizedBrainStatus(en, stored), "Ready");
    assert.equal(stored, "ready");
    assert.equal(getLocalizedBrainStatus(fr, stored), "Prêt");
    assert.equal(getLocalizedBrainStatus(es, stored), "Listo");
    assert.equal(getLocalizedBrainStatus(itMessages, stored), "Pronto");
    assert.equal(getLocalizedBrainStatus(de, stored), "Bereit");
    assert.equal(getLocalizedBrainStatus(pt, stored), "Pronto");
    assert.equal(stored, "ready");
    assert.notEqual(getLocalizedBrainStatus(en, stored), "ready");
    assert.notEqual(getLocalizedBrainStatus(en, "pending"), "pending");
  });
});

describe("V31 L3.1 tenant i18n — architecture boundaries", () => {
  it("omits unused t() and Client provider architecture", () => {
    assert.equal(existsSync(join(ROOT, "lib/tenantI18n/t.ts")), false);
    assert.equal(
      existsSync(
        join(ROOT, "components/tenantI18n/TenantLocalizationProvider.tsx"),
      ),
      false,
    );
    assert.match(
      read("lib/tenantI18n/types.ts"),
      /generic t\(\) helper is intentionally omitted/,
    );
  });

  it("adds no locale routing, next-intl, or JSON dictionaries", () => {
    const packageJson = read("package.json");
    assert.doesNotMatch(packageJson, /next-intl|i18next|react-intl/);
    assert.doesNotMatch(read("middleware.ts"), /locale|next-intl|i18n/);
    assert.doesNotMatch(read("next.config.ts"), /next-intl|i18n|locale/);
    assert.equal(existsSync(join(ROOT, "lib/tenantI18n/messages/en.json")), false);
    assert.equal(existsSync(join(ROOT, "app/[locale]")), false);
  });
});
