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
  it("Licensee files do not import tenantI18n", () => {
    assert.deepEqual(
      filesImportingTenantI18n(["app/licensee", "components/licensee"]),
      [],
    );
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
      "components/licensee/BackToMasterCta.tsx",
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
