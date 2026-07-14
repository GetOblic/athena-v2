/**
 * Organization-scoped client profile-picture storage.
 * Reuses the private client-brand-assets bucket and logo validation policy.
 * Paths are always derived server-side under identity/profile-picture/.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertBrandProfilePicturePathForOrganization,
  BRAND_LOGO_ALLOWED_MIME_TYPES,
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_SIGNED_URL_TTL_SECONDS,
  buildBrandProfilePictureObjectPath,
  isAllowedBrandLogoMimeType,
  type BrandLogoMimeType,
} from "@/services/identity/brandIdentity";

export { BRAND_LOGO_SIGNED_URL_TTL_SECONDS as BRAND_PROFILE_PICTURE_SIGNED_URL_TTL_SECONDS };

export type BrandProfilePictureUploadResult = {
  storagePath: string;
  contentType: BrandLogoMimeType;
  byteSize: number;
};

export async function createBrandProfilePictureSignedUrl(
  storagePath: string,
  organizationId: string,
  expiresInSeconds = BRAND_LOGO_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const path = assertBrandProfilePicturePathForOrganization(
    storagePath,
    organizationId,
  );
  const { data, error } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error("[BRAND_PROFILE_PICTURE] signed_url_failed", error);
    return null;
  }

  return data?.signedUrl ?? null;
}

/** Validate and upload a new profile-picture object. Does not mutate DB or delete old objects. */
export async function uploadBrandProfilePicture(input: {
  organizationId: string;
  file: File;
}): Promise<BrandProfilePictureUploadResult> {
  const contentType = input.file.type;
  if (!isAllowedBrandLogoMimeType(contentType)) {
    throw new Error(
      `Unsupported profile picture type. Allowed: ${BRAND_LOGO_ALLOWED_MIME_TYPES.join(", ")}.`,
    );
  }

  if (input.file.size <= 0) {
    throw new Error("Profile picture file is empty.");
  }

  if (input.file.size > BRAND_LOGO_MAX_BYTES) {
    throw new Error("Profile picture must be 2 MB or smaller.");
  }

  const storagePath = buildBrandProfilePictureObjectPath({
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
    console.error("[BRAND_PROFILE_PICTURE] upload_failed", error);
    throw new Error("Could not upload profile picture.");
  }

  return {
    storagePath,
    contentType,
    byteSize: input.file.size,
  };
}

export async function removeBrandProfilePictureObject(
  storagePath: string,
  organizationId: string,
): Promise<void> {
  const path = assertBrandProfilePicturePathForOrganization(
    storagePath,
    organizationId,
  );
  const { error } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .remove([path]);

  if (error) {
    console.error("[BRAND_PROFILE_PICTURE] remove_failed", error);
    throw new Error("Could not remove profile picture.");
  }
}
