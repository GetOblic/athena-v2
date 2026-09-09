/**
 * CO-5D1 Google single-business discovery.
 * Source-contract and mocked Make/Google checks. No live Google, Make, or WordPress.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { flattenGoogleBusinessPlace } from "../../lib/googlePlaces/flattenGoogleBusiness";
import { GOOGLE_BUSINESS_ADD_ACTION } from "../../lib/googlePlaces/googlePlacesTypes";
import type { GooglePlaceResult } from "../../lib/googlePlaces/googlePlacesTypes";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import type { GetOblicDirectorySettingsResult } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import {
  addGoogleBusinessListing,
  readPositiveInteger,
  sanitizeGoogleBusinessPayload,
} from "../../services/googleBusiness/googleBusinessMakeService";
import {
  GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV,
  GoogleBusinessMakeError,
} from "../../services/googleBusiness/googleBusinessMakeTypes";

const ROOT = process.cwd();
const ORG_A = "11111111-1111-1111-1111-111111111111";
const WEBHOOK = "https://hook.example.test/google-business";
const originalFetch = globalThis.fetch;

const DICTIONARIES = { en, fr, es, it: itMessages, de, pt } as const;

const CLIENT_FILES = [
  "app/prospects/find/page.tsx",
  "components/prospects/OpportunityDiscoveryMethods.tsx",
  "components/prospects/GoogleBusinessDiscovery.tsx",
  "components/prospects/GetOblicOpportunityDiscovery.tsx",
  "lib/googlePlaces/flattenGoogleBusiness.ts",
  "lib/googlePlaces/loadGoogleMapsPlaces.ts",
  "lib/googlePlaces/googlePlacesTypes.ts",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function settingsResult(
  wordpressAuthorId: number | null,
): GetOblicDirectorySettingsResult {
  return {
    configured: true,
    settings: {
      organization_id: ORG_A,
      monthly_allowance: 4,
      wordpress_author_id: wordpressAuthorId,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
      updated_by_user_id: null,
    },
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: GOOGLE_BUSINESS_ADD_ACTION,
    company_name: "Oak Street Salon",
    google_id: "ChIJexamplePlace",
    google_url: "https://maps.google.com/?cid=1",
    latitude: "32.7767",
    longitude: "-96.797",
    address: "100 Oak St, Dallas, TX 75201, USA",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    country: "US",
    category: "hair_care",
    tags: "hair_care,establishment,point_of_interest",
    business_phone: "+1 214-555-0100",
    website: "https://oak.example",
    opening_hours: "Monday: 9:00 AM – 5:00 PM | Tuesday: 9:00 AM – 5:00 PM",
    opening_hours_json: JSON.stringify([
      { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } },
    ]),
    timezone: "-300",
    ...overrides,
  };
}

function placeFixture(): GooglePlaceResult {
  return {
    place_id: "ChIJexamplePlace",
    name: "Oak Street Salon",
    url: "https://maps.google.com/?cid=1",
    formatted_address: "100 Oak St, Dallas, TX 75201, USA",
    international_phone_number: "+1 214-555-0100",
    website: "https://oak.example",
    types: ["hair_care", "establishment", "point_of_interest"],
    address_components: [
      { long_name: "Dallas", short_name: "Dallas", types: ["locality"] },
      {
        long_name: "Texas",
        short_name: "TX",
        types: ["administrative_area_level_1"],
      },
      { long_name: "75201", short_name: "75201", types: ["postal_code"] },
      { long_name: "United States", short_name: "US", types: ["country"] },
    ],
    geometry: {
      location: {
        lat: () => 32.7767,
        lng: () => -96.797,
      },
    },
    opening_hours: {
      weekday_text: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"],
      periods: [
        { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } },
      ],
    },
    utc_offset_minutes: -300,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CO-5D1 two-method Find opportunities UX", () => {
  it("keeps the Directory method and existing search contract", () => {
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const discovery = read(
      "components/prospects/GetOblicOpportunityDiscovery.tsx",
    );
    const page = read("app/prospects/find/page.tsx");
    assert.match(methods, /Search the GetOblic Directory|directoryLabel/);
    assert.match(methods, /GetOblicOpportunityDiscovery/);
    assert.match(methods, /GoogleBusinessDiscovery/);
    assert.match(page, /OpportunityDiscoveryMethods/);
    assert.match(discovery, /\/api\/getoblic-directory\/search/);
    assert.match(discovery, /\/api\/prospects\/from-getoblic/);
    assert.match(discovery, /page: String\(nextPage\)/);
    assert.match(discovery, /listingCapacityReached/);
    assert.doesNotMatch(discovery, /from-google-business/);
    assert.doesNotMatch(discovery, /google.?places/i);
    assert.doesNotMatch(discovery, /author_id/);
    assert.equal(
      en.prospects.find.methods.directoryLabel,
      "Search the GetOblic Directory",
    );
  });

  it("adds the Google method without changing Directory claim or capacity semantics", () => {
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    const page = read("app/prospects/find/page.tsx");
    assert.equal(
      en.prospects.find.methods.googleLabel,
      "Find One Business on Google",
    );
    assert.match(methods, /googleLabel/);
    assert.match(google, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    assert.match(google, /\/api\/prospects\/from-google-business/);
    assert.match(google, /types: \["establishment"\]/);
    assert.match(google, /setSelected\(null\)/);
    assert.match(google, /listingCapacityReached/);
    assert.match(google, /router\.push\(`\/prospects\/\$\{prospectId\}`\)/);
    assert.doesNotMatch(google, /from-getoblic/);
    assert.doesNotMatch(google, /convertGetOblicDirectoryListing/);
    assert.doesNotMatch(page, /organizationId:/);
    assert.doesNotMatch(page, /\bauthor_id\b/);
  });
});

describe("CO-5D1 Google loader and payload", () => {
  it("loads Maps JS API Places from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY without an npm package", () => {
    const loader = read("lib/googlePlaces/loadGoogleMapsPlaces.ts");
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    const pkg = read("package.json");
    assert.match(loader, /https:\/\/maps\.googleapis\.com\/maps\/api\/js/);
    assert.match(loader, /libraries/);
    assert.match(loader, /places/);
    assert.match(google, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    assert.match(loader, /Google Maps can only load in the browser/);
    assert.match(loader, /missing_key/);
    assert.match(loader, /script_error/);
    assert.match(loader, /unavailable/);
    assert.doesNotMatch(pkg, /@googlemaps|google-maps|@react-google-maps/);
    assert.doesNotMatch(loader, /manual_entry|business_add_listing_not_google/);
  });

  it("flattens a selected Place with the proven field semantics", () => {
    const payload = flattenGoogleBusinessPlace(placeFixture());
    assert.ok(payload);
    assert.equal(payload.action, "business_add_listing_google");
    assert.equal(payload.company_name, "Oak Street Salon");
    assert.equal(payload.google_id, "ChIJexamplePlace");
    assert.equal(payload.google_url, "https://maps.google.com/?cid=1");
    assert.equal(payload.latitude, "32.7767");
    assert.equal(payload.longitude, "-96.797");
    assert.equal(payload.address, "100 Oak St, Dallas, TX 75201, USA");
    assert.equal(payload.city, "Dallas");
    assert.equal(payload.state, "TX");
    assert.equal(payload.zip, "75201");
    assert.equal(payload.country, "US");
    assert.equal(payload.category, "hair_care");
    assert.equal(payload.tags, "hair_care,establishment,point_of_interest");
    assert.equal(payload.business_phone, "+1 214-555-0100");
    assert.equal(payload.website, "https://oak.example");
    assert.equal(
      payload.opening_hours,
      "Monday: 9:00 AM – 5:00 PM | Tuesday: 9:00 AM – 5:00 PM",
    );
    assert.equal(
      payload.opening_hours_json,
      JSON.stringify([
        { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } },
      ]),
    );
    assert.equal(payload.timezone, "-300");
    assert.equal(
      flattenGoogleBusinessPlace({ name: "Only name" }),
      null,
    );
    assert.equal(
      flattenGoogleBusinessPlace({ place_id: "abc" }),
      null,
    );
  });
});

describe("CO-5D1 security and D1 boundaries", () => {
  it("never exposes the Make webhook or accepts tenant identifiers from the browser", () => {
    for (const file of CLIENT_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL/);
      assert.doesNotMatch(source, /hook\.eu2\.make\.com/);
      assert.doesNotMatch(source, /ltjtnat6g4xchr3xjq461y5ho8amno88/);
      assert.doesNotMatch(source, /author_id\s*:/);
      assert.doesNotMatch(source, /organization_id\s*:/);
      assert.doesNotMatch(source, /licensee_id\s*:/);
      assert.doesNotMatch(source, /licenseeAccountId/);
    }
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    assert.match(google, /JSON\.stringify\(selected\)/);
    assert.doesNotMatch(google, /wordpress_author_id/);
  });

  it("keeps Make, Places flattening, and the Google client free of tenant identifiers", () => {
    const sources = [
      "services/googleBusiness/googleBusinessMakeService.ts",
      "services/googleBusiness/googleBusinessMakeTypes.ts",
      "components/prospects/GoogleBusinessDiscovery.tsx",
      "lib/googlePlaces/flattenGoogleBusiness.ts",
    ];
    for (const file of sources) {
      const source = read(file);
      assert.doesNotMatch(source, /consumeGetOblicListingAllocation/);
      assert.doesNotMatch(source, /OpenRouter|openrouter/i);
      assert.doesNotMatch(source, /\/api\/prospects\/from-getoblic/);
    }
    const make = read("services/googleBusiness/googleBusinessMakeService.ts");
    assert.doesNotMatch(make, /convertGetOblicDirectoryListing/);
    assert.doesNotMatch(make, /createProspect/);
    assert.doesNotMatch(make, /claimKnownExistingListing/);
    assert.doesNotMatch(make, /reserveGetOblic/);
    const route = read("app/api/prospects/from-google-business/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /convertGoogleBusinessSelection|addGoogleBusinessListing/);
    assert.doesNotMatch(route, /params\.get\("organization_id"\)/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(route, /body\.author_id/);
    assert.doesNotMatch(route, /assignWordpressListingAuthor/);
  });
});

describe("CO-5D1 server Make integration", () => {
  it("sanitizes the client payload and ignores tenant identifiers", () => {
    const sanitized = sanitizeGoogleBusinessPayload(
      validPayload({
        author_id: 999,
        organization_id: ORG_A,
        organizationId: ORG_A,
        licensee_id: "lic-1",
        extra: "drop-me",
      }),
    );
    assert.equal(sanitized.action, GOOGLE_BUSINESS_ADD_ACTION);
    assert.equal(sanitized.company_name, "Oak Street Salon");
    assert.equal(sanitized.google_id, "ChIJexamplePlace");
    assert.equal(Object.hasOwn(sanitized, "author_id"), false);
    assert.equal(Object.hasOwn(sanitized, "organization_id"), false);
    assert.equal(Object.hasOwn(sanitized, "extra"), false);
    assert.throws(
      () => sanitizeGoogleBusinessPayload({ company_name: "X" }),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_PAYLOAD");
        return true;
      },
    );
  });

  it("resolves wordpress_author_id server-side and calls Make with GET query fields", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const result = await addGoogleBusinessListing(
      {
        organizationId: ORG_A,
        payload: validPayload({
          author_id: 999,
          organization_id: "should-not-win",
        }),
      },
      {
        getSettings: async (organizationId) => {
          assert.equal(organizationId, ORG_A);
          return settingsResult(42);
        },
        readWebhookUrl: () => WEBHOOK,
        fetchImpl: (async (input, init) => {
          calls.push({ url: String(input), init });
          return new Response(
            JSON.stringify({ listing_id: "8801", google_id: "ChIJexamplePlace" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }) as typeof fetch,
      },
    );

    assert.equal(result.wordpress_listing_id, 8801);
    assert.equal(result.google_id, "ChIJexamplePlace");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.init?.method, "GET");
    const url = new URL(calls[0]!.url);
    assert.equal(url.origin + url.pathname, WEBHOOK);
    assert.equal(url.searchParams.get("action"), "business_add_listing_google");
    assert.equal(url.searchParams.get("company_name"), "Oak Street Salon");
    assert.equal(url.searchParams.get("google_id"), "ChIJexamplePlace");
    assert.equal(url.searchParams.get("author_id"), "42");
    assert.notEqual(url.searchParams.get("author_id"), "999");
    assert.equal(url.searchParams.get("organization_id"), null);
    assert.equal(url.searchParams.get("city"), "Dallas");
    assert.equal(url.searchParams.get("state"), "TX");
    assert.equal(url.searchParams.get("zip"), "75201");
    assert.equal(url.searchParams.get("country"), "US");
    assert.equal(url.searchParams.get("category"), "hair_care");
    assert.equal(
      url.searchParams.get("tags"),
      "hair_care,establishment,point_of_interest",
    );
    assert.equal(url.searchParams.get("business_phone"), "+1 214-555-0100");
    assert.equal(url.searchParams.get("website"), "https://oak.example");
    assert.equal(
      url.searchParams.get("opening_hours"),
      "Monday: 9:00 AM – 5:00 PM | Tuesday: 9:00 AM – 5:00 PM",
    );
    assert.equal(url.searchParams.get("timezone"), "-300");
    assert.equal(url.searchParams.get("latitude"), "32.7767");
    assert.equal(url.searchParams.get("longitude"), "-96.797");
    assert.match(url.searchParams.get("opening_hours_json") ?? "", /0900/);
  });

  it("fails closed when the GetOblic author mapping is missing", async () => {
    let fetched = false;
    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG_A, payload: validPayload() },
          {
            getSettings: async () => settingsResult(null),
            readWebhookUrl: () => WEBHOOK,
            fetchImpl: (async () => {
              fetched = true;
              return new Response("{}", { status: 200 });
            }) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING");
        return true;
      },
    );
    assert.equal(fetched, false);

    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG_A, payload: validPayload() },
          {
            getSettings: async () => ({
              configured: false,
              code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
            }),
            readWebhookUrl: () => WEBHOOK,
            fetchImpl: (async () => {
              fetched = true;
              return new Response("{}", { status: 200 });
            }) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING");
        return true;
      },
    );
  });

  it("fails safely when the webhook env is missing", async () => {
    let fetched = false;
    const previous = process.env[GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV];
    delete process.env[GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV];
    try {
      await assert.rejects(
        () =>
          addGoogleBusinessListing(
            { organizationId: ORG_A, payload: validPayload() },
            {
              getSettings: async () => settingsResult(42),
              fetchImpl: (async () => {
                fetched = true;
                return new Response("{}", { status: 200 });
              }) as typeof fetch,
            },
          ),
        (error: unknown) => {
          assert.ok(error instanceof GoogleBusinessMakeError);
          assert.equal(error.code, "GOOGLE_BUSINESS_WEBHOOK_NOT_CONFIGURED");
          assert.doesNotMatch(error.message, /hook\.|make\.com/i);
          return true;
        },
      );
    } finally {
      if (previous === undefined) {
        delete process.env[GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV];
      } else {
        process.env[GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV] = previous;
      }
    }
    assert.equal(fetched, false);
    assert.match(
      read("services/googleBusiness/googleBusinessMakeTypes.ts"),
      /ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL/,
    );
    assert.equal(
      GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV,
      "ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL",
    );
  });

  it("handles timeout, malformed JSON, and invalid Make identities", async () => {
    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG_A, payload: validPayload() },
          {
            getSettings: async () => settingsResult(42),
            readWebhookUrl: () => WEBHOOK,
            timeoutMs: 10,
            fetchImpl: ((_input, init) =>
              new Promise((_, reject) => {
                init?.signal?.addEventListener("abort", () => {
                  const error = new Error("Aborted");
                  error.name = "AbortError";
                  reject(error);
                });
              })) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_TIMEOUT");
        assert.doesNotMatch(error.message, /hook\.example/);
        return true;
      },
    );

    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG_A, payload: validPayload() },
          {
            getSettings: async () => settingsResult(42),
            readWebhookUrl: () => WEBHOOK,
            fetchImpl: (async () =>
              new Response("not-json", {
                status: 200,
                headers: { "content-type": "application/json" },
              })) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_RESPONSE");
        assert.doesNotMatch(error.message, /not-json/);
        return true;
      },
    );

    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG_A, payload: validPayload() },
          {
            getSettings: async () => settingsResult(42),
            readWebhookUrl: () => WEBHOOK,
            fetchImpl: (async () =>
              new Response(
                JSON.stringify({
                  listing_id: "abc",
                  google_id: "ChIJexamplePlace",
                  internal: "secret-stack",
                }),
                { status: 200, headers: { "content-type": "application/json" } },
              )) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_RESPONSE");
        assert.doesNotMatch(error.message, /secret-stack/);
        return true;
      },
    );

    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG_A, payload: validPayload() },
          {
            getSettings: async () => settingsResult(42),
            readWebhookUrl: () => WEBHOOK,
            fetchImpl: (async () =>
              new Response(
                JSON.stringify({ listing_id: 12, google_id: "   " }),
                { status: 200, headers: { "content-type": "application/json" } },
              )) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_RESPONSE");
        return true;
      },
    );

    assert.equal(readPositiveInteger("8801"), 8801);
    assert.equal(readPositiveInteger(0), null);
    assert.equal(readPositiveInteger(-3), null);
    assert.equal(readPositiveInteger("12.5"), null);
  });

  it("requires current organization context on the route and does not log the webhook query", () => {
    const route = read("app/api/prospects/from-google-business/route.ts");
    const service = read(
      "services/googleBusiness/googleBusinessMakeService.ts",
    );
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /convertGoogleBusinessSelection|addGoogleBusinessListing/);
    assert.match(route, /Cache-Control": "no-store"/);
    assert.doesNotMatch(route, /ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL/);
    assert.doesNotMatch(service, /console\.(log|info|error|warn)\([^)]*requestUrl/);
    assert.doesNotMatch(service, /console\.(log|info|error|warn)\([^)]*webhookUrl/);
    assert.match(service, /AbortController/);
    assert.match(service, /method: "GET"/);
    assert.match(service, /Never log the webhook URL or query string/);
  });
});

describe("CO-5D1 i18n", () => {
  it("adds Google discovery copy in all six tenant languages", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const find = DICTIONARIES[language].prospects.find;
      assert.ok(find.methods.directoryLabel);
      assert.ok(find.methods.directoryDescription);
      assert.ok(find.methods.googleLabel);
      assert.ok(find.methods.googleDescription);
      assert.ok(find.google.inputLabel);
      assert.ok(find.google.inputPlaceholder);
      assert.ok(find.google.selected);
      assert.ok(find.google.addCta);
      assert.ok(find.google.adding);
      assert.ok(find.google.loading);
      assert.ok(find.google.missingKey);
      assert.ok(find.google.unavailable);
      assert.ok(find.google.authorMappingMissing);
      assert.ok(find.google.addFailed);
      assert.ok(find.google.success);
      assert.match(find.google.authorMappingMissing, /GetOblic/);
      assert.match(find.google.missingKey, /Athena/);
    }
    assert.notEqual(
      fr.prospects.find.methods.googleLabel,
      en.prospects.find.methods.googleLabel,
    );
    assert.notEqual(de.prospects.find.google.addCta, en.prospects.find.google.addCta);
    assert.notEqual(
      es.prospects.find.google.success,
      en.prospects.find.google.success,
    );
  });
});
