import {
  GOOGLE_BUSINESS_ADD_ACTION,
  type GoogleAddressComponent,
  type GoogleBusinessPayload,
  type GooglePlaceResult,
} from "@/lib/googlePlaces/googlePlacesTypes";

type AddressParts = {
  city: string;
  state: string;
  zip: string;
  country: string;
};

function parseAddressComponents(
  components: GoogleAddressComponent[] | undefined,
): AddressParts {
  const parts: AddressParts = {
    city: "",
    state: "",
    zip: "",
    country: "",
  };

  if (!components) return parts;

  for (const component of components) {
    if (component.types.includes("locality")) {
      parts.city = component.long_name;
    }
    if (component.types.includes("administrative_area_level_1")) {
      parts.state = component.short_name || component.long_name;
    }
    if (component.types.includes("postal_code")) {
      parts.zip = component.long_name;
    }
    if (component.types.includes("country")) {
      parts.country = component.short_name || component.long_name;
    }
  }

  return parts;
}

function optionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Flatten a selected Google Place into the Athena Make payload.
 * Do not send Google's raw Place object.
 */
export function flattenGoogleBusinessPlace(
  place: GooglePlaceResult,
): GoogleBusinessPayload | null {
  const companyName = (place.name ?? "").trim();
  const googleId = (place.place_id ?? "").trim();
  if (!companyName || !googleId) {
    return null;
  }

  const address = parseAddressComponents(place.address_components);
  const lat = place.geometry?.location?.lat();
  const lng = place.geometry?.location?.lng();
  const weekdayText = place.opening_hours?.weekday_text ?? [];
  const types = place.types ?? [];

  return {
    action: GOOGLE_BUSINESS_ADD_ACTION,
    company_name: companyName,
    google_id: googleId,
    google_url: optionalString(place.url ?? ""),
    latitude: lat != null ? String(lat) : undefined,
    longitude: lng != null ? String(lng) : undefined,
    address: optionalString(place.formatted_address ?? ""),
    city: optionalString(address.city),
    state: optionalString(address.state),
    zip: optionalString(address.zip),
    country: optionalString(address.country),
    category: optionalString(types[0] ?? ""),
    tags: optionalString(types.join(",")),
    business_phone: optionalString(place.international_phone_number ?? ""),
    website: optionalString(place.website ?? ""),
    opening_hours: optionalString(weekdayText.join(" | ")),
    opening_hours_json: place.opening_hours?.periods
      ? JSON.stringify(place.opening_hours.periods)
      : undefined,
    timezone:
      place.utc_offset_minutes != null
        ? String(place.utc_offset_minutes)
        : undefined,
  };
}
