import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeBrandLogoRemoval,
  executeBrandLogoReplacement,
} from "../../services/identity/brandLogoReplacement";
import { BRAND_LOGO_SIGNED_URL_TTL_SECONDS } from "../../services/identity/brandIdentity";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Organization brand logo replacement atomicity", () => {
  it("12. organization logo replacement retains safe atomic ordering", async () => {
    const events: string[] = [];
    const path = await executeBrandLogoReplacement(
      {
        uploadNewObject: async () => {
          events.push("upload:new");
          return "org-x/identity/logo/new.png";
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
      "org-x/identity/logo/old.png",
    );

    assert.equal(path, "org-x/identity/logo/new.png");
    assert.deepEqual(events, [
      "upload:new",
      "db:org-x/identity/logo/new.png",
      "delete:org-x/identity/logo/old.png",
    ]);
  });

  it("13. organization logo removal retains safe atomic ordering", async () => {
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
      "org-x/identity/logo/old.png",
    );
    assert.deepEqual(events, [
      "db:null",
      "delete:org-x/identity/logo/old.png",
    ]);
  });

  it("DB failure deletes new object and never deletes old", async () => {
    const events: string[] = [];
    await assert.rejects(
      () =>
        executeBrandLogoReplacement(
          {
            uploadNewObject: async () => {
              events.push("upload:new");
              return "org-x/identity/logo/new.png";
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
          "org-x/identity/logo/old.png",
        ),
      /db failed/,
    );
    assert.deepEqual(events, [
      "upload:new",
      "db:fail",
      "delete:org-x/identity/logo/new.png",
    ]);
  });

  it("upload failure never updates DB", async () => {
    const events: string[] = [];
    await assert.rejects(
      () =>
        executeBrandLogoReplacement(
          {
            uploadNewObject: async () => {
              events.push("upload:fail");
              throw new Error("upload failed");
            },
            updateIdentityPath: async () => {
              events.push("db");
            },
            deleteObject: async () => {
              events.push("delete");
            },
            logCleanupFailure: () => {
              events.push("log");
            },
          },
          "org-x/identity/logo/old.png",
        ),
      /upload failed/,
    );
    assert.deepEqual(events, ["upload:fail"]);
  });

  it("old-delete failure after DB success preserves new path", async () => {
    const events: string[] = [];
    const path = await executeBrandLogoReplacement(
      {
        uploadNewObject: async () => "org-x/identity/logo/new.png",
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
      "org-x/identity/logo/old.png",
    );
    assert.equal(path, "org-x/identity/logo/new.png");
    assert.ok(events.includes("db:org-x/identity/logo/new.png"));
    assert.ok(events.includes("log:old_object_cleanup_failed"));
  });

  it("service updates organizations.brand_logo_storage_path", () => {
    const service = read("services/identity/brandIdentityService.ts");
    assert.match(service, /replaceOrganizationBrandLogo/);
    assert.match(service, /clearOrganizationBrandLogo/);
    assert.match(service, /brand_logo_storage_path/);
    assert.match(service, /\.from\("organizations"\)/);
    assert.doesNotMatch(service, /\.from\("athena_identity"\)/);
  });
});

describe("Organization brand signed URL lifetime", () => {
  it("uses a 1-hour signed URL and never persists signed URLs", () => {
    assert.equal(BRAND_LOGO_SIGNED_URL_TTL_SECONDS, 3600);
    const service = read("services/identity/brandIdentityService.ts");
    assert.doesNotMatch(service, /signedUrl.*upsert|brand_logo_signed/i);
    const page = read("app/identity/page.tsx");
    assert.match(page, /resolveOrganizationBrandLogoPreviewUrl/);
  });
});
