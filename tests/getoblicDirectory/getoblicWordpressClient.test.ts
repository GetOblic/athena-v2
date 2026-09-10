import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

const ROOT = process.cwd();
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ATHENA_V2_DIRECTORY_API_KEY;
  delete process.env.ATHENA_V2_DIRECTORY_BASE_URL;
});

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("GetOblic WordPress client configuration", () => {
  it("does not expose the API key to browser or NEXT_PUBLIC env", () => {
    const client = read(
      "services/getoblicDirectory/getoblicWordpressClient.ts",
    );
    const types = read("services/getoblicDirectory/getoblicWordpressTypes.ts");
    assert.match(client, /never import this module from client/);
    assert.match(client, /ATHENA_V2_DIRECTORY_API_KEY/);
    assert.match(client, /x-api-key/);
    assert.doesNotMatch(client, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
    assert.doesNotMatch(types, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
    assert.doesNotMatch(client, /Authorization:\s*`Bearer/);
  });

  it("uses the GetOblic Links-style timeout and default WordPress base URL", () => {
    const client = read(
      "services/getoblicDirectory/getoblicWordpressClient.ts",
    );
    const types = read("services/getoblicDirectory/getoblicWordpressTypes.ts");
    assert.match(
      types,
      /https:\/\/getoblic.com\/wp-json\/athena\/v1/,
    );
    assert.match(types, /12_000/);
    assert.match(client, /signal: controller.signal/);
    assert.match(client, /cache:\s*"no-store"/);
  });

  it("fails closed without leaking the key when the API key is missing", async () => {
    delete process.env.ATHENA_V2_DIRECTORY_API_KEY;
    const { getWordpressListingById } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const { GetOblicWordpressError } = await import(
      "../../services/getoblicDirectory/getoblicWordpressTypes"
    );

    await assert.rejects(
      () => getWordpressListingById(1000),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicWordpressError);
        assert.equal(error.code, "CONFIG_MISSING");
        assert.doesNotMatch(error.message, /sk_|key-|secret/i);
        assert.equal(JSON.stringify(error).includes("ATHENA_V2_DIRECTORY_API_KEY="), false);
        return true;
      },
    );
  });
});

describe("GetOblic WordPress client operations", () => {
  it("GETs a listing by id with x-api-key and parses the payload", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          wordpress_listing_id: 1000,
          status: "publish",
          title: "347 West Broadway",
          author_id: 271519816,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { getWordpressListingById } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const listing = await getWordpressListingById(1000);
    assert.equal(listing.wordpress_listing_id, 1000);
    assert.equal(listing.title, "347 West Broadway");
    assert.equal(listing.author_id, 271519816);
    assert.equal(listing.phone, null);
    assert.equal(listing.address, null);
    assert.deepEqual(listing.gallery, []);
    assert.deepEqual(listing.category, []);
    assert.deepEqual(listing.tags, []);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      "https://getoblic.com/wp-json/athena/v1/listings/1000",
    );
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("x-api-key"), "test-directory-key");
    assert.equal(headers.get("Authorization"), null);
  });

  it("preserves LISTING_NOT_FOUND as 404 without leaking the API key", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "super-secret-directory-key";
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          code: "LISTING_NOT_FOUND",
          message: "Listing not found.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { getWordpressListingById } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const { GetOblicWordpressError } = await import(
      "../../services/getoblicDirectory/getoblicWordpressTypes"
    );

    await assert.rejects(
      () => getWordpressListingById(1),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicWordpressError);
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.remoteCode, "LISTING_NOT_FOUND");
        assert.equal(error.status, 404);
        assert.doesNotMatch(error.message, /super-secret-directory-key/);
        assert.doesNotMatch(JSON.stringify(error), /super-secret-directory-key/);
        return true;
      },
    );
  });

  it("assigns an author and treats changed=false as success", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          wordpress_listing_id: 1000,
          wordpress_user_id: 42,
          changed: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { assignWordpressListingAuthor } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const result = await assignWordpressListingAuthor(1000, 42);
    assert.equal(result.changed, false);
    assert.equal(result.wordpress_user_id, 42);
    assert.match(String(calls[0]?.init?.body), /"wordpress_user_id":42/);
  });

  it("resolves or creates a WordPress user by email only", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          wordpress_user_id: 271519816,
          created: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { resolveOrCreateWordpressUser } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const result = await resolveOrCreateWordpressUser("owner@example.com");
    assert.deepEqual(result, {
      wordpress_user_id: 271519816,
      created: false,
    });
    assert.equal(
      calls[0]?.url,
      "https://getoblic.com/wp-json/athena/v1/users/resolve-or-create",
    );
    assert.match(String(calls[0]?.init?.body), /"email":"owner@example.com"/);
  });

  it("GETs listings/search with only the accepted query fields", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          query: {
            keywords: "hair salons in Dallas",
            listing_type: "getoblic_global_search_engine",
            page: 0,
            per_page: 6,
          },
          results: [
            {
              wordpress_listing_id: 683539,
              title: "Uptown Dallas Barber",
              permalink: "https://getoblic.com/listing/uptown",
              status: "publish",
              listing_type: "barbershop",
              category: [
                { term_id: 50466, slug: "barbershop-cst", name: "Barbershop CST" },
              ],
              location_display: "Dallas, TX",
              lat: 32.79,
              lng: -96.81,
              image: null,
              google_id: null,
              author_id: 271519816,
            },
          ],
          pagination: {
            page: 0,
            per_page: 6,
            found_posts: 16,
            max_num_pages: 3,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { searchWordpressListings } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const result = await searchWordpressListings({
      keywords: "hair salons in Dallas",
      listing_type: "getoblic_global_search_engine",
      page: 0,
      per_page: 6,
    });
    assert.equal(result.results[0]?.wordpress_listing_id, 683539);
    assert.equal(result.results[0]?.author_id, 271519816);
    assert.equal(result.pagination.found_posts, 16);
    const url = new URL(calls[0]?.url ?? "");
    assert.equal(url.origin + url.pathname, "https://getoblic.com/wp-json/athena/v1/listings/search");
    assert.equal(url.searchParams.get("keywords"), "hair salons in Dallas");
    assert.equal(url.searchParams.get("listing_type"), "getoblic_global_search_engine");
    assert.equal(url.searchParams.get("page"), "0");
    assert.equal(url.searchParams.get("per_page"), "6");
    assert.equal(url.searchParams.has("query"), false);
    assert.equal(url.searchParams.has("ep_integrate"), false);
    assert.equal(url.searchParams.has("organization_id"), false);
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("x-api-key"), "test-directory-key");
    assert.equal(calls[0]?.init?.method, "GET");
  });

  it("parses a missing search author_id as null without failing the hit", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          query: {
            keywords: "hair",
            listing_type: "getoblic_global_search_engine",
            page: 0,
            per_page: 6,
          },
          results: [
            {
              wordpress_listing_id: 197509,
              title: "Other owner",
              permalink: "https://getoblic.com/listing/other",
              status: "publish",
              listing_type: "barbershop",
              category: [],
              location_display: null,
              lat: null,
              lng: null,
              image: null,
              google_id: null,
            },
          ],
          pagination: {
            page: 0,
            per_page: 6,
            found_posts: 1,
            max_num_pages: 1,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { searchWordpressListings } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const result = await searchWordpressListings({
      keywords: "hair",
      listing_type: "getoblic_global_search_engine",
      page: 0,
      per_page: 6,
    });
    assert.equal(result.results[0]?.wordpress_listing_id, 197509);
    assert.equal(result.results[0]?.author_id, null);
  });

  it("rejects empty keywords before calling WordPress", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { searchWordpressListings } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const { GetOblicWordpressError } = await import(
      "../../services/getoblicDirectory/getoblicWordpressTypes"
    );

    await assert.rejects(
      () =>
        searchWordpressListings({
          keywords: "   ",
          listing_type: "getoblic_global_search_engine",
          page: 0,
          per_page: 6,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicWordpressError);
        assert.equal(error.code, "VALIDATION");
        assert.equal(error.remoteCode, "KEYWORDS_REQUIRED");
        return true;
      },
    );
    assert.equal(called, false);
  });

  it("parses proven listing detail fields and ignores unknown keys", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          listing: {
            wordpress_listing_id: 1000,
            status: "publish",
            title: "347 West Broadway",
            author_id: 271519816,
            google_id: "ChIJ123",
            google_place_url: "https://maps.google.com/?cid=1",
            knowledge_base: "secret-notes",
            phone: "512-555-0100",
            whatsapp: "+15125550100",
            address: "347 West Broadway",
            region: { term_id: 44, slug: "soho", name: "SoHo" },
            lat: "40.721",
            lng: -74.003,
            timezone: "America/New_York",
            work_hours: { Mon: [["09:00", "17:00"]] },
            text_hours: "Mon-Fri 9-5",
            tagline: "Walk-ins welcome",
            description: "A downtown shop.",
            cover: "https://cdn.example.com/cover.jpg",
            gallery: [
              "https://cdn.example.com/1.jpg",
              "https://cdn.example.com/2.jpg",
            ],
            image: "https://cdn.example.com/hero.jpg",
            listing_type: "barbershop",
            category: [
              { term_id: 9, slug: "hair-salons", name: "Hair Salons" },
            ],
            tags: ["Color", { term_id: 3, slug: "fade", name: "Fade" }],
            website: "https://acme.example",
            email: "hello@acme.example",
            facebook: "https://facebook.com/acme",
            instagram: "https://instagram.com/acme",
            linkedin: "https://linkedin.com/company/acme",
            social: [
              { network: "facebook", url: "https://facebook.com/acme" },
              { network: "youtube", url: "https://youtube.com/@acme" },
            ],
            unknown_internal: "drop-me",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { getWordpressListingById } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const listing = await getWordpressListingById(1000);
    assert.equal(listing.phone, "512-555-0100");
    assert.equal(listing.whatsapp, "+15125550100");
    assert.equal(listing.address, "347 West Broadway");
    assert.deepEqual(listing.region, {
      term_id: 44,
      slug: "soho",
      name: "SoHo",
    });
    assert.equal(listing.lat, 40.721);
    assert.equal(listing.lng, -74.003);
    assert.equal(listing.timezone, "America/New_York");
    assert.deepEqual(listing.work_hours, { Mon: [["09:00", "17:00"]] });
    assert.equal(listing.text_hours, "Mon-Fri 9-5");
    assert.equal(listing.tagline, "Walk-ins welcome");
    assert.equal(listing.description, "A downtown shop.");
    assert.equal(listing.cover, "https://cdn.example.com/cover.jpg");
    assert.deepEqual(listing.gallery, [
      "https://cdn.example.com/1.jpg",
      "https://cdn.example.com/2.jpg",
    ]);
    assert.equal(listing.image, "https://cdn.example.com/hero.jpg");
    assert.equal(listing.listing_type, "barbershop");
    assert.equal(listing.category[0]?.name, "Hair Salons");
    assert.equal(listing.tags[0]?.name, "Color");
    assert.equal(listing.knowledge_base, "secret-notes");
    assert.equal(listing.website, "https://acme.example");
    assert.equal(listing.email, "hello@acme.example");
    assert.equal(listing.facebook, "https://facebook.com/acme");
    assert.equal(listing.instagram, "https://instagram.com/acme");
    assert.equal(listing.linkedin, "https://linkedin.com/company/acme");
    assert.deepEqual(listing.social, [
      { network: "facebook", url: "https://facebook.com/acme" },
      { network: "youtube", url: "https://youtube.com/@acme" },
    ]);
    assert.equal("unknown_internal" in listing, false);
  });

  it("parses website, email, and social fields and fails closed on malformed values", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          wordpress_listing_id: 1000,
          status: "publish",
          title: "Contact Parse",
          author_id: 271519816,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
          website: "  https://salon.example  ",
          email: "owner@salon.example",
          facebook: "https://facebook.com/salon",
          instagram: "https://instagram.com/salon",
          linkedin: "https://linkedin.com/company/salon",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { getWordpressListingById } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const listing = await getWordpressListingById(1000);
    assert.equal(listing.website, "https://salon.example");
    assert.equal(listing.email, "owner@salon.example");
    assert.equal(listing.facebook, "https://facebook.com/salon");
    assert.equal(listing.instagram, "https://instagram.com/salon");
    assert.equal(listing.linkedin, "https://linkedin.com/company/salon");
  });

  it("ignores unknown listing keys and nulls malformed contact values", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          wordpress_listing_id: 1000,
          status: "publish",
          title: "Bad Contact",
          author_id: 271519816,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
          website: { href: "https://bad.example" },
          email: "not-an-email",
          facebook: ["https://facebook.com/bad"],
          instagram: { url: "https://instagram.com/bad" },
          linkedin: 9,
          social: [{ network: "tiktok" }, "nope"],
          mystery_key: "drop-me",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { getWordpressListingById } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const listing = await getWordpressListingById(1000);
    assert.equal(listing.website, null);
    assert.equal(listing.email, null);
    assert.equal(listing.facebook, null);
    assert.equal(listing.instagram, null);
    assert.equal(listing.linkedin, null);
    assert.deepEqual(listing.social, []);
    assert.equal("mystery_key" in listing, false);
  });

  it("PUTs only the description payload to /listings/{id}/description", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          wordpress_listing_id: 36440,
          changed: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { putWordpressListingDescription } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const result = await putWordpressListingDescription(
      36440,
      "Athena-generated directory copy.",
    );
    assert.equal(result.wordpress_listing_id, 36440);
    assert.equal(result.changed, false);
    assert.equal(
      calls[0]?.url,
      "https://getoblic.com/wp-json/athena/v1/listings/36440/description",
    );
    assert.equal(calls[0]?.init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      description: "Athena-generated directory copy.",
    });
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("x-api-key"), "test-directory-key");
    assert.equal(headers.get("Authorization"), null);
    assert.equal(headers.get("Content-Type"), "application/json");
  });

  it("normalizes a remote description error without leaking the API key", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "super-secret-directory-key";
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          code: "DESCRIPTION_UPDATE_FAILED",
          message: "Could not update description.",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { putWordpressListingDescription } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const { GetOblicWordpressError } = await import(
      "../../services/getoblicDirectory/getoblicWordpressTypes"
    );

    await assert.rejects(
      () => putWordpressListingDescription(36440, "copy"),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicWordpressError);
        assert.equal(error.code, "REMOTE_ERROR");
        assert.equal(error.status, 502);
        assert.match(error.message, /Could not update description/);
        assert.doesNotMatch(error.message, /super-secret-directory-key/);
        assert.doesNotMatch(JSON.stringify(error), /super-secret-directory-key/);
        return true;
      },
    );
  });

  it("fails safely on malformed optional listing detail fields", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          wordpress_listing_id: 1000,
          status: "publish",
          title: "Safe Parse",
          author_id: 271519816,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
          phone: { nested: true },
          whatsapp: ["bad"],
          address: 12,
          region: { unexpected: true },
          lat: "not-a-number",
          lng: { bad: true },
          timezone: { tz: "America/Chicago" },
          work_hours: "not-json",
          text_hours: { hours: "nope" },
          tagline: ["x"],
          description: { html: "<p>nope</p>" },
          cover: { url: "https://cdn.example.com/cover.jpg" },
          gallery: [{ url: "https://cdn.example.com/1.jpg" }, 0, ""],
          image: { src: "https://cdn.example.com/hero.jpg" },
          listing_type: { slug: "barbershop" },
          category: "Hair Salons",
          tags: { name: 9 },
          website: ["https://bad.example"],
          email: { address: "nope@example.com" },
          facebook: { url: "https://facebook.com/nope" },
          instagram: 0,
          linkedin: { href: "https://linkedin.com/nope" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { getWordpressListingById } = await import(
      "../../services/getoblicDirectory/getoblicWordpressClient"
    );
    const listing = await getWordpressListingById(1000);
    assert.equal(listing.wordpress_listing_id, 1000);
    assert.equal(listing.title, "Safe Parse");
    assert.equal(listing.phone, null);
    assert.equal(listing.whatsapp, null);
    assert.equal(listing.address, null);
    assert.equal(listing.region, null);
    assert.equal(listing.lat, null);
    assert.equal(listing.lng, null);
    assert.equal(listing.timezone, null);
    assert.equal(listing.work_hours, null);
    assert.equal(listing.text_hours, null);
    assert.equal(listing.tagline, null);
    assert.equal(listing.description, null);
    assert.equal(listing.cover, null);
    assert.deepEqual(listing.gallery, []);
    assert.equal(listing.image, null);
    assert.equal(listing.listing_type, null);
    assert.deepEqual(listing.category, []);
    assert.deepEqual(listing.tags, []);
    assert.equal(listing.website, null);
    assert.equal(listing.email, null);
    assert.equal(listing.facebook, null);
    assert.equal(listing.instagram, null);
    assert.equal(listing.linkedin, null);
  });
});
