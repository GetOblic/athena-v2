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
});
