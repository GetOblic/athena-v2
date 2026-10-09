/**
 * Freeze an approved organization palette and a quote-owned logo.
 * Invalid stored colors and fonts become null. This does not copy bytes.
 */

import {
  normalizeBrandFont,
  parseOptionalBrandHexColor,
} from "@/services/identity/brandIdentity";
import { parseClientQuoteIssuedBrand } from "@/services/clientQuote/clientQuoteValidation";
import type {
  ClientQuoteIssuedBrandSnapshot,
  ClientQuoteIssuedLogoSnapshot,
} from "@/services/clientQuote/clientQuoteTypes";

export type OrganizationBrandFields = {
  brand_primary_color?: unknown;
  brand_secondary_color?: unknown;
  brand_accent_color?: unknown;
  brand_background_color?: unknown;
  brand_font?: unknown;
  brand_logo_storage_path?: unknown;
};

function approvedColor(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return parseOptionalBrandHexColor(value);
  } catch {
    return null;
  }
}

function approvedFont(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return normalizeBrandFont(value);
  } catch {
    return null;
  }
}

export function freezeOrganizationBrand(input: {
  brand: OrganizationBrandFields | null;
  logo: ClientQuoteIssuedLogoSnapshot | null;
}): ClientQuoteIssuedBrandSnapshot {
  const brand = input.brand;
  return parseClientQuoteIssuedBrand({
    primaryColor: approvedColor(brand?.brand_primary_color),
    secondaryColor: approvedColor(brand?.brand_secondary_color),
    accentColor: approvedColor(brand?.brand_accent_color),
    backgroundColor: approvedColor(brand?.brand_background_color),
    font: approvedFont(brand?.brand_font),
    logo: input.logo,
  });
}

export function organizationLogoPath(
  brand: OrganizationBrandFields | null | undefined,
): string | null {
  const path = brand?.brand_logo_storage_path;
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  return trimmed || null;
}
