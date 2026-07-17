import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertBrandLogoPathForOrganization,
  BRAND_FONT_OPTIONS,
  BRAND_LOGO_ALLOWED_MIME_TYPES,
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_MAX_BYTES,
  buildBrandLogoObjectPath,
  isAllowedBrandLogoMimeType,
  normalizeBrandFont,
  normalizeBrandHexColor,
} from "../../services/identity/brandIdentity";

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

describe("Client Brand Identity — page composition", () => {
  it("renders Brand Identity section and existing Brain fields", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /BrandIdentitySection/);
    assert.match(page, /getAthenaIdentityByUserId/);
    assert.match(page, /getOrganizationBrandIdentity/);
    assert.match(page, /greeting_name/);
    assert.match(page, /upsertAthenaIdentity/);
    assert.match(page, /updateOrganizationBrandIdentity/);
    assert.doesNotMatch(page, /updateAthenaBrandIdentity/);
  });
});

describe("Client Brand Identity — color and font validation", () => {
  it("normalizes and rejects hex colors", () => {
    assert.equal(normalizeBrandHexColor("ff6600"), "#FF6600");
    assert.equal(normalizeBrandHexColor("#ff6600"), "#FF6600");
    assert.equal(normalizeBrandHexColor(""), null);
    assert.throws(() => normalizeBrandHexColor("#FFF"), /hex/i);
  });

  it("allowlists fonts and accepts empty", () => {
    assert.equal(normalizeBrandFont("geist"), "geist");
    assert.equal(normalizeBrandFont(""), null);
    assert.throws(() => normalizeBrandFont("Comic Sans"), /font/i);
    assert.ok(BRAND_FONT_OPTIONS.some((option) => option.value === ""));
  });
});

