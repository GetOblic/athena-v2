import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertBrandLogoPathForOrganization,
  assertBrandProfilePicturePathForOrganization,
  BRAND_LOGO_ALLOWED_MIME_TYPES,
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_SIGNED_URL_TTL_SECONDS,
  buildBrandLogoObjectPath,
  buildBrandProfilePictureObjectPath,
  isAllowedBrandLogoMimeType,
} from "../../services/identity/brandIdentity";
import {
  executeBrandLogoRemoval,
  executeBrandLogoReplacement,
} from "../../services/identity/brandLogoReplacement";

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

describe("Sprint 5 — Client Profile Picture", () => {
  it("1/2. migration adds brand_profile_picture_storage_path to organizations only", () => {
    const migration = read(
      "supabase/migrations/20260714000003_add_brand_profile_picture.sql",
    );
    assert.match(migration, /alter table organizations/i);
    assert.match(migration, /brand_profile_picture_storage_path/);
    assert.doesNotMatch(migration, /alter table athena_identity/i);
    assert.doesNotMatch(migration, /drop column/i);
    assert.doesNotMatch(migration, /brand_logo_storage_path/);
    assert.doesNotMatch(migration, /create bucket|insert into storage\.buckets/i);

    for (const name of readdirSync(join(ROOT, "supabase/migrations"))) {
      if (!name.endsWith(".sql")) continue;
      const sql = read(`supabase/migrations/${name}`);
      if (
        /alter table athena_identity[\s\S]*brand_profile_picture_storage_path/i.test(
          sql,
        )
      ) {
        assert.fail(`${name} adds profile picture to athena_identity`);
      }
    }
  });

  it("3. Profile Picture UI renders after Logo and before Color Palette", () => {
    const section = read("components/identity/BrandIdentitySection.tsx");
    assert.match(section, /Profile Picture/);
    assert.match(section, /Upload picture|Replace picture/);
    assert.match(section, /Remove picture/);
    assert.match(section, /rounded-full/);
    assert.match(section, /\/api\/identity\/profile-picture/);

    const logoIdx = section.indexOf("{messages.logo}");
    const pictureIdx = section.indexOf("{messages.profilePicture}");
    const paletteIdx = section.indexOf("{messages.colorPalette}");
    assert.ok(logoIdx > 0 && pictureIdx > logoIdx && paletteIdx > pictureIdx);
  });

  it("4/5/6. valid PNG, JPEG, and WebP MIME types are allowed", () => {
    assert.equal(isAllowedBrandLogoMimeType("image/png"), true);
    assert.equal(isAllowedBrandLogoMimeType("image/jpeg"), true);
    assert.equal(isAllowedBrandLogoMimeType("image/webp"), true);
    assert.deepEqual([...BRAND_LOGO_ALLOWED_MIME_TYPES], [
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("7/8. invalid MIME and SVG are rejected", () => {
    assert.equal(isAllowedBrandLogoMimeType("image/gif"), false);
    assert.equal(isAllowedBrandLogoMimeType("image/svg+xml"), false);
    assert.equal(isAllowedBrandLogoMimeType("application/pdf"), false);
  });

  it("9. oversized image policy remains 2 MiB", () => {
    assert.equal(BRAND_LOGO_MAX_BYTES, 2 * 1024 * 1024);
    const storage = read("services/identity/brandProfilePictureStorage.ts");
    assert.match(storage, /BRAND_LOGO_MAX_BYTES/);
    assert.match(storage, /2 MB or smaller/);
  });

  it("10. first upload stores profile-picture path under distinct directory", () => {
    assert.equal(
      buildBrandProfilePictureObjectPath({
        organizationId: "org-aaa",
        mimeType: "image/png",
        objectId: "pic-1",
      }),
      "org-aaa/identity/profile-picture/pic-1.png",
    );
    assert.equal(
      buildBrandLogoObjectPath({
        organizationId: "org-aaa",
        mimeType: "image/png",
        objectId: "logo-1",
      }),
      "org-aaa/identity/logo/logo-1.png",
    );
    assert.equal(BRAND_LOGO_BUCKET, "client-brand-assets");
  });

  it("11. replacement follows safe ordering via shared orchestration", async () => {
    const events: string[] = [];
    const path = await executeBrandLogoReplacement(
      {
        uploadNewObject: async () => {
          events.push("upload:new");
          return "org-x/identity/profile-picture/new.png";
        },
        updateIdentityPath: async (storagePath) => {
          events.push(`db:${storagePath}`);
        },
        deleteObject: async (storagePath) => {
          events.push(`delete:${storagePath}`);
        },
        logCleanupFailure: () => {
          events.push("log");
        },
      },
      "org-x/identity/profile-picture/old.png",
    );

    assert.equal(path, "org-x/identity/profile-picture/new.png");
    assert.deepEqual(events, [
      "upload:new",
      "db:org-x/identity/profile-picture/new.png",
      "delete:org-x/identity/profile-picture/old.png",
    ]);
  });

  it("12. DB update failure compensates new upload", async () => {
    const events: string[] = [];
    await assert.rejects(
      () =>
        executeBrandLogoReplacement(
          {
            uploadNewObject: async () => {
              events.push("upload:new");
              return "org-x/identity/profile-picture/new.png";
            },
            updateIdentityPath: async () => {
              events.push("db:fail");
              throw new Error("db failed");
            },
            deleteObject: async (storagePath) => {
              events.push(`delete:${storagePath}`);
            },
            logCleanupFailure: () => {
              events.push("log");
            },
          },
          "org-x/identity/profile-picture/old.png",
        ),
      /db failed/,
    );
    assert.deepEqual(events, [
      "upload:new",
      "db:fail",
      "delete:org-x/identity/profile-picture/new.png",
    ]);
  });

  it("13. old-object cleanup failure preserves new DB path", async () => {
    const events: string[] = [];
    const path = await executeBrandLogoReplacement(
      {
        uploadNewObject: async () =>
          "org-x/identity/profile-picture/new.png",
        updateIdentityPath: async (storagePath) => {
          events.push(`db:${storagePath}`);
        },
        deleteObject: async (storagePath) => {
          events.push(`delete:${storagePath}`);
          if (storagePath.includes("old")) {
            throw new Error("old delete failed");
          }
        },
        logCleanupFailure: (context) => {
          events.push(`log:${context}`);
        },
      },
      "org-x/identity/profile-picture/old.png",
    );
    assert.equal(path, "org-x/identity/profile-picture/new.png");
    assert.ok(events.includes("db:org-x/identity/profile-picture/new.png"));
    assert.ok(events.includes("log:old_object_cleanup_failed"));
  });

  it("14. removal clears DB before object deletion", async () => {
    const events: string[] = [];
    await executeBrandLogoRemoval(
      {
        clearIdentityPath: async () => {
          events.push("db:null");
        },
        deleteObject: async (storagePath) => {
          events.push(`delete:${storagePath}`);
        },
        logCleanupFailure: () => {
          events.push("log");
        },
      },
      "org-x/identity/profile-picture/old.png",
    );
    assert.deepEqual(events, [
      "db:null",
      "delete:org-x/identity/profile-picture/old.png",
    ]);
  });

  it("15. removal deletion failure leaves DB empty", async () => {
    const events: string[] = [];
    await executeBrandLogoRemoval(
      {
        clearIdentityPath: async () => {
          events.push("db:null");
        },
        deleteObject: async () => {
          events.push("delete:fail");
          throw new Error("delete failed");
        },
        logCleanupFailure: (context) => {
          events.push(`log:${context}`);
        },
      },
      "org-x/identity/profile-picture/old.png",
    );
    assert.deepEqual(events, [
      "db:null",
      "delete:fail",
      "log:remove_object_cleanup_failed",
    ]);
  });

  it("16/17. exact organization path prefix enforced; cross-org rejected", () => {
    assert.equal(
      assertBrandProfilePicturePathForOrganization(
        "org-x/identity/profile-picture/a.png",
        "org-x",
      ),
      "org-x/identity/profile-picture/a.png",
    );
    assert.throws(
      () =>
        assertBrandProfilePicturePathForOrganization(
          "org-x/identity/profile-picture/a.png",
          "org-y",
        ),
      /organization scope/i,
    );
    assert.throws(
      () =>
        assertBrandProfilePicturePathForOrganization(
          "org-x/identity/logo/a.png",
          "org-x",
        ),
      /organization scope/i,
    );
  });

  it("18/19. traversal and full URLs are rejected as durable paths", () => {
    assert.throws(
      () =>
        assertBrandProfilePicturePathForOrganization(
          "org-x/identity/profile-picture/../logo/x.png",
          "org-x",
        ),
      /Invalid profile picture storage path/i,
    );
    assert.throws(
      () =>
        assertBrandProfilePicturePathForOrganization(
          "org-x/identity/profile-picture/%2e%2e/x.png",
          "org-x",
        ),
      /Invalid/i,
    );
    assert.throws(
      () =>
        assertBrandProfilePicturePathForOrganization(
          "https://cdn.example.com/pic.png",
          "org-x",
        ),
      /Invalid/i,
    );
    assert.throws(
      () =>
        assertBrandProfilePicturePathForOrganization(
          "org-x/identity/profile-picture/a.png?x=1",
          "org-x",
        ),
      /Invalid/i,
    );
    assert.throws(
      () =>
        assertBrandProfilePicturePathForOrganization(
          "org-x/identity/profile-picture/nested/a.png",
          "org-x",
        ),
      /Invalid/i,
    );
  });

  it("20/21. signed URL is not persisted; reload restores preview", () => {
    assert.equal(BRAND_LOGO_SIGNED_URL_TTL_SECONDS, 3600);
    const service = read("services/identity/brandIdentityService.ts");
    assert.match(service, /resolveOrganizationBrandProfilePicturePreviewUrl/);
    assert.match(service, /brand_profile_picture_storage_path/);
    assert.doesNotMatch(
      service,
      /brand_profile_picture_signed|signedUrl.*upsert/i,
    );

    const page = read("app/identity/page.tsx");
    assert.match(page, /resolveOrganizationBrandProfilePicturePreviewUrl/);
    assert.match(page, /initialProfilePicturePreviewUrl/);
  });

  it("22/23/24. logo and profile picture paths/columns stay isolated", () => {
    const logoRoute = read("app/api/identity/brand-logo/route.ts");
    assert.match(logoRoute, /replaceOrganizationBrandLogo/);
    assert.doesNotMatch(logoRoute, /ProfilePicture|profile-picture/);

    const pictureRoute = read("app/api/identity/profile-picture/route.ts");
    assert.match(pictureRoute, /replaceOrganizationBrandProfilePicture/);
    assert.doesNotMatch(pictureRoute, /replaceOrganizationBrandLogo/);

    const service = read("services/identity/brandIdentityService.ts");
    const logoSetter = service.slice(
      service.indexOf("async function setOrganizationBrandLogoPath"),
      service.indexOf("export async function replaceOrganizationBrandLogo"),
    );
    assert.match(logoSetter, /brand_logo_storage_path/);
    assert.doesNotMatch(logoSetter, /brand_profile_picture_storage_path/);

    const pictureSetter = service.slice(
      service.indexOf("async function setOrganizationBrandProfilePicturePath"),
      service.indexOf(
        "export async function replaceOrganizationBrandProfilePicture",
      ),
    );
    assert.match(pictureSetter, /brand_profile_picture_storage_path/);
    assert.doesNotMatch(pictureSetter, /brand_logo_storage_path/);

    assert.throws(
      () =>
        assertBrandLogoPathForOrganization(
          "org-x/identity/profile-picture/a.png",
          "org-x",
        ),
      /organization scope/i,
    );
  });

  it("25/26. brand color/font save path does not touch profile picture", () => {
    const service = read("services/identity/brandIdentityService.ts");
    const updateFn = service.slice(
      service.indexOf("export async function updateOrganizationBrandIdentity"),
      service.indexOf("async function setOrganizationBrandLogoPath"),
    );
    assert.match(updateFn, /brand_primary_color/);
    assert.match(updateFn, /brand_font/);
    assert.doesNotMatch(updateFn, /brand_profile_picture_storage_path/);
    assert.doesNotMatch(updateFn, /brand_logo_storage_path/);
  });

  it("27-30. Train Athena / generation / EV / model behavior unchanged", () => {
    const page = read("app/identity/page.tsx");
    const brainSave = page.slice(
      page.indexOf("async function saveIdentity"),
      page.indexOf("async function saveBrandIdentity"),
    );
    assert.match(brainSave, /upsertAthenaIdentity/);
    assert.doesNotMatch(brainSave, /ProfilePicture|profile-picture|brand_/);

    const service = read("services/identity/brandIdentityService.ts");
    assert.doesNotMatch(service, /compileMasterIdentityProfile/);
    assert.doesNotMatch(
      service,
      /enqueueGeneration|generation_jobs|createExecutiveVersion|generateText|openai|gemini/i,
    );

    const route = read("app/api/identity/profile-picture/route.ts");
    assert.doesNotMatch(route, /compileMasterIdentityProfile|enqueueGeneration/);
  });

  it("31. tenant isolation remains enforced via session organization context", () => {
    const route = read("app/api/identity/profile-picture/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /organizationId,/);
    assert.doesNotMatch(
      route,
      /body\.organizationId|form\.get\(["']organization/i,
    );
    assert.doesNotMatch(route, /supabaseAdmin\.auth|service_role/);
  });

  it("Brain/worker modules do not consume profile picture fields", () => {
    const forbiddenRoots = [
      "services/brain",
      "services/generationJobs",
      "services/executiveVersions",
      "services/assetBlueprints",
      "workers",
    ];
    const hits: string[] = [];
    for (const root of forbiddenRoots) {
      for (const file of listTsFiles(root)) {
        const source = read(file);
        if (
          /brand_profile_picture_storage_path|replaceOrganizationBrandProfilePicture|uploadBrandProfilePicture/.test(
            source,
          )
        ) {
          hits.push(file);
        }
      }
    }
    assert.deepEqual(hits, []);
  });
});
