/**
 * Athena-local Google Places contracts. No Google npm package.
 * Safe for client components. Never put Make webhook secrets here.
 */

export const GOOGLE_BUSINESS_ADD_ACTION = "business_add_listing_google" as const;

export const GOOGLE_PLACES_AUTOCOMPLETE_FIELDS = [
  "place_id",
  "name",
  "url",
  "geometry",
  "formatted_address",
  "address_components",
  "types",
  "formatted_phone_number",
  "international_phone_number",
  "website",
  "opening_hours",
  "utc_offset_minutes",
] as const;

export type GoogleBusinessAction = typeof GOOGLE_BUSINESS_ADD_ACTION;

export type GoogleBusinessPayload = {
  action: GoogleBusinessAction;
  company_name: string;
  google_id: string;
  google_url?: string;
  latitude?: string;
  longitude?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  category?: string;
  tags?: string;
  business_phone?: string;
  website?: string;
  opening_hours: string;
  opening_hours_json: string;
  timezone?: string;
};

export const GOOGLE_BUSINESS_EMPTY_OPENING_HOURS_JSON = JSON.stringify({
  periods: [],
});

export type GoogleBusinessOptionalField = Exclude<
  keyof GoogleBusinessPayload,
  "action" | "company_name" | "google_id" | "opening_hours" | "opening_hours_json"
>;

export const GOOGLE_BUSINESS_OPTIONAL_FIELDS = [
  "google_url",
  "latitude",
  "longitude",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "category",
  "tags",
  "business_phone",
  "website",
  "timezone",
] as const satisfies readonly GoogleBusinessOptionalField[];

export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type GooglePlaceResult = {
  place_id?: string;
  name?: string;
  url?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  types?: string[];
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
  opening_hours?: {
    weekday_text?: string[];
    periods?: unknown[];
  };
  utc_offset_minutes?: number;
};

export type GoogleAutocomplete = {
  addListener: (event: string, handler: () => void) => { remove: () => void };
  getPlace: () => GooglePlaceResult;
};

export type GoogleMapsPlaces = {
  Autocomplete: new (
    input: HTMLInputElement,
    opts?: {
      types?: string[];
      fields?: string[];
    },
  ) => GoogleAutocomplete;
};

export type GoogleMapsNamespace = {
  maps: {
    places: GoogleMapsPlaces;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __athenaGoogleMapsPromise?: Promise<GoogleMapsNamespace>;
  }
}

export {};