describe("Client Brand Identity — organization ownership", () => {
  it("1/2. migration adds brand fields to organizations, not athena_identity", () => {
    const migration = read(
      "supabase/migrations/20260714000002_add_client_brand_identity.sql",
    );
    assert.match(migration, /alter table organizations/i);
    assert.match(migration, /brand_logo_storage_path/);
    assert.match(migration, /brand_primary_color/);
    assert.match(migration, /brand_secondary_color/);
    assert.match(migration, /brand_accent_color/);
    assert.match(migration, /brand_background_color/);
    assert.match(migration, /brand_font/);
    assert.doesNotMatch(migration, /alter table athena_identity/i);
    assert.doesNotMatch(migration, /athena_identity\.brand_/);
    assert.match(migration, /on conflict \(id\) do nothing/i);
    assert.match(migration, /client-brand-assets/);

    const migrationsDir = join(ROOT, "supabase/migrations");
    for (const name of readdirSync(migrationsDir)) {
      if (!name.endsWith(".sql")) continue;
      const sql = read(`supabase/migrations/${name}`);
      if (
        /alter table athena_identity[\s\S]*brand_logo_storage_path/i.test(sql)
      ) {
        assert.fail(`${name} still adds brand columns to athena_identity`);
      }
    }
  });

  it("3/4/5. brand save targets organizations with session org id and narrow payload", () => {
    const service = read("services/identity/brandIdentityService.ts");
    assert.match(service, /updateOrganizationBrandIdentity/);
    assert.match(service, /\.from\("organizations"\)/);
    assert.match(service, /\.eq\("id", organizationId\)/);
    assert.match(service, /brand_primary_color/);
    assert.match(service, /brand_font/);
    assert.doesNotMatch(service, /\.from\("athena_identity"\)/);
    assert.doesNotMatch(service, /getAthenaIdentityByUserId/);

    const updateFn = service.slice(
      service.indexOf("export async function updateOrganizationBrandIdentity"),
    );
    const payloadEnd = updateFn.indexOf(".eq(\"id\", organizationId)");
    const payload = updateFn.slice(0, payloadEnd);
    assert.doesNotMatch(payload, /\bname\b\s*:/);
    assert.doesNotMatch(payload, /\bslug\b\s*:/);

    const page = read("app/identity/page.tsx");
    const brandSave = page.slice(page.indexOf("saveBrandIdentity"));
    assert.match(brandSave, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(brandSave, /formData\.get\(["']organization/);
    assert.doesNotMatch(brandSave, /upsertAthenaIdentity/);
  });

  it("6. missing organization returns controlled failure", () => {
    const service = read("services/identity/brandIdentityService.ts");
    assert.match(service, /OrganizationBrandNotFoundError/);
    assert.match(service, /Organization not found/);
    const page = read("app/identity/page.tsx");
    assert.match(page, /OrganizationBrandNotFoundError/);
  });

  it("7-11. org branding is shared and isolated by session organizationId", () => {
    const service = read("services/identity/brandIdentityService.ts");
    assert.match(service, /getOrganizationBrandIdentity/);
    assert.match(service, /getOrganizationById/);
    assert.match(service, /\.eq\("id", organizationId\)/);

    const route = read("app/api/identity/brand-logo/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /organizationId,/);
    assert.doesNotMatch(route, /body\.organizationId|form\.get\(["']organization/i);

    // Path assertion rejects cross-org storage escape.
    assert.throws(
      () =>
        assertBrandLogoPathForOrganization(
          "org-x/identity/logo/a.png",
          "org-y",
        ),
      /organization scope/i,
    );
    assert.equal(
      assertBrandLogoPathForOrganization(
        "org-x/identity/logo/a.png",
        "org-x",
      ),
      "org-x/identity/logo/a.png",
    );
  });

  it("14/15. Brain save and brand save remain independent", () => {
    const page = read("app/identity/page.tsx");
    const brainSave = page.slice(
      page.indexOf("async function saveIdentity"),
      page.indexOf("async function saveBrandIdentity"),
    );
    assert.match(brainSave, /upsertAthenaIdentity/);
    assert.doesNotMatch(brainSave, /updateOrganizationBrandIdentity|brand_/);

    const brandSave = page.slice(page.indexOf("async function saveBrandIdentity"));
    assert.match(brandSave, /updateOrganizationBrandIdentity/);
    assert.doesNotMatch(brandSave, /upsertAthenaIdentity|compileMasterIdentityProfile/);

    const identityService = read("services/identity/identityService.ts");
    const upsertFn = identityService.slice(
      identityService.indexOf("export async function upsertAthenaIdentity"),
    );
    assert.doesNotMatch(
      upsertFn,
      /brand_primary_color|brand_font|brand_logo_storage_path/,
    );
  });

  it("16/17/18. brand save does not compile Brain or enqueue work", () => {
    const service = read("services/identity/brandIdentityService.ts");
    assert.doesNotMatch(service, /compileMasterIdentityProfile/);
    assert.doesNotMatch(
      service,
      /enqueueGeneration|generation_jobs|createExecutiveVersion/i,
    );
  });

  it("19. page reload restores organization branding", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /getOrganizationBrandIdentity/);
    assert.match(page, /resolveOrganizationBrandLogoPreviewUrl/);
    assert.match(page, /organizationBrand\?\.brand_primary_color/);
  });
});

describe("Client Brand Identity — logo storage isolation", () => {
  it("mime allowlist, size, path prefix", () => {
    assert.deepEqual([...BRAND_LOGO_ALLOWED_MIME_TYPES], [
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    assert.equal(isAllowedBrandLogoMimeType("image/svg+xml"), false);
    assert.equal(BRAND_LOGO_MAX_BYTES, 2 * 1024 * 1024);
    assert.equal(BRAND_LOGO_BUCKET, "client-brand-assets");
    assert.equal(
      buildBrandLogoObjectPath({
        organizationId: "org-aaa",
        mimeType: "image/png",
        objectId: "logo-1",
      }),
      "org-aaa/identity/logo/logo-1.png",
    );
  });
});

describe("Client Brand Identity — no intelligence consumption", () => {
  it("Brain/worker modules do not consume brand fields outside visual Deployment Assets", () => {
    const forbiddenRoots = [
      "services/brain",
      "services/generationJobs",
      "services/executiveVersions",
      "services/assetBlueprints",
      "workers",
    ];
    // Visual Deployment Assets intentionally consume OrganizationBrandIdentity
    // as creative direction (not Master Brain compile / EV persistence).
    const allowlisted = new Set([
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    ]);
    const hits: string[] = [];
    for (const root of forbiddenRoots) {
      for (const file of listTsFiles(root)) {
        if (allowlisted.has(file)) continue;
        const source = read(file);
        if (
          /brand_primary_color|brand_logo_storage_path|brand_profile_picture_storage_path|brand_font|updateOrganizationBrandIdentity|OrganizationBrandIdentity/.test(
            source,
          )
        ) {
          hits.push(file);
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  it("no stale athena_identity brand persistence remains", () => {
    const identityService = read("services/identity/identityService.ts");
    assert.doesNotMatch(
      identityService,
      /brand_logo_storage_path|brand_primary_color|brand_font/,
    );
    const brandService = read("services/identity/brandIdentityService.ts");
    assert.doesNotMatch(brandService, /\.from\("athena_identity"\)/);
    assert.doesNotMatch(brandService, /getAthenaIdentityByUserId|AthenaIdentity/);
    assert.match(brandService, /\.from\("organizations"\)/);
  });
});

describe("Client Brand Identity — UI", () => {
  it("logo, palette, and typography controls remain present", () => {
    const section = read("components/identity/BrandIdentitySection.tsx");
    assert.match(section, /Brand Identity/);
    assert.match(section, /brand_primary_color/);
    assert.match(section, /brand_font/);
    assert.match(section, /Upload logo|Replace logo/);
    assert.match(section, /Profile Picture/);
    assert.match(section, /Upload picture|Replace picture/);
  });
});
