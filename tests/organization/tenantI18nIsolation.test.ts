import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

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

function filesImportingTenantI18n(dirs: string[]): string[] {
  const hits: string[] = [];
  for (const dir of dirs) {
    for (const file of listTsFiles(dir)) {
      if (/tenantI18n|lib\/tenantI18n/.test(read(file))) {
        hits.push(file);
      }
    }
  }
  return hits;
}

describe("V31 L3.1 tenant i18n — surface isolation", () => {
  it("Licensee Master may reuse catalogs but must not use tenant org authority", () => {
    const licenseeFiles = [
      ...listTsFiles("app/licensee"),
      ...listTsFiles("components/licensee"),
      ...listTsFiles("lib/licensee"),
    ];
    for (const file of licenseeFiles) {
      if (file === "app/licensee/login/page.tsx") {
        const login = read(file);
        assert.doesNotMatch(login, /getLicenseeLocalization|getTenantMessages/);
        assert.doesNotMatch(login, /default_language/);
        continue;
      }
      const source = read(file);
      assert.doesNotMatch(
        source,
        /from ["']@\/lib\/tenantI18n\/getTenantLocalization["']/,
        `${file} must not import tenant-org localization`,
      );
      assert.doesNotMatch(
        source,
        /from ["']@\/services\/organizationService["']/,
        `${file} must not use tenant organization context`,
      );
      assert.doesNotMatch(
        source,
        /resolveOrganizationLanguage\s*\(/,
        `${file} must not resolve organizations.language`,
      );
    }
    const resolver = read("lib/licensee/getLicenseeLocalization.ts");
    assert.match(resolver, /getTenantMessages/);
    assert.match(resolver, /toFormattingLocale/);
    assert.doesNotMatch(
      resolver,
      /from ["']@\/lib\/tenantI18n\/getTenantLocalization["']/,
    );
    assert.doesNotMatch(
      resolver,
      /from ["']@\/services\/organizationService["']/,
    );
    assert.doesNotMatch(resolver, /resolveOrganizationLanguage/);
    assert.doesNotMatch(resolver, /organizations\.language/);
  });

  it("Super Admin files do not import tenantI18n", () => {
    assert.deepEqual(
      filesImportingTenantI18n(["app/super", "components/superAdmin"]),
      [],
    );
  });

  it("pre-auth and login files do not import tenantI18n", () => {
    assert.deepEqual(
      filesImportingTenantI18n(["app/login", "app/auth"]),
      [],
    );
  });
});

describe("V31 L3.2 tenant chrome — shared-component isolation", () => {
  it("cross-surface shared components do not import tenantI18n", () => {
    const shared = [
      "components/branding/AthenaBrandLink.tsx",
      "components/auth/AthenaHeaderActions.tsx",
      "components/auth/LogoutCta.tsx",
      "components/ui/AthenaCollapsibleSection.tsx",
      "components/deployment/CopyButton.tsx",
      "components/deployment/AssetUsageTagControls.tsx",
      "components/deployment/ContinueButton.tsx",
      "components/assetBlueprints/CollapsiblePromptBlock.tsx",
      "components/conversation/AthenaConversationPanel.tsx",
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
      "services/assetContinuation/continueInExternalWorkspace.ts",
    ];
    for (const file of shared) {
      const source = read(file);
      assert.doesNotMatch(source, /tenantI18n|lib\/tenantI18n/);
      assert.doesNotMatch(source, /getTenantLocalization|getTenantMessages/);
      assert.doesNotMatch(source, /resolveOrganizationLanguage/);
    }
  });
});

describe("V31 L3.1 tenant i18n — generated content isolation", () => {
  it("documents that tenant i18n is presentation-only", () => {
    const types = read("lib/tenantI18n/types.ts");
    assert.match(types, /APPLICATION PRESENTATION only/);
    assert.match(types, /workers/);
    assert.match(types, /generation prompt builders/);
    assert.match(types, /Brain compilation/);
    assert.match(types, /Account\/UI language/);
    assert.match(types, /Structural generation keys/);
    assert.match(types, /Asset TYPE display labels/);
    assert.match(types, /Generated asset BODY/);
    assert.match(types, /Generated-content language/);
    assert.match(types, /never Account Language/);
    assert.match(types, /Do not bind generated-content language to organizations\.language/);
    assert.match(types, /Do not rewrite generated bodies/);
  });

  it("BackToMasterCta uses Master language, not tenant org language", () => {
    const source = read("components/licensee/BackToMasterCta.tsx");
    assert.match(source, /getLicenseeLocalization/);
    assert.doesNotMatch(
      source,
      /from ["']@\/lib\/tenantI18n\/getTenantLocalization["']/,
    );
    assert.doesNotMatch(
      source,
      /from ["']@\/services\/organizationService["']/,
    );
    assert.doesNotMatch(source, /resolveOrganizationLanguage/);
  });

  it("workers do not import tenantI18n", () => {
    assert.deepEqual(filesImportingTenantI18n(["workers"]), []);
  });

  it("generation and prompt modules do not import tenantI18n", () => {
    const hits = filesImportingTenantI18n([
      "services/ai/prompts",
      "services/identity/prompts",
      "services/assetBlueprints/prompts",
      "services/brain",
      "services/generationJobs",
    ]);
    const generationHits = listTsFiles("services").filter((file) => {
      if (hits.includes(file)) return false;
      if (
        !/prompt|generation|packageWriter|package_json/i.test(file) &&
        !/prompt|GenerationJob|packageWriter/i.test(read(file).slice(0, 400))
      ) {
        return false;
      }
      return /tenantI18n|lib\/tenantI18n/.test(read(file));
    });
    assert.deepEqual([...hits, ...generationHits], []);
  });
});
