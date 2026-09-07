import "./organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  DEFAULT_ORGANIZATION_LANGUAGE,
  ORGANIZATION_LANGUAGES,
  ORGANIZATION_LANGUAGE_LABELS,
  OrganizationLanguageInvalidError,
  isOrganizationLanguage,
  organizationLanguageLabel,
  parseOrganizationLanguage,
  resolveOrganizationLanguageValue,
} from "../../services/organizationLanguage";
import {
  OrganizationLanguageNotFoundError,
  resolveOrganizationLanguage,
  updateOrganizationLanguage,
} from "../../services/organizationService";

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

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  language?: string | null;
  brand_primary_color?: string | null;
  ai_workspace_preferences?: Record<string, unknown> | null;
  last_visited_at?: string | null;
};

type CallLog = {
  tables: string[];
  updates: Array<{
    table: string;
    values: Record<string, unknown>;
    filters: Record<string, string>;
  }>;
};

function installOrganizationFixture(rows: Record<string, OrganizationRow>): CallLog {
  const calls: CallLog = { tables: [], updates: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    calls.tables.push(table);
    const filters: Record<string, string> = {};
    let pendingUpdate: Record<string, unknown> | null = null;

    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async () => {
        if (table !== "organizations") {
          return { data: null, error: null };
        }
        const id = filters.id;
        return { data: id ? (rows[id] ?? null) : null, error: null };
      },
      update: (values: Record<string, unknown>) => {
        pendingUpdate = values;
        return builder;
      },
      single: async () => {
        if (table !== "organizations") {
          return { data: null, error: { message: "unexpected table" } };
        }
        const id = filters.id;
        const existing = id ? rows[id] : undefined;
        if (!existing || !pendingUpdate) {
          return { data: null, error: { message: "not found" } };
        }
        calls.updates.push({
          table,
          values: pendingUpdate,
          filters: { ...filters },
        });
        Object.assign(existing, pendingUpdate);
        return {
          data: { language: existing.language },
          error: null,
        };
      },
    };

    return builder;
  };

  return calls;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

describe("V31 L1 organization language — domain contract", () => {
  it("contains exactly the six supported language codes", () => {
    assert.deepEqual([...ORGANIZATION_LANGUAGES], [
      "en",
      "fr",
      "es",
      "it",
      "de",
      "pt",
    ]);
    assert.equal(ORGANIZATION_LANGUAGES.length, 6);
  });

  it("defaults and falls back to English", () => {
    assert.equal(DEFAULT_ORGANIZATION_LANGUAGE, "en");
    assert.equal(resolveOrganizationLanguageValue(undefined), "en");
    assert.equal(resolveOrganizationLanguageValue(null), "en");
    assert.equal(resolveOrganizationLanguageValue(""), "en");
    assert.equal(resolveOrganizationLanguageValue("zz"), "en");
    assert.equal(resolveOrganizationLanguageValue("html"), "en");
  });

  it("exposes native display labels", () => {
    assert.deepEqual(ORGANIZATION_LANGUAGE_LABELS, {
      en: "English",
      fr: "Français",
      es: "Español",
      it: "Italiano",
      de: "Deutsch",
      pt: "Português",
    });
    assert.equal(organizationLanguageLabel("en"), "English");
    assert.equal(organizationLanguageLabel("fr"), "Français");
    assert.equal(organizationLanguageLabel("es"), "Español");
    assert.equal(organizationLanguageLabel("it"), "Italiano");
    assert.equal(organizationLanguageLabel("de"), "Deutsch");
    assert.equal(organizationLanguageLabel("pt"), "Português");
  });

  it("accepts valid persisted values and rejects invalid ones", () => {
    for (const code of ORGANIZATION_LANGUAGES) {
      assert.equal(isOrganizationLanguage(code), true);
      assert.equal(parseOrganizationLanguage(code), code);
      assert.equal(resolveOrganizationLanguageValue(code), code);
    }
    assert.equal(parseOrganizationLanguage(" FR "), "fr");
    assert.equal(isOrganizationLanguage("en-US"), false);
    assert.equal(isOrganizationLanguage("html"), false);
    assert.throws(
      () => parseOrganizationLanguage("en-US"),
      OrganizationLanguageInvalidError,
    );
    assert.throws(
      () => parseOrganizationLanguage("english"),
      OrganizationLanguageInvalidError,
    );
    assert.throws(
      () => parseOrganizationLanguage(null),
      OrganizationLanguageInvalidError,
    );
  });
});

describe("V31 L1 organization language — migration contract", () => {
  it("adds organizations.language as NOT NULL default en with exact CHECK", () => {
    const migration = read(
      "supabase/migrations/20260831000001_add_organization_language.sql",
    );
    assert.match(migration, /alter table organizations/i);
    assert.match(migration, /add column if not exists language text not null default 'en'/i);
    assert.match(migration, /organizations_language_check/);
    assert.match(
      migration,
      /check \(language in \('en', 'fr', 'es', 'it', 'de', 'pt'\)\)/,
    );
    assert.doesNotMatch(migration, /alter table athena_identity/i);
    assert.doesNotMatch(migration, /ai_workspace_preferences/);
    assert.doesNotMatch(migration, /organization_members/);
    assert.doesNotMatch(migration, /drop column/i);
    assert.doesNotMatch(migration, /update organizations/i);
  });
});

