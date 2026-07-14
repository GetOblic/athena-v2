/**
 * Client Brand Identity — profile metadata only.
 * Never consumed by Brain compile, prompts, generation, or Athena UI theming.
 */

export const BRAND_LOGO_BUCKET = "client-brand-assets";
export const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
/** Fresh signed URL lifetime for page preview. Never persisted. */
export const BRAND_LOGO_SIGNED_URL_TTL_SECONDS = 3600;
export const BRAND_LOGO_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type BrandLogoMimeType = (typeof BRAND_LOGO_ALLOWED_MIME_TYPES)[number];

export const BRAND_FONT_OPTIONS = [
  { value: "", label: "No font selected" },
  { value: "geist", label: "Geist" },
  { value: "geist_mono", label: "Geist Mono" },
  { value: "arial", label: "Arial" },
  { value: "helvetica", label: "Helvetica" },
  { value: "georgia", label: "Georgia" },
  { value: "times_new_roman", label: "Times New Roman" },
  { value: "verdana", label: "Verdana" },
  { value: "system_ui", label: "System UI" },
] as const;

export type BrandFontValue =
  | (typeof BRAND_FONT_OPTIONS)[number]["value"]
  | "";

const BRAND_FONT_ALLOWLIST = new Set<string>(
  BRAND_FONT_OPTIONS.map((option) => option.value).filter(Boolean),
);

const HEX_COLOR_PATTERN = /^#?[0-9A-Fa-f]{6}$/;

export type BrandColorField =
  | "brand_primary_color"
  | "brand_secondary_color"
  | "brand_accent_color"
  | "brand_background_color";

/** Organization-level Client Brand Identity fields (organizations table). */
export type OrganizationBrandIdentity = {
  organization_id: string;
  brand_logo_storage_path: string | null;
  brand_profile_picture_storage_path: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_accent_color: string | null;
  brand_background_color: string | null;
  brand_font: string | null;
};

export function normalizeBrandHexColor(
  value: string | null | undefined,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!HEX_COLOR_PATTERN.test(raw)) {
    throw new Error("Color must be a 6-digit hex value (e.g. #FF6600).");
  }
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  return `#${hex.toUpperCase()}`;
}

export function parseOptionalBrandHexColor(
  value: string | null | undefined,
): string | null {
  return normalizeBrandHexColor(value);
}

export function normalizeBrandFont(
  value: string | null | undefined,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!BRAND_FONT_ALLOWLIST.has(raw)) {
    throw new Error("Unsupported brand font.");
  }
  return raw;
}

export function isAllowedBrandLogoMimeType(
  value: string | null | undefined,
): value is BrandLogoMimeType {
  return BRAND_LOGO_ALLOWED_MIME_TYPES.includes(
    value as BrandLogoMimeType,
  );
}

export function extensionForBrandLogoMime(
  mime: BrandLogoMimeType,
): "png" | "jpg" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Build a tenant-scoped logo object path. Never trusts client-supplied paths. */
export function buildBrandLogoObjectPath(input: {
  organizationId: string;
  mimeType: BrandLogoMimeType;
  objectId?: string;
}): string {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("organizationId is required for logo storage.");
  }
  if (organizationId.includes("/") || organizationId.includes("..")) {
    throw new Error("Invalid organizationId for logo storage.");
  }

  const objectId =
    input.objectId?.trim() ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ext = extensionForBrandLogoMime(input.mimeType);
  return `${organizationId}/identity/logo/${objectId}.${ext}`;
}

/**
 * Ensure a stored path belongs to the authenticated organization.
 * Validates the exact normalized prefix: `${organizationId}/identity/logo/`
 * Rejects URLs, traversal, prefix lookalikes, and paths outside that folder.
 */
export function assertBrandLogoPathForOrganization(
  storagePath: string | null | undefined,
  organizationId: string,
): string {
  const org = organizationId.trim();
  if (!org) {
    throw new Error("organizationId is required.");
  }
  if (org.includes("/") || org.includes("\\") || org.includes("..")) {
    throw new Error("Invalid organizationId for logo storage.");
  }

  const raw = String(storagePath ?? "").trim();
  if (!raw) {
    throw new Error("Logo storage path is required.");
  }

  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    throw new Error("Invalid logo storage path.");
  }
  path = path.trim();

  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("..") ||
    /%2e/i.test(raw) ||
    /^https?:\/\//i.test(path) ||
    path.includes("://") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new Error("Invalid logo storage path.");
  }

  const expectedPrefix = `${org}/identity/logo/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new Error("Logo storage path escapes organization scope.");
  }

  const remainder = path.slice(expectedPrefix.length);
  if (!remainder || remainder.includes("/") || remainder.includes("\\")) {
    throw new Error("Invalid logo storage path.");
  }

  return path;
}

/** Build a tenant-scoped profile-picture object path. Never trusts client-supplied paths. */
export function buildBrandProfilePictureObjectPath(input: {
  organizationId: string;
  mimeType: BrandLogoMimeType;
  objectId?: string;
}): string {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("organizationId is required for profile picture storage.");
  }
  if (organizationId.includes("/") || organizationId.includes("..")) {
    throw new Error("Invalid organizationId for profile picture storage.");
  }

  const objectId =
    input.objectId?.trim() ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ext = extensionForBrandLogoMime(input.mimeType);
  return `${organizationId}/identity/profile-picture/${objectId}.${ext}`;
}

/**
 * Ensure a stored profile-picture path belongs to the authenticated organization.
 * Validates the exact normalized prefix: `${organizationId}/identity/profile-picture/`
 * Rejects URLs, traversal, prefix lookalikes, and paths outside that folder.
 */
export function assertBrandProfilePicturePathForOrganization(
  storagePath: string | null | undefined,
  organizationId: string,
): string {
  const org = organizationId.trim();
  if (!org) {
    throw new Error("organizationId is required.");
  }
  if (org.includes("/") || org.includes("\\") || org.includes("..")) {
    throw new Error("Invalid organizationId for profile picture storage.");
  }

  const raw = String(storagePath ?? "").trim();
  if (!raw) {
    throw new Error("Profile picture storage path is required.");
  }

  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    throw new Error("Invalid profile picture storage path.");
  }
  path = path.trim();

  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("..") ||
    /%2e/i.test(raw) ||
    /^https?:\/\//i.test(path) ||
    path.includes("://") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new Error("Invalid profile picture storage path.");
  }

  const expectedPrefix = `${org}/identity/profile-picture/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new Error("Profile picture storage path escapes organization scope.");
  }

  const remainder = path.slice(expectedPrefix.length);
  if (!remainder || remainder.includes("/") || remainder.includes("\\")) {
    throw new Error("Invalid profile picture storage path.");
  }

  return path;
}
