/**
 * Map a sanitized Google business selection onto the existing Prospect
 * create contract. Free Google Add persists a normal prospect — not a
 * GetOblic listing. Do not invent columns or a Free prospect type.
 */

import type { GoogleBusinessPayload } from "@/lib/googlePlaces/googlePlacesTypes";
import type { ProspectImportRow } from "@/services/prospects/prospectImporter";

export const FREE_GOOGLE_PROSPECT_SOURCE = "manual" as const;

function optionalMapped(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function mapGoogleBusinessToFreeProspectRow(
  payload: GoogleBusinessPayload,
): {
  row: ProspectImportRow;
  rawJson: Record<string, unknown>;
} {
  return {
    row: {
      business_name: payload.company_name,
      website: optionalMapped(payload.website),
      phone: optionalMapped(payload.business_phone),
      address: optionalMapped(payload.address),
      city: optionalMapped(payload.city),
      state: optionalMapped(payload.state),
      country: optionalMapped(payload.country),
      category:
        optionalMapped(payload.category) ?? optionalMapped(payload.tags),
      timezone: optionalMapped(payload.timezone),
      google_business_url: optionalMapped(payload.google_url),
      source: FREE_GOOGLE_PROSPECT_SOURCE,
    },
    rawJson: compactGoogleProspectSnapshot(payload),
  };
}

export function compactGoogleProspectSnapshot(
  payload: GoogleBusinessPayload,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    google_id: payload.google_id,
    action: payload.action,
  };

  if (payload.google_url) snapshot.google_url = payload.google_url;
  if (payload.latitude) snapshot.latitude = payload.latitude;
  if (payload.longitude) snapshot.longitude = payload.longitude;
  if (payload.zip) snapshot.zip = payload.zip;
  if (payload.tags) snapshot.tags = payload.tags;
  if (payload.category) snapshot.category = payload.category;
  if (payload.timezone) snapshot.timezone = payload.timezone;
  if (payload.opening_hours) snapshot.opening_hours = payload.opening_hours;
  if (payload.opening_hours_json) {
    snapshot.opening_hours_json = payload.opening_hours_json;
  }

  return snapshot;
}
