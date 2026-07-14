/**
 * Persist Client Brand Identity on organizations.
 * Does not touch athena_identity or Brain compile / generation.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertBrandLogoPathForOrganization,
  assertBrandProfilePicturePathForOrganization,
  normalizeBrandFont,
  parseOptionalBrandHexColor,
  type OrganizationBrandIdentity,
} from "@/services/identity/brandIdentity";
import {
  executeBrandLogoRemoval,
  executeBrandLogoReplacement,
} from "@/services/identity/brandLogoReplacement";
import {
  createBrandLogoSignedUrl,
  removeBrandLogoObject,
  uploadBrandLogo,
} from "@/services/identity/brandLogoStorage";
import {
  createBrandProfilePictureSignedUrl,
  removeBrandProfilePictureObject,
  uploadBrandProfilePicture,
} from "@/services/identity/brandProfilePictureStorage";
import {
  getOrganizationById,
  type Organization,
} from "@/services/organizationService";

export type UpdateOrganizationBrandIdentityInput = {
  organizationId: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  font?: string | null;
};

export class OrganizationBrandNotFoundError extends Error {
  constructor(message = "Organization not found.") {
    super(message);
    this.name = "OrganizationBrandNotFoundError";
  }
}

function toOrganizationBrand(
  organization: Organization,
): OrganizationBrandIdentity {
  return {
    organization_id: organization.id,
    brand_logo_storage_path: organization.brand_logo_storage_path ?? null,
    brand_profile_picture_storage_path:
      organization.brand_profile_picture_storage_path ?? null,
    brand_primary_color: organization.brand_primary_color ?? null,
    brand_secondary_color: organization.brand_secondary_color ?? null,
    brand_accent_color: organization.brand_accent_color ?? null,
    brand_background_color: organization.brand_background_color ?? null,
    brand_font: organization.brand_font ?? null,
  };
}

function logBrandCleanupFailure(context: string, error: unknown) {
  console.error(`[BRAND_IDENTITY] ${context}`, error);
}

export async function getOrganizationBrandIdentity(
  organizationId: string,
): Promise<OrganizationBrandIdentity | null> {
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    return null;
  }
  return toOrganizationBrand(organization);
}

/**
 * Update color/font metadata on the authenticated organization only.
 * Narrow payload — never overwrites name, slug, or unrelated fields.
 */
export async function updateOrganizationBrandIdentity(
  input: UpdateOrganizationBrandIdentityInput,
): Promise<OrganizationBrandIdentity> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new OrganizationBrandNotFoundError();
  }

  const existing = await getOrganizationById(organizationId);
  if (!existing) {
    throw new OrganizationBrandNotFoundError();
  }

  const brand_primary_color = parseOptionalBrandHexColor(input.primaryColor);
  const brand_secondary_color = parseOptionalBrandHexColor(
    input.secondaryColor,
  );
  const brand_accent_color = parseOptionalBrandHexColor(input.accentColor);
  const brand_background_color = parseOptionalBrandHexColor(
    input.backgroundColor,
  );
  const brand_font = normalizeBrandFont(input.font);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({
      brand_primary_color,
      brand_secondary_color,
      brand_accent_color,
      brand_background_color,
      brand_font,
      updated_at: now,
    })
    .eq("id", organizationId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[BRAND_IDENTITY] organization_update_failed", error);
    throw new Error("Could not save brand identity.");
  }

  return toOrganizationBrand(data as Organization);
}

