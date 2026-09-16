import {
  assertBrandLogoPathForOrganization,
  assertBrandProfilePicturePathForOrganization,
  BRAND_LOGO_BUCKET,
} from "@/services/identity/brandIdentity";
import type { OrganizationBrandIdentity } from "@/services/identity/brandIdentity";
import type {
  SeoProspectPdfBrandAssets,
  SeoProspectPdfSafeImage,
} from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";

export type SeoProspectPdfBrandDeps = {
  getOrganizationBrandIdentity: (
    organizationId: string,
  ) => Promise<OrganizationBrandIdentity | null>;
  downloadBrandObject: (
    storagePath: string,
  ) => Promise<{ bytes: Buffer; mimeType: string } | null>;
};

function inferMimeFromPath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "";
}

function toSafeImage(
  bytes: Buffer,
  mimeType: string,
): SeoProspectPdfSafeImage | null {
  if (!bytes.length) return null;
  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    return { bytes, mimeType };
  }
  return null;
}

export async function downloadBrandObjectFromStorage(
  storagePath: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .download(storagePath);

  if (error || !data) {
    console.error("[SEO_PROSPECT_PDF] brand_asset_download_failed");
    return null;
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const mimeType = data.type || inferMimeFromPath(storagePath);
  return { bytes, mimeType };
}

async function loadSafeAsset(input: {
  storagePath: string | null | undefined;
  organizationId: string;
  kind: "logo" | "profile";
  downloadBrandObject: SeoProspectPdfBrandDeps["downloadBrandObject"];
}): Promise<SeoProspectPdfSafeImage | null> {
  const rawPath = input.storagePath?.trim();
  if (!rawPath) return null;

  try {
    const storagePath =
      input.kind === "logo"
        ? assertBrandLogoPathForOrganization(rawPath, input.organizationId)
        : assertBrandProfilePicturePathForOrganization(
            rawPath,
            input.organizationId,
          );
    const downloaded = await input.downloadBrandObject(storagePath);
    if (!downloaded) return null;

    const mime = downloaded.mimeType || inferMimeFromPath(storagePath);
    if (mime === "image/webp" || storagePath.toLowerCase().endsWith(".webp")) {
      console.warn("[SEO_PROSPECT_PDF] brand_asset_webp_omitted", {
        kind: input.kind,
      });
      return null;
    }

    const safe = toSafeImage(downloaded.bytes, mime);
    if (!safe) {
      console.warn("[SEO_PROSPECT_PDF] brand_asset_unsupported", {
        kind: input.kind,
      });
    }
    return safe;
  } catch (error) {
    console.error("[SEO_PROSPECT_PDF] brand_asset_unavailable", {
      kind: input.kind,
    });
    void error;
    return null;
  }
}

async function defaultBrandDeps(): Promise<SeoProspectPdfBrandDeps> {
  const { getOrganizationBrandIdentity } = await import(
    "@/services/identity/brandIdentityService"
  );
  return {
    getOrganizationBrandIdentity,
    downloadBrandObject: downloadBrandObjectFromStorage,
  };
}

export async function loadSeoProspectPdfBrandAssets(
  senderOrganizationId: string,
  deps?: SeoProspectPdfBrandDeps,
): Promise<SeoProspectPdfBrandAssets> {
  const resolved = deps ?? (await defaultBrandDeps());
  const organizationId = senderOrganizationId.trim();
  if (!organizationId) {
    return { identity: null, logo: null, profilePicture: null };
  }

  let identity = null;
  try {
    identity = await resolved.getOrganizationBrandIdentity(organizationId);
  } catch (error) {
    console.error("[SEO_PROSPECT_PDF] brand_identity_unavailable");
    void error;
    return { identity: null, logo: null, profilePicture: null };
  }

  if (!identity) {
    return { identity: null, logo: null, profilePicture: null };
  }

  const [logo, profilePicture] = await Promise.all([
    loadSafeAsset({
      storagePath: identity.brand_logo_storage_path,
      organizationId,
      kind: "logo",
      downloadBrandObject: resolved.downloadBrandObject,
    }),
    loadSafeAsset({
      storagePath: identity.brand_profile_picture_storage_path,
      organizationId,
      kind: "profile",
      downloadBrandObject: resolved.downloadBrandObject,
    }),
  ]);

  return { identity, logo, profilePicture };
}
