import type { GoogleMapsNamespace } from "@/lib/googlePlaces/googlePlacesTypes";

const SCRIPT_ID = "athena-google-maps-places";
const GOOGLE_MAPS_JS_URL = "https://maps.googleapis.com/maps/api/js";

export class GoogleMapsPlacesLoadError extends Error {
  readonly reason: "browser_only" | "missing_key" | "script_error" | "unavailable";

  constructor(
    reason: GoogleMapsPlacesLoadError["reason"],
    message: string,
  ) {
    super(message);
    this.name = "GoogleMapsPlacesLoadError";
    this.reason = reason;
  }
}

function mapsScriptSrc(apiKey: string): string {
  const params = new URLSearchParams({
    key: apiKey,
    libraries: "places",
  });
  return `${GOOGLE_MAPS_JS_URL}?${params.toString()}`;
}

/**
 * Load the Maps JavaScript API with Places once. Browser-only.
 * Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY at the call site.
 */
export function loadGoogleMapsPlaces(
  apiKey: string,
): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new GoogleMapsPlacesLoadError(
        "browser_only",
        "Google Maps can only load in the browser.",
      ),
    );
  }

  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return Promise.reject(
      new GoogleMapsPlacesLoadError(
        "missing_key",
        "Google Maps API key is missing.",
      ),
    );
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (window.__athenaGoogleMapsPromise) {
    return window.__athenaGoogleMapsPromise;
  }

  window.__athenaGoogleMapsPromise = new Promise((resolve, reject) => {
    const fail = (reason: GoogleMapsPlacesLoadError["reason"], message: string) => {
      window.__athenaGoogleMapsPromise = undefined;
      reject(new GoogleMapsPlacesLoadError(reason, message));
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps?.places) {
          resolve(window.google);
        } else {
          fail("unavailable", "Google Maps loaded without Places.");
        }
      });
      existing.addEventListener("error", () => {
        fail("script_error", "Google Maps script failed to load.");
      });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = mapsScriptSrc(trimmedKey);
    script.onload = () => {
      if (window.google?.maps?.places) {
        resolve(window.google);
      } else {
        fail("unavailable", "Google Maps loaded without Places.");
      }
    };
    script.onerror = () => {
      fail("script_error", "Google Maps script failed to load.");
    };
    document.head.appendChild(script);
  });

  return window.__athenaGoogleMapsPromise;
}