async function setOrganizationBrandLogoPath(input: {
  organizationId: string;
  storagePath: string | null;
}): Promise<OrganizationBrandIdentity> {
  const organizationId = input.organizationId.trim();
  const existing = await getOrganizationById(organizationId);
  if (!existing) {
    throw new OrganizationBrandNotFoundError();
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({
      brand_logo_storage_path: input.storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[BRAND_IDENTITY] logo_path_update_failed", error);
    throw new Error("Could not save logo reference.");
  }

  return toOrganizationBrand(data as Organization);
}

export async function replaceOrganizationBrandLogo(input: {
  organizationId: string;
  file: File;
}): Promise<{ brand: OrganizationBrandIdentity; previewUrl: string | null }> {
  const existing = await getOrganizationBrandIdentity(input.organizationId);
  if (!existing) {
    throw new OrganizationBrandNotFoundError();
  }

  const previousPath = existing.brand_logo_storage_path ?? null;
  if (previousPath) {
    assertBrandLogoPathForOrganization(previousPath, input.organizationId);
  }

  const holder: { brand: OrganizationBrandIdentity | null } = { brand: null };

  const newPath = await executeBrandLogoReplacement(
    {
      uploadNewObject: async () => {
        const uploaded = await uploadBrandLogo({
          organizationId: input.organizationId,
          file: input.file,
        });
        return uploaded.storagePath;
      },
      updateIdentityPath: async (storagePath) => {
        holder.brand = await setOrganizationBrandLogoPath({
          organizationId: input.organizationId,
          storagePath,
        });
      },
      deleteObject: (storagePath) =>
        removeBrandLogoObject(storagePath, input.organizationId),
      logCleanupFailure: logBrandCleanupFailure,
    },
    previousPath,
  );

  const brand =
    holder.brand ??
    (await getOrganizationBrandIdentity(input.organizationId));

  if (!brand) {
    throw new Error("Could not save logo reference.");
  }

  const previewUrl = await createBrandLogoSignedUrl(
    newPath,
    input.organizationId,
  );
  return { brand, previewUrl };
}

export async function clearOrganizationBrandLogo(input: {
  organizationId: string;
}): Promise<OrganizationBrandIdentity> {
  const existing = await getOrganizationBrandIdentity(input.organizationId);
  if (!existing) {
    throw new OrganizationBrandNotFoundError();
  }

  const previousPath = existing.brand_logo_storage_path ?? null;
  if (previousPath) {
    assertBrandLogoPathForOrganization(previousPath, input.organizationId);
  }

  const holder: { brand: OrganizationBrandIdentity | null } = { brand: null };

  await executeBrandLogoRemoval(
    {
      clearIdentityPath: async () => {
        holder.brand = await setOrganizationBrandLogoPath({
          organizationId: input.organizationId,
          storagePath: null,
        });
      },
      deleteObject: (storagePath) =>
        removeBrandLogoObject(storagePath, input.organizationId),
      logCleanupFailure: logBrandCleanupFailure,
    },
    previousPath,
  );

  const brand =
    holder.brand ??
    (await getOrganizationBrandIdentity(input.organizationId));

  if (!brand) {
    throw new Error("Could not remove logo reference.");
  }

  return brand;
}

export async function resolveOrganizationBrandLogoPreviewUrl(
  brand: OrganizationBrandIdentity | null,
  organizationId: string,
): Promise<string | null> {
  const path = brand?.brand_logo_storage_path?.trim();
  if (!path) return null;
  return createBrandLogoSignedUrl(path, organizationId);
}

async function setOrganizationBrandProfilePicturePath(input: {
  organizationId: string;
  storagePath: string | null;
}): Promise<OrganizationBrandIdentity> {
  const organizationId = input.organizationId.trim();
  const existing = await getOrganizationById(organizationId);
  if (!existing) {
    throw new OrganizationBrandNotFoundError();
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({
      brand_profile_picture_storage_path: input.storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId)
    .select("*")
    .single();

  if (error || !data) {
    console.error(
      "[BRAND_IDENTITY] profile_picture_path_update_failed",
      error,
    );
    throw new Error("Could not save profile picture reference.");
  }

  return toOrganizationBrand(data as Organization);
}

export async function replaceOrganizationBrandProfilePicture(input: {
  organizationId: string;
  file: File;
}): Promise<{ brand: OrganizationBrandIdentity; previewUrl: string | null }> {
  const existing = await getOrganizationBrandIdentity(input.organizationId);
  if (!existing) {
    throw new OrganizationBrandNotFoundError();
  }

  const previousPath = existing.brand_profile_picture_storage_path ?? null;
  if (previousPath) {
    assertBrandProfilePicturePathForOrganization(
      previousPath,
      input.organizationId,
    );
  }

  const holder: { brand: OrganizationBrandIdentity | null } = { brand: null };

  const newPath = await executeBrandLogoReplacement(
    {
      uploadNewObject: async () => {
        const uploaded = await uploadBrandProfilePicture({
          organizationId: input.organizationId,
          file: input.file,
        });
        return uploaded.storagePath;
      },
      updateIdentityPath: async (storagePath) => {
        holder.brand = await setOrganizationBrandProfilePicturePath({
          organizationId: input.organizationId,
          storagePath,
        });
      },
      deleteObject: (storagePath) =>
        removeBrandProfilePictureObject(storagePath, input.organizationId),
      logCleanupFailure: logBrandCleanupFailure,
    },
    previousPath,
  );

  const brand =
    holder.brand ??
    (await getOrganizationBrandIdentity(input.organizationId));

  if (!brand) {
    throw new Error("Could not save profile picture reference.");
  }

  const previewUrl = await createBrandProfilePictureSignedUrl(
    newPath,
    input.organizationId,
  );
  return { brand, previewUrl };
}

export async function clearOrganizationBrandProfilePicture(input: {
  organizationId: string;
}): Promise<OrganizationBrandIdentity> {
  const existing = await getOrganizationBrandIdentity(input.organizationId);
  if (!existing) {
    throw new OrganizationBrandNotFoundError();
  }

  const previousPath = existing.brand_profile_picture_storage_path ?? null;
  if (previousPath) {
    assertBrandProfilePicturePathForOrganization(
      previousPath,
      input.organizationId,
    );
  }

  const holder: { brand: OrganizationBrandIdentity | null } = { brand: null };

  await executeBrandLogoRemoval(
    {
      clearIdentityPath: async () => {
        holder.brand = await setOrganizationBrandProfilePicturePath({
          organizationId: input.organizationId,
          storagePath: null,
        });
      },
      deleteObject: (storagePath) =>
        removeBrandProfilePictureObject(storagePath, input.organizationId),
      logCleanupFailure: logBrandCleanupFailure,
    },
    previousPath,
  );

  const brand =
    holder.brand ??
    (await getOrganizationBrandIdentity(input.organizationId));

  if (!brand) {
    throw new Error("Could not remove profile picture reference.");
  }

  return brand;
}

export async function resolveOrganizationBrandProfilePicturePreviewUrl(
  brand: OrganizationBrandIdentity | null,
  organizationId: string,
): Promise<string | null> {
  const path = brand?.brand_profile_picture_storage_path?.trim();
  if (!path) return null;
  return createBrandProfilePictureSignedUrl(path, organizationId);
}
