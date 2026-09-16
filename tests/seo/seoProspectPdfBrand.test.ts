import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { contrastRatio, parseSafeBrandHex, resolveSeoProspectPdfColors } from "../../services/seo/seoProspectPdf/seoProspectPdfColors";
import { mapBrandFontToPdfKit } from "../../services/seo/seoProspectPdf/seoProspectPdfFonts";
import { loadSeoProspectPdfBrandAssets } from "../../services/seo/seoProspectPdf/loadSeoProspectPdfBrandAssets";
import type { OrganizationBrandIdentity } from "../../services/identity/brandIdentity";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const identity = (
  overrides: Partial<OrganizationBrandIdentity> = {},
): OrganizationBrandIdentity => ({
  organization_id: "22222222-2222-4222-8222-222222222222",
  brand_logo_storage_path: null,
  brand_profile_picture_storage_path: null,
  brand_primary_color: "#1F3A5F",
  brand_secondary_color: "#4A5568",
  brand_accent_color: "#9A3412",
  brand_background_color: "#F8F5F0",
  brand_font: "helvetica",
  ...overrides,
});

describe("SEO prospect PDF brand safety", () => {
  it("maps brand fonts to built-in PDFKit faces only", () => {
    assert.equal(mapBrandFontToPdfKit("helvetica").regular, "Helvetica");
    assert.equal(mapBrandFontToPdfKit("arial").regular, "Helvetica");
    assert.equal(mapBrandFontToPdfKit("verdana").regular, "Helvetica");
    assert.equal(mapBrandFontToPdfKit("geist").regular, "Helvetica");
    assert.equal(mapBrandFontToPdfKit("system_ui").regular, "Helvetica");
    assert.equal(mapBrandFontToPdfKit("").regular, "Helvetica");
    assert.equal(mapBrandFontToPdfKit(null).regular, "Helvetica");
    assert.equal(mapBrandFontToPdfKit("times_new_roman").regular, "Times-Roman");
    assert.equal(mapBrandFontToPdfKit("georgia").regular, "Times-Roman");
    assert.equal(mapBrandFontToPdfKit("geist_mono").regular, "Courier");
  });

  it("falls back invalid colors and refuses unsafe cover washes", () => {
    assert.equal(parseSafeBrandHex("not-a-color"), null);
    const safe = resolveSeoProspectPdfColors(
      identity({ brand_background_color: "#F8F5F0" }),
    );
    assert.ok(safe.coverWash);
    assert.ok(contrastRatio(safe.ink, safe.coverWash ?? "#FFFFFF") >= 4.5);

    const darkWash = resolveSeoProspectPdfColors(
      identity({ brand_background_color: "#111111" }),
    );
    assert.equal(darkWash.coverWash, null);
    assert.equal(darkWash.paper, "#FFFFFF");

    const invalid = resolveSeoProspectPdfColors(
      identity({
        brand_primary_color: "orange",
        brand_secondary_color: null,
        brand_accent_color: "#FFF",
      }),
    );
    assert.equal(invalid.primary, "#1F3A5F");
  });

  it("omits missing, failed, or WebP brand assets without failing", async () => {
    const loaded = await loadSeoProspectPdfBrandAssets(
      "22222222-2222-4222-8222-222222222222",
      {
        getOrganizationBrandIdentity: async () =>
          identity({
            brand_logo_storage_path:
              "22222222-2222-4222-8222-222222222222/identity/logo/mark.webp",
            brand_profile_picture_storage_path:
              "22222222-2222-4222-8222-222222222222/identity/profile-picture/face.png",
          }),
        downloadBrandObject: async (storagePath) => {
          if (storagePath.endsWith(".webp")) {
            return { bytes: Buffer.from("webp"), mimeType: "image/webp" };
          }
          throw new Error("storage denied");
        },
      },
    );
    assert.ok(loaded.identity);
    assert.equal(loaded.logo, null);
    assert.equal(loaded.profilePicture, null);
  });

  it("never fetches arbitrary URLs for brand media", () => {
    const loader = read(
      "services/seo/seoProspectPdf/loadSeoProspectPdfBrandAssets.ts",
    );
    assert.match(loader, /assertBrandLogoPathForOrganization/);
    assert.match(loader, /assertBrandProfilePicturePathForOrganization/);
    assert.match(loader, /client-brand-assets|BRAND_LOGO_BUCKET/);
    assert.doesNotMatch(loader, /fetch\(/);
  });
});
