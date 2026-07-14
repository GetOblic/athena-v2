/**
 * Organization-scoped client logo storage.
 * Uses service-role admin client; paths are always derived server-side.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertBrandLogoPathForOrganization,
  BRAND_LOGO_ALLOWED_MIME_TYPES,
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_SIGNED_URL_TTL_SECONDS,
  buildBrandLogoObjectPath,
  isAllowedBrandLogoMimeType,
  type BrandLogoMimeType,
} from "@/services/identity/brandIdentity";

export { BRAND_LOGO_SIGNED_URL_TTL_SECONDS };

export type BrandLogoUploadResult = {
  storagePath: string;
  contentType: BrandLogoMimeType;
  byteSize: number;
};

export async function createBrandLogoSignedUrl(
  storagePath: string,
  organizationId: string,
  expiresInSeconds = BRAND_LOGO_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const path = assertBrandLogoPathForOrganization(storagePath, organizationId);
  const { data, error } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error("[BRAND_LOGO] signed_url_failed", error);
    return null;
  }

  return data?.signedUrl ?? null;
}

/** Validate and upload a new logo object. Does not mutate identity or delete old objects. */
export async function uploadBrandLogo(input: {
  organizationId: string;
  file: File;
}): Promise<BrandLogoUploadResult> {
  const contentType = input.file.type;
  if (!isAllowedBrandLogoMimeType(contentType)) {
    throw new Error(
      `Unsupported logo type. Allowed: ${BRAND_LOGO_ALLOWED_MIME_TYPES.join(", ")}.`,
    );
  }

  if (input.file.size <= 0) {
    throw new Error("Logo file is empty.");
  }

  if (input.file.size > BRAND_LOGO_MAX_BYTES) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  const storagePath = buildBrandLogoObjectPath({
    organizationId: input.organizationId,
    mimeType: contentType,
  });

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    console.error("[BRAND_LOGO] upload_failed", error);
    throw new Error("Could not upload logo.");
  }

  return {
    storagePath,
    contentType,
    byteSize: input.file.size,
  };
}

export async function removeBrandLogoObject(
  storagePath: string,
  organizationId: string,
): Promise<void> {
  const path = assertBrandLogoPathForOrganization(storagePath, organizationId);
  const { error } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .remove([path]);

  if (error) {
    console.error("[BRAND_LOGO] remove_failed", error);
    throw new Error("Could not remove logo.");
  }
}