describe("V31 L1 organization language — resolver", () => {
  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("resolves a valid persisted organization language", async () => {
    installOrganizationFixture({
      "org-fr": {
        id: "org-fr",
        name: "Studio",
        slug: "studio",
        language: "fr",
      },
    });
    assert.equal(await resolveOrganizationLanguage("org-fr"), "fr");
  });

  it("falls back to English for missing organization or pre-migration rows", async () => {
    installOrganizationFixture({
      "org-legacy": {
        id: "org-legacy",
        name: "Legacy",
        slug: "legacy",
      },
    });
    assert.equal(await resolveOrganizationLanguage("org-legacy"), "en");
    assert.equal(await resolveOrganizationLanguage("missing"), "en");
  });

  it("reads organizations by organizationId only and does not infer other sources", () => {
    const service = read("services/organizationService.ts");
    const resolverStart = service.indexOf(
      "export async function resolveOrganizationLanguage",
    );
    const resolverBodyStart = service.indexOf("{", resolverStart);
    const resolver = service.slice(
      resolverStart,
      service.indexOf("\n}", resolverBodyStart) + 2,
    );
    assert.match(resolver, /getOrganizationById/);
    assert.match(resolver, /resolveOrganizationLanguageValue\(organization\?\.language\)/);
    assert.doesNotMatch(resolver, /html_language|hreflang/);
    assert.doesNotMatch(resolver, /geographic_reach/);
    assert.doesNotMatch(resolver, /sessionStorage|navigator\.language|accept-language/i);
    assert.doesNotMatch(resolver, /\.from\("athena_identity"\)|ai_workspace_preferences/);

    const domain = read("services/organizationLanguage.ts");
    assert.doesNotMatch(domain, /html_language|hreflang|geographic_reach/);
    assert.doesNotMatch(domain, /sessionStorage|navigator\.language|document\.cookie/);
  });
});

