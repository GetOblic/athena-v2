/**
 * CO-5D1 Google single-business discovery.
 * Source-contract and mocked Make/Google checks. No live Google, Make, or WordPress.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { flattenGoogleBusinessPlace } from "../../lib/googlePlaces/flattenGoogleBusiness";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
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
const ORG_B = "22222222-2222-2222-2222-222222222222";
const WEBHOOK = "https://hook.example.test/google-business";
const originalFetch = globalThis.fetch;
const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

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
    opening_hours_json: JSON.stringify({
      periods: [
        { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } },
      ],
    }),
    timezone: "-300",
    ...overrides,
  };
}

function installOrganizationLanguages(
  languages: Record<string, string | null | undefined>,
): { ids: string[] } {
  const ids: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async () => {
        if (table !== "organizations") {
          return { data: null, error: null };
        }
        const id = filters.id ?? "";
        ids.push(id);
        if (!Object.hasOwn(languages, id)) {
          return { data: null, error: null };
        }
        return { data: { id, language: languages[id] }, error: null };
      },
    };
    return builder;
  };

  return { ids };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

async function captureMakeQuery(
  organizationId: string,
  payloadOverrides: Record<string, unknown> = {},
): Promise<URL> {
  let url = "";
  await addGoogleBusinessListing(
    {
      organizationId,
      payload: validPayload(payloadOverrides),
    },
    {
      getSettings: async (requestedOrganizationId) => {
        assert.equal(requestedOrganizationId, organizationId);
        return settingsResult(42);
      },
      readWebhookUrl: () => WEBHOOK,
      fetchImpl: (async (input) => {
        url = String(input);
        return new Response(
          JSON.stringify({ listing_id: "8801", google_id: "ChIJexamplePlace" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    },
  );
  return new URL(url);
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
    assert.match(discovery, /prospectCapacityReached &&/);
    assert.doesNotMatch(discovery, /listingCapacityReached &&/);
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

describe("CO-5D1 discovery vs conversion authorization", () => {
  function googleSource(): string {
    return read("components/prospects/GoogleBusinessDiscovery.tsx");
  }

  function extractConst(source: string, name: string): string {
    const match = source.match(new RegExp(`const ${name} =\\s*([\\s\\S]*?);`));
    assert.ok(match?.[1], `expected const ${name}`);
    return match[1];
  }

  it("keeps Google autocomplete usable when author mapping is missing", () => {
    const google = googleSource();
    const inputDisabled = extractConst(google, "inputDisabled");
    assert.match(google, /disabled=\{inputDisabled\}/);
    assert.match(inputDisabled, /googleUnavailable/);
    assert.match(inputDisabled, /loaderStatus === "loading"/);
    assert.match(inputDisabled, /submitting/);
    assert.doesNotMatch(inputDisabled, /authorMappingMissing/);
    assert.doesNotMatch(inputDisabled, /prospectCapacityReached/);
    assert.doesNotMatch(inputDisabled, /listingCapacityReached/);
  });

  it("still blocks Add/convert and shows mapping guidance when author mapping is missing", () => {
    const google = googleSource();
    const canSubmit = extractConst(google, "canSubmit");
    assert.match(google, /disabled=\{!canSubmit\}/);
    assert.match(canSubmit, /Boolean\(selected\)/);
    assert.match(canSubmit, /!submitting/);
    assert.match(canSubmit, /!authorMappingMissing/);
    assert.match(canSubmit, /!prospectCapacityReached/);
    assert.match(canSubmit, /loaderStatus === "ready"/);
    assert.match(
      google,
      /if \(!selected \|\| submitting \|\| authorMappingMissing\)/,
    );
    assert.match(google, /\{authorMappingMissing \? \(/);
    assert.match(google, /\{copy\.authorMappingMissing\}/);
  });

  it("still disables the Google input for loader, key, Places, and submit runtime states", () => {
    const google = googleSource();
    const googleUnavailable = extractConst(google, "googleUnavailable");
    const inputDisabled = extractConst(google, "inputDisabled");
    assert.match(googleUnavailable, /loaderStatus === "missing_key"/);
    assert.match(googleUnavailable, /loaderStatus === "unavailable"/);
    assert.match(inputDisabled, /googleUnavailable/);
    assert.match(inputDisabled, /loaderStatus === "loading"/);
    assert.match(inputDisabled, /submitting/);
  });

  it("leaves prospect capacity, mapped-account submit, and Autocomplete init unchanged", () => {
    const google = googleSource();
    const canSubmit = extractConst(google, "canSubmit");
    const inputDisabled = extractConst(google, "inputDisabled");
    assert.match(canSubmit, /!prospectCapacityReached/);
    assert.doesNotMatch(inputDisabled, /prospectCapacityReached/);
    assert.match(google, /\{prospectCapacityReached \? \(/);
    assert.match(google, /\{find\.prospectCapacityReached\}/);
    assert.match(canSubmit, /Boolean\(selected\)/);
    assert.match(canSubmit, /loaderStatus === "ready"/);
    assert.match(google, /loadGoogleMapsPlaces\(apiKey\)/);
    assert.match(google, /new google\.maps\.places\.Autocomplete/);
    assert.match(google, /types: \["establishment"\]/);
    assert.match(google, /\[copy\.choosePlace\]/);
    assert.doesNotMatch(
      google,
      /loadGoogleMapsPlaces\([\s\S]{0,80}authorMappingMissing/,
    );
  });

  it("does not change the GetOblic Directory rail", () => {
    const discovery = read(
      "components/prospects/GetOblicOpportunityDiscovery.tsx",
    );
    assert.match(discovery, /\/api\/getoblic-directory\/search/);
    assert.match(discovery, /\/api\/prospects\/from-getoblic/);
    assert.doesNotMatch(discovery, /authorMappingMissing/);
    assert.doesNotMatch(discovery, /from-google-business/);
    assert.doesNotMatch(discovery, /google.?places/i);
    assert.doesNotMatch(discovery, /inputDisabled/);
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
      JSON.stringify({
        periods: [
          { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } },
        ],
      }),
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

  it("flattens missing weekday_text and periods to empty Make hours fields", () => {
    const withoutHours = flattenGoogleBusinessPlace({
      ...placeFixture(),
      opening_hours: undefined,
    });
    assert.ok(withoutHours);
    assert.equal(withoutHours.opening_hours, "");
    assert.equal(withoutHours.opening_hours_json, '{"periods":[]}');

    const emptyHours = flattenGoogleBusinessPlace({
      ...placeFixture(),
      opening_hours: {},
    });
    assert.ok(emptyHours);
    assert.equal(emptyHours.opening_hours, "");
    assert.equal(emptyHours.opening_hours_json, '{"periods":[]}');
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
      assert.doesNotMatch(source, /funnel_name/);
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
  beforeEach(() => {
    installOrganizationLanguages({ [ORG_A]: "en" });
  });

  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("sanitizes the client payload and ignores tenant identifiers", () => {
    const sanitized = sanitizeGoogleBusinessPayload(
      validPayload({
        author_id: 999,
        organization_id: ORG_A,
        organizationId: ORG_A,
        licensee_id: "lic-1",
        extra: "drop-me",
        funnel_name: "browser-override",
      }),
    );
    assert.equal(sanitized.action, GOOGLE_BUSINESS_ADD_ACTION);
    assert.equal(sanitized.company_name, "Oak Street Salon");
    assert.equal(sanitized.google_id, "ChIJexamplePlace");
    assert.equal(Object.hasOwn(sanitized, "author_id"), false);
    assert.equal(Object.hasOwn(sanitized, "organization_id"), false);
    assert.equal(Object.hasOwn(sanitized, "funnel_name"), false);
    assert.equal(Object.hasOwn(sanitized, "extra"), false);
    assert.throws(
      () => sanitizeGoogleBusinessPayload({ company_name: "X" }),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_PAYLOAD");
        return true;
      },
    );
    assert.throws(
      () =>
        sanitizeGoogleBusinessPayload(
          validPayload({ action: "FR", funnel_name: "athena_FR" }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_PAYLOAD");
        return true;
      },
    );
    assert.throws(
      () =>
        sanitizeGoogleBusinessPayload(
          validPayload({
            action: "business_add_listing_google_FR",
            funnel_name: "athena_FR",
          }),
        ),
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
          funnel_name: "browser-override",
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
    assert.equal(
      url.searchParams.get("action"),
      "business_add_listing_google_EN",
    );
    assert.equal(url.searchParams.get("company_name"), "Oak Street Salon");
    assert.equal(url.searchParams.get("google_id"), "ChIJexamplePlace");
    assert.equal(url.searchParams.get("author_id"), "42");
    assert.notEqual(url.searchParams.get("author_id"), "999");
    assert.equal(url.searchParams.get("organization_id"), null);
    assert.equal(url.searchParams.get("funnel_name"), "athena_EN");
    assert.notEqual(url.searchParams.get("funnel_name"), "browser-override");
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
    assert.equal(
      url.searchParams.get("opening_hours_json"),
      JSON.stringify({
        periods: [
          { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } },
        ],
      }),
    );
    assert.equal(url.searchParams.get("google_url"), "https://maps.google.com/?cid=1");
    assert.equal(url.searchParams.get("address"), "100 Oak St, Dallas, TX 75201, USA");
  });

  it("always sends empty hours defaults and a server funnel_name to Make", async () => {
    const calls: Array<{ url: string }> = [];
    await addGoogleBusinessListing(
      {
        organizationId: ORG_A,
        payload: {
          action: GOOGLE_BUSINESS_ADD_ACTION,
          company_name: "Oak Street Salon",
          google_id: "ChIJexamplePlace",
          funnel_name: "browser-override",
        },
      },
      {
        getSettings: async () => settingsResult(42),
        readWebhookUrl: () => WEBHOOK,
        fetchImpl: (async (input) => {
          calls.push({ url: String(input) });
          return new Response(
            JSON.stringify({ listing_id: "8801", google_id: "ChIJexamplePlace" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }) as typeof fetch,
      },
    );

    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("opening_hours"), "");
    assert.equal(url.searchParams.get("opening_hours_json"), '{"periods":[]}');
    assert.equal(
      url.searchParams.get("action"),
      "business_add_listing_google_EN",
    );
    assert.equal(url.searchParams.get("funnel_name"), "athena_EN");
    assert.notEqual(url.searchParams.get("funnel_name"), "browser-override");
    assert.equal(url.searchParams.get("author_id"), "42");
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
    assert.match(service, /funnel_name/);
    assert.match(service, /GOOGLE_BUSINESS_FUNNEL_NAME/);
    assert.doesNotMatch(service, /"athena"/);
    assert.match(service, /resolveOrganizationLanguage\(organizationId\)/);
    assert.match(service, /language === "fr" \? "FR" : "EN"/);
    assert.doesNotMatch(service, /language\.toUpperCase\(\)/);
    assert.match(
      service,
      /\$\{GOOGLE_BUSINESS_ADD_ACTION\}_\$\{makeLanguageCode\}/,
    );
    assert.match(
      service,
      /\$\{GOOGLE_BUSINESS_FUNNEL_NAME\}_\$\{makeLanguageCode\}/,
    );
    const makeTypes = read(
      "services/googleBusiness/googleBusinessMakeTypes.ts",
    );
    assert.match(makeTypes, /GOOGLE_BUSINESS_FUNNEL_NAME = "athena"/);
    assert.match(service, /action !== GOOGLE_BUSINESS_ADD_ACTION/);
    assert.doesNotMatch(service, /params\.set\("action", payload\.action\)/);
    assert.doesNotMatch(service, /accept-language|navigator\.language|document\.cookie/i);
    assert.doesNotMatch(service, /default_language/);
    assert.doesNotMatch(service, /payload\.language|raw\.language|body\.language/);
    assert.doesNotMatch(service, /raw\.organizationId|raw\.organization_id|payload\.organizationId/);
    const payloadType = read("lib/googlePlaces/googlePlacesTypes.ts");
    assert.match(payloadType, /action: GoogleBusinessAction/);
    assert.doesNotMatch(payloadType, /funnel_name/);
    const flatten = read("lib/googlePlaces/flattenGoogleBusiness.ts");
    assert.match(flatten, /action: GOOGLE_BUSINESS_ADD_ACTION/);
  });

  it("sends business_add_listing_google_FR and athena_FR when organizations.language is fr", async () => {
    installOrganizationLanguages({ [ORG_A]: "fr" });
    const url = await captureMakeQuery(ORG_A, {
      action: GOOGLE_BUSINESS_ADD_ACTION,
      funnel_name: "athena_EN",
      language: "en",
    });
    assert.equal(
      url.searchParams.get("action"),
      "business_add_listing_google_FR",
    );
    assert.equal(url.searchParams.get("funnel_name"), "athena_FR");
    assert.notEqual(url.searchParams.get("funnel_name"), "athena_EN");
  });

  it("sends business_add_listing_google_EN and athena_EN when organizations.language is en", async () => {
    installOrganizationLanguages({ [ORG_A]: "en" });
    const url = await captureMakeQuery(ORG_A, {
      funnel_name: "athena_FR",
      language: "fr",
    });
    assert.equal(
      url.searchParams.get("action"),
      "business_add_listing_google_EN",
    );
    assert.equal(url.searchParams.get("funnel_name"), "athena_EN");
    assert.notEqual(url.searchParams.get("funnel_name"), "athena_FR");
  });

  it("maps es, it, de, and pt organization languages to the EN Make contract", async () => {
    for (const language of ["es", "it", "de", "pt"] as const) {
      installOrganizationLanguages({ [ORG_A]: language });
      const url = await captureMakeQuery(ORG_A, {
        funnel_name: "athena_FR",
        language: "fr",
      });
      assert.equal(
        url.searchParams.get("action"),
        "business_add_listing_google_EN",
      );
      assert.equal(url.searchParams.get("funnel_name"), "athena_EN");
      assert.notEqual(url.searchParams.get("action"), `${language.toUpperCase()}`);
      assert.notEqual(
        url.searchParams.get("funnel_name"),
        `business_add_listing_google_${language.toUpperCase()}`,
      );
    }
  });

  it("does not let a browser language action or funnel_name become Make authority", async () => {
    let fetched = false;
    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          {
            organizationId: ORG_A,
            payload: validPayload({
              action: "FR",
              funnel_name: "athena_FR",
            }),
          },
          {
            getSettings: async () => settingsResult(42),
            readWebhookUrl: () => WEBHOOK,
            fetchImpl: (async () => {
              fetched = true;
              return new Response("{}", { status: 200 });
            }) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_PAYLOAD");
        return true;
      },
    );
    assert.equal(fetched, false);

    fetched = false;
    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          {
            organizationId: ORG_A,
            payload: validPayload({
              action: "business_add_listing_google_FR",
              funnel_name: "athena_FR",
              language: "fr",
            }),
          },
          {
            getSettings: async () => settingsResult(42),
            readWebhookUrl: () => WEBHOOK,
            fetchImpl: (async () => {
              fetched = true;
              return new Response("{}", { status: 200 });
            }) as typeof fetch,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_PAYLOAD");
        return true;
      },
    );
    assert.equal(fetched, false);

    installOrganizationLanguages({ [ORG_A]: "en" });
    const url = await captureMakeQuery(ORG_A, {
      action: GOOGLE_BUSINESS_ADD_ACTION,
      funnel_name: "athena_FR",
      language: "fr",
    });
    assert.equal(
      url.searchParams.get("action"),
      "business_add_listing_google_EN",
    );
    assert.equal(url.searchParams.get("funnel_name"), "athena_EN");
    assert.notEqual(url.searchParams.get("funnel_name"), "athena_FR");
    assert.notEqual(url.searchParams.get("action"), "FR");
  });

  it("uses the server organization language when the body claims another organization", async () => {
    const lookups = installOrganizationLanguages({
      [ORG_A]: "fr",
      [ORG_B]: "en",
    });
    let settingsOrganizationId = "";
    let url = "";
    await addGoogleBusinessListing(
      {
        organizationId: ORG_A,
        payload: validPayload({
          organization_id: ORG_B,
          organizationId: ORG_B,
          language: "en",
          funnel_name: "athena_EN",
        }),
      },
      {
        getSettings: async (organizationId) => {
          settingsOrganizationId = organizationId;
          return settingsResult(42);
        },
        readWebhookUrl: () => WEBHOOK,
        fetchImpl: (async (input) => {
          url = String(input);
          return new Response(
            JSON.stringify({ listing_id: "8801", google_id: "ChIJexamplePlace" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }) as typeof fetch,
      },
    );

    const requestUrl = new URL(url);
    assert.equal(settingsOrganizationId, ORG_A);
    assert.deepEqual(lookups.ids, [ORG_A]);
    assert.equal(
      requestUrl.searchParams.get("action"),
      "business_add_listing_google_FR",
    );
    assert.equal(requestUrl.searchParams.get("funnel_name"), "athena_FR");
    assert.notEqual(requestUrl.searchParams.get("funnel_name"), "athena_EN");
    assert.equal(requestUrl.searchParams.get("organization_id"), null);
  });

  it("maps missing or invalid organization language through the resolver fallback to EN", async () => {
    const invalid = [null, undefined, "", "xx", "english"] as const;
    for (const language of invalid) {
      installOrganizationLanguages({ [ORG_A]: language });
      const url = await captureMakeQuery(ORG_A, {
        language: "fr",
        funnel_name: "athena_FR",
      });
      assert.equal(
        url.searchParams.get("action"),
        "business_add_listing_google_EN",
      );
      assert.equal(url.searchParams.get("funnel_name"), "athena_EN");
    }

    installOrganizationLanguages({});
    const missing = await captureMakeQuery(ORG_A, {
      language: "fr",
      funnel_name: "athena_FR",
    });
    assert.equal(
      missing.searchParams.get("action"),
      "business_add_listing_google_EN",
    );
    assert.equal(missing.searchParams.get("funnel_name"), "athena_EN");
  });
});

describe("CO-5D1 i18n", () => {
  it("adds Google discovery copy in all six tenant languages", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const find = DICTIONARIES[language].prospects.find;
      assert.ok(find.methods.directoryLabel);
      assert.ok(find.methods.directoryDescription);
      assert.ok(find.methods.directoryUnavailable);
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