describe("V31 L1 organization language — mutation foundation", () => {
  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("updates only the authorized organization language", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Alpha",
        slug: "alpha",
        language: "en",
        brand_primary_color: "#FF6600",
        ai_workspace_preferences: { preferredAiWorkspace: "chatgpt" },
        last_visited_at: "2026-08-01T00:00:00.000Z",
      },
      "org-b": {
        id: "org-b",
        name: "Beta",
        slug: "beta",
        language: "en",
        brand_primary_color: "#000000",
      },
    };
    const calls = installOrganizationFixture(rows);

    const result = await updateOrganizationLanguage({
      organizationId: "org-a",
      language: "de",
    });

    assert.equal(result, "de");
    assert.equal(rows["org-a"].language, "de");
    assert.equal(rows["org-b"].language, "en");
    assert.equal(rows["org-a"].name, "Alpha");
    assert.equal(rows["org-a"].brand_primary_color, "#FF6600");
    assert.deepEqual(rows["org-a"].ai_workspace_preferences, {
      preferredAiWorkspace: "chatgpt",
    });
    assert.equal(rows["org-a"].last_visited_at, "2026-08-01T00:00:00.000Z");
    assert.deepEqual(calls.tables.every((table) => table === "organizations"), true);
    assert.equal(calls.updates.length, 1);
    assert.deepEqual(Object.keys(calls.updates[0].values).sort(), [
      "language",
      "updated_at",
    ]);
    assert.equal(calls.updates[0].filters.id, "org-a");
    assert.doesNotMatch(JSON.stringify(calls.tables), /athena_identity/);
  });

  it("fails closed for invalid language and missing organization", async () => {
    installOrganizationFixture({
      "org-a": {
        id: "org-a",
        name: "Alpha",
        slug: "alpha",
        language: "en",
      },
    });

    await assert.rejects(
      () =>
        updateOrganizationLanguage({
          organizationId: "org-a",
          language: "en-US",
        }),
      OrganizationLanguageInvalidError,
    );
    await assert.rejects(
      () =>
        updateOrganizationLanguage({
          organizationId: "missing",
          language: "fr",
        }),
      OrganizationLanguageNotFoundError,
    );
    await assert.rejects(
      () =>
        updateOrganizationLanguage({
          organizationId: "   ",
          language: "fr",
        }),
      OrganizationLanguageNotFoundError,
    );
  });

  it("source contract: mutation is org-scoped and has no Brain/generation side effects", () => {
    const service = read("services/organizationService.ts");
    const mutation = service.slice(
      service.indexOf("export async function updateOrganizationLanguage"),
    );
    assert.match(mutation, /parseOrganizationLanguage/);
    assert.match(mutation, /\.from\("organizations"\)/);
    assert.match(mutation, /\.eq\("id", organizationId\)/);
    assert.match(mutation, /language,/);
    assert.match(mutation, /updated_at/);
    assert.doesNotMatch(mutation, /\.from\("athena_identity"\)/);
    assert.doesNotMatch(mutation, /saveIdentity|upsertAthenaIdentity/);
    assert.doesNotMatch(mutation, /compileMasterIdentityProfile/);
    assert.doesNotMatch(mutation, /deep-scrape|deepScrape|Deep Scrape/i);
    assert.doesNotMatch(
      mutation,
      /enqueue|generation_jobs|createExecutiveVersion|package_json/i,
    );
    assert.doesNotMatch(mutation, /formData\.get\(["']organization/);
    assert.doesNotMatch(mutation, /\bname\s*:|\bslug\s*:|ai_workspace_preferences/);
  });
});

describe("V31 L1 organization language — Brain display and isolation", () => {
  it("Identity displays Account Language as read-only account configuration", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /requireCurrentOrganizationContext/);
    assert.match(page, /getTenantLocalization/);
    assert.match(page, /organizationLanguageLabel/);
    assert.match(
      read("components/identity/IdentityOtherTools.tsx"),
      /messages\.accountLanguage/,
    );
    assert.doesNotMatch(page, /resolveOrganizationLanguage/);
    assert.doesNotMatch(page, /name=["']account_language["']/);
    assert.doesNotMatch(page, /<select[^>]*language/i);
    assert.doesNotMatch(page, /updateOrganizationLanguage/);
    assert.doesNotMatch(page, /formData\.get\(["']organization/);
    assert.doesNotMatch(page, /html_language|hreflang|navigator\.language/);
  });

  it("language save on Brain is not wired and Brain save remains identity-only", () => {
    const page = read("app/identity/page.tsx");
    const brainSave = page.slice(
      page.indexOf("async function saveIdentity"),
      page.indexOf("async function saveBrandIdentity"),
    );
    assert.match(brainSave, /upsertAthenaIdentity/);
    assert.doesNotMatch(brainSave, /updateOrganizationLanguage|language/);
  });

  it("tenant isolation and Super Admin / Licensee exclusion remain intact", () => {
    const org = read("services/organizationService.ts");
    assert.match(org, /isGetOblicSuperAdminUser/);
    assert.match(org, /SuperAdminProvisionBlockedError/);
    assert.match(org, /isLicenseeMasterUser/);
    assert.match(org, /LicenseeMasterProvisionBlockedError/);
    assert.match(org, /redirect\("\/super"\)/);
    assert.match(org, /redirect\("\/licensee"\)/);
    assert.match(org, /requireCurrentOrganizationContext/);
    assert.match(
      read("supabase/migrations/20260709000001_create_organizations.sql"),
      /constraint organization_members_user_id_unique unique \(user_id\)/,
    );
  });

  it("existing organization creation omits language and inherits database default", () => {
    const org = read("services/organizationService.ts");
    const createFn = org.slice(
      org.indexOf("async function createOrganizationForUser"),
      org.indexOf("export async function getOrganizationMembership"),
    );
    assert.match(createFn, /\.insert\(/);
    assert.match(createFn, /name: organizationName/);
    assert.match(createFn, /slug/);
    assert.match(createFn, /options\?\.language/);
    assert.doesNotMatch(createFn, /language:\s*["']en["']/);
    assert.doesNotMatch(
      createFn,
      /navigator\.language|accept-language|geographic_reach|html_language/i,
    );

    const saas = read(
      "supabase/migrations/20260710000001_saas_tenant_provisioning.sql",
    );
    assert.match(saas, /insert into organizations \(name, slug\)/);
  });

  it("language contract is not duplicated across application sources", () => {
    const allowlisted = new Set([
      "services/organizationLanguage.ts",
      "services/organizationService.ts",
      "services/licensee/licenseeSubAccounts.ts",
      "services/superAdmin/superAdminAccounts.ts",
      "app/identity/page.tsx",
      "app/licensee/sub-accounts/new/page.tsx",
      "lib/tenantI18n/getTenantLocalization.ts",
      "tests/organization/organizationLanguage.test.ts",
    ]);
    const hits: string[] = [];
    for (const file of [
      ...listTsFiles("services"),
      ...listTsFiles("app"),
      ...listTsFiles("lib"),
      ...listTsFiles("workers"),
    ]) {
      if (allowlisted.has(file)) continue;
      const source = read(file);
      if (
        /ORGANIZATION_LANGUAGES|parseOrganizationLanguage|resolveOrganizationLanguage/.test(
          source,
        )
      ) {
        hits.push(file);
      }
    }
    assert.deepEqual(hits, []);
  });

  it("L1 does not change generation, workers, or historical artifact writers", () => {
    const forbidden = [
      "services/brain/brainContextBuilder.ts",
      "workers/athenaWorker.ts",
      "services/generationJobs/generationJobService.ts",
      "services/identity/identityService.ts",
      "services/identity/prompts/masterIdentityProfilePrompt.ts",
    ];
    for (const file of forbidden) {
      const source = read(file);
      assert.doesNotMatch(source, /resolveOrganizationLanguage|ORGANIZATION_LANGUAGES/);
      assert.doesNotMatch(source, /updateOrganizationLanguage/);
    }
  });
});
