/**
 * GetOblic Links — validation, templates, history, Worker client, API contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  filterGetOblicLinkHistory,
  GETOBLIC_LINKS_HISTORY_LIMIT,
  getOblicLinksHistoryStorageKey,
  markGetOblicLinkHistoryMissing,
  readGetOblicLinksHistory,
  removeGetOblicLinkHistoryEntry,
  upsertGetOblicLinkHistoryEntry,
  writeGetOblicLinksHistory,
} from "../../lib/getoblic-links/history";
import {
  normalizeWorkerLink,
  readPublicBaseUrl,
  toAthenaApiError,
} from "../../lib/getoblic-links/server";
import {
  buildTemplateDestinationUrl,
  GETOBLIC_LINK_TEMPLATES,
} from "../../lib/getoblic-links/templates";
import { GetOblicWorkerError } from "../../lib/getoblic-links/types";
import {
  assertBodyWithinLimit,
  GETOBLIC_LINKS_MAX_BODY_BYTES,
  GETOBLIC_SLUG_PATTERN,
  normalizeSlug,
  parseCreateLinkBody,
  parseUpdateLinkBody,
  validateDestinationUrl,
  validateOptionalSlug,
} from "../../lib/getoblic-links/validation";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function sampleHistoryEntry(
  overrides: Partial<{
    slug: string;
    short_url: string;
    url: string;
    template: "business_created" | "ai_calendar" | "custom";
    created_at: string;
  }> = {},
) {
  return {
    slug: overrides.slug ?? "demo",
    short_url: overrides.short_url ?? "https://link.getoblic.com/demo",
    url: overrides.url ?? "https://claim.getoblic.com/demo",
    template: overrides.template ?? ("custom" as const),
    created_at: overrides.created_at ?? "2026-07-26T00:00:00.000Z",
  };
}

describe("GetOblic Links — templates", () => {
  it("exposes Business Created, AI Calendar, and Custom templates", () => {
    assert.deepEqual(
      GETOBLIC_LINK_TEMPLATES.map((template) => template.id),
      ["business_created", "ai_calendar", "custom"],
    );
  });

  it("builds Business Created destination with URLSearchParams", () => {
    const destination = buildTemplateDestinationUrl({
      templateId: "business_created",
      params: {
        contact_id: "contact_123",
        business_name: "Acme & Co",
      },
    });
    const url = new URL(destination);
    assert.equal(
      url.origin + url.pathname,
      "https://claim.getoblic.com/business-created-page",
    );
    assert.equal(url.searchParams.get("contact_id"), "contact_123");
    assert.equal(url.searchParams.get("business_name"), "Acme & Co");
  });

  it("builds AI Calendar destination", () => {
    const destination = buildTemplateDestinationUrl({
      templateId: "ai_calendar",
      params: { contact_id: "c1" },
    });
    const url = new URL(destination);
    assert.equal(
      url.href,
      "https://voiceai.getoblic.com/ai-calendar-page?contact_id=c1",
    );
  });

  it("uses Custom URL via URL parsing", () => {
    const destination = buildTemplateDestinationUrl({
      templateId: "custom",
      customUrl: "https://claim.getoblic.com/path?x=1",
    });
    assert.equal(destination, "https://claim.getoblic.com/path?x=1");
  });

  it("accepts any HTTP or HTTPS Custom destination", () => {
    assert.equal(
      buildTemplateDestinationUrl({
        templateId: "custom",
        customUrl: "https://example.com/",
      }),
      "https://example.com/",
    );
    assert.equal(
      buildTemplateDestinationUrl({
        templateId: "custom",
        customUrl: "http://example.com/page",
      }),
      "http://example.com/page",
    );
  });

  it("rejects non-http(s) Custom destinations", () => {
    assert.throws(
      () =>
        buildTemplateDestinationUrl({
          templateId: "custom",
          customUrl: "javascript:alert(1)",
        }),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () =>
        buildTemplateDestinationUrl({
          templateId: "custom",
          customUrl: "/relative/path",
        }),
      /valid HTTP or HTTPS URL/i,
    );
  });

  it("requires template fields", () => {
    assert.throws(
      () =>
        buildTemplateDestinationUrl({
          templateId: "business_created",
          params: { contact_id: "c1" },
        }),
      /Business Name is required/i,
    );
  });
});

describe("GetOblic Links — validation", () => {
  it("uses the exact Worker slug pattern", () => {
    assert.equal(GETOBLIC_SLUG_PATTERN.source, "^[A-Za-z0-9_-]{3,64}$");
    assert.equal(normalizeSlug("Tv94jPf"), "Tv94jPf");
  });

  it("accepts any valid absolute HTTP or HTTPS destination", () => {
    assert.equal(
      validateDestinationUrl("https://getoblic.com/example"),
      "https://getoblic.com/example",
    );
    assert.equal(
      validateDestinationUrl("https://claim.getoblic.com/a"),
      "https://claim.getoblic.com/a",
    );
    assert.equal(
      validateDestinationUrl("https://voiceai.getoblic.com/a"),
      "https://voiceai.getoblic.com/a",
    );
    assert.equal(
      validateDestinationUrl("https://example.com/"),
      "https://example.com/",
    );
    assert.equal(
      validateDestinationUrl("https://www.google.com/search?q=test"),
      "https://www.google.com/search?q=test",
    );
    assert.equal(
      validateDestinationUrl("https://sub.example.org/path?a=1&b=2#section"),
      "https://sub.example.org/path?a=1&b=2#section",
    );
    assert.equal(
      validateDestinationUrl("http://example.com/page"),
      "http://example.com/page",
    );
    assert.equal(
      validateDestinationUrl("https://youtube.com/watch?v=example"),
      "https://youtube.com/watch?v=example",
    );
    assert.equal(
      validateDestinationUrl("https://linkedin.com/company/example"),
      "https://linkedin.com/company/example",
    );
    assert.equal(
      validateDestinationUrl("https://example.com:8443/path"),
      "https://example.com:8443/path",
    );
    assert.equal(
      validateDestinationUrl("http://example.com:8080/path"),
      "http://example.com:8080/path",
    );
    assert.equal(
      validateDestinationUrl("https://sub.example.org:9443/a?x=1#section"),
      "https://sub.example.org:9443/a?x=1#section",
    );
  });

  it("rejects non-http(s) schemes, relative URLs, and empty destinations", () => {
    assert.throws(
      () => validateDestinationUrl("javascript:alert(1)"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("data:text/html,test"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("file:///etc/passwd"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("ftp://example.com/file"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("mailto:test@example.com"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("tel:+15555550100"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("about:blank"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("blob:https://example.com/uuid"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("/relative/path"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("example.com/path"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(
      () => validateDestinationUrl("https://"),
      /valid HTTP or HTTPS URL/i,
    );
    assert.throws(() => validateDestinationUrl(""), /valid HTTP or HTTPS URL/i);
    assert.throws(() => validateDestinationUrl("   "), /valid HTTP or HTTPS URL/i);
  });

  it("rejects credential-bearing destinations", () => {
    assert.throws(
      () =>
        validateDestinationUrl("https://user:pass@claim.getoblic.com/a"),
      /credentials/i,
    );
    assert.throws(
      () => validateDestinationUrl("https://user@example.com/path"),
      /credentials/i,
    );
    assert.throws(
      () =>
        validateDestinationUrl("https://user:password@example.com/path"),
      /credentials/i,
    );
  });

  it("accepts mixed-case Worker slugs without lowercasing", () => {
    assert.equal(validateOptionalSlug(""), undefined);
    assert.equal(validateOptionalSlug("abc"), "abc");
    assert.equal(validateOptionalSlug("ABC"), "ABC");
    assert.equal(validateOptionalSlug("AbC_123-x"), "AbC_123-x");
    assert.equal(validateOptionalSlug("Tv94jPf"), "Tv94jPf");
    assert.equal(validateOptionalSlug("  Tv94jPf  "), "Tv94jPf");
  });

  it("rejects invalid slug shapes", () => {
    assert.throws(() => validateOptionalSlug("ab"), GetOblicWorkerError);
    assert.throws(() => validateOptionalSlug("a".repeat(65)), GetOblicWorkerError);
    assert.throws(() => validateOptionalSlug("bad slug"), GetOblicWorkerError);
    assert.throws(() => validateOptionalSlug("has/slash"), GetOblicWorkerError);
    assert.throws(() => validateOptionalSlug("has.period"), GetOblicWorkerError);
    assert.throws(() => validateOptionalSlug("has%2Fsep"), GetOblicWorkerError);
    assert.throws(() => validateOptionalSlug("has%2F"), GetOblicWorkerError);
  });

  it("parses create and update bodies with url and disabled", () => {
    assert.deepEqual(
      parseCreateLinkBody({
        url: "https://claim.getoblic.com/path",
        slug: "demo",
      }),
      { url: "https://claim.getoblic.com/path", slug: "demo" },
    );
    assert.deepEqual(
      parseCreateLinkBody({
        url: "https://example.com/products/item?id=123&utm_source=getoblic#details",
        slug: "ext1",
      }),
      {
        url: "https://example.com/products/item?id=123&utm_source=getoblic#details",
        slug: "ext1",
      },
    );
    assert.deepEqual(
      parseUpdateLinkBody({
        url: "http://example.com/page",
      }),
      { url: "http://example.com/page" },
    );
    assert.deepEqual(parseUpdateLinkBody({ disabled: true }), {
      disabled: true,
    });
    assert.throws(() => parseUpdateLinkBody({}), GetOblicWorkerError);
    assert.throws(
      () => parseUpdateLinkBody({ enabled: false }),
      /disabled/i,
    );
    assert.throws(
      () =>
        parseCreateLinkBody({
          destination: "https://claim.getoblic.com/path",
        }),
      GetOblicWorkerError,
    );
  });

  it("enforces body size limits", () => {
    assert.throws(
      () =>
        assertBodyWithinLimit(
          String(GETOBLIC_LINKS_MAX_BODY_BYTES + 1),
          "x",
        ),
      /exceeds the allowed size/i,
    );
    assert.doesNotThrow(() => assertBodyWithinLimit("12", '{"a":1}'));
  });
});

describe("GetOblic Links — history storage", () => {
  it("namespaces history by organization and user", () => {
    assert.equal(
      getOblicLinksHistoryStorageKey("org1", "user1"),
      "athena:getoblic-links:v1:org1:user1",
    );
  });

  it("upserts, filters, marks missing, and caps at 50", () => {
    const storage = new MemoryStorage();
    const org = "org-a";
    const user = "user-a";

    for (let i = 0; i < 55; i += 1) {
      upsertGetOblicLinkHistoryEntry(
        org,
        user,
        {
          slug: `slug-${i}`,
          short_url: `https://link.getoblic.com/slug-${i}`,
          url: `https://claim.getoblic.com/${i}`,
          template: i % 2 === 0 ? "custom" : "ai_calendar",
          created_at: new Date(2026, 0, 1, 0, i).toISOString(),
          label: i === 54 ? "VIP" : null,
          disabled: i % 3 === 0,
        },
        storage,
      );
    }

    const all = readGetOblicLinksHistory(org, user, storage);
    assert.equal(all.length, GETOBLIC_LINKS_HISTORY_LIMIT);
    assert.equal(all[0]?.slug, "slug-54");
    assert.equal(all[0]?.url.startsWith("https://claim.getoblic.com/"), true);
    assert.equal("destination" in (all[0] as object), false);

    const filtered = filterGetOblicLinkHistory(all, {
      query: "vip",
      template: "all",
      status: "all",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.slug, "slug-54");

    markGetOblicLinkHistoryMissing(org, user, "slug-54", storage);
    const missing = readGetOblicLinksHistory(org, user, storage);
    assert.equal(missing[0]?.missing, true);
    assert.equal(missing[0]?.disabled, true);

    removeGetOblicLinkHistoryEntry(org, user, "slug-54", storage);
    assert.equal(
      readGetOblicLinksHistory(org, user, storage).some(
        (entry) => entry.slug === "slug-54",
      ),
      false,
    );

    const cleared = writeGetOblicLinksHistory(org, user, [], storage);
    assert.equal(cleared, true);
    assert.deepEqual(readGetOblicLinksHistory(org, user, storage), []);
  });

  it("migrates legacy destination/enabled history on read and stores url/disabled", () => {
    const storage = new MemoryStorage();
    const key = getOblicLinksHistoryStorageKey("org-legacy", "user-legacy");
    storage.setItem(
      key,
      JSON.stringify([
        {
          slug: "legacy",
          shortUrl: "https://link.getoblic.com/legacy",
          destination: "https://claim.getoblic.com/legacy",
          template: "custom",
          createdAt: "2026-07-26T00:00:00.000Z",
          enabled: false,
          clicks: 3,
        },
      ]),
    );
    const entries = readGetOblicLinksHistory("org-legacy", "user-legacy", storage);
    assert.equal(entries[0]?.url, "https://claim.getoblic.com/legacy");
    assert.equal(entries[0]?.short_url, "https://link.getoblic.com/legacy");
    assert.equal(entries[0]?.disabled, true);
    assert.equal(entries[0]?.click_count, 3);

    writeGetOblicLinksHistory("org-legacy", "user-legacy", entries, storage);
    const stored = JSON.parse(storage.getItem(key) as string) as Array<
      Record<string, unknown>
    >;
    assert.equal(stored[0]?.url, "https://claim.getoblic.com/legacy");
    assert.equal(stored[0]?.disabled, true);
    assert.equal(stored[0]?.click_count, 3);
    assert.equal("destination" in stored[0], false);
    assert.equal("enabled" in stored[0], false);
    assert.equal("clicks" in stored[0], false);
  });

  it("treats malformed stored JSON as empty history", () => {
    const storage = new MemoryStorage();
    const key = getOblicLinksHistoryStorageKey("org-m", "user-m");
    storage.setItem(key, "{not-json");
    assert.doesNotThrow(() => {
      assert.deepEqual(
        readGetOblicLinksHistory("org-m", "user-m", storage),
        [],
      );
    });
  });

  it("treats non-array stored JSON as empty history", () => {
    const storage = new MemoryStorage();
    const key = getOblicLinksHistoryStorageKey("org-n", "user-n");
    storage.setItem(key, JSON.stringify({ slug: "x" }));
    assert.deepEqual(readGetOblicLinksHistory("org-n", "user-n", storage), []);
  });

  it("does not throw when localStorage read fails", () => {
    const storage = {
      getItem(): string | null {
        throw new Error("SecurityError");
      },
      setItem(): void {
        throw new Error("should not write");
      },
    };
    assert.doesNotThrow(() => {
      assert.deepEqual(
        readGetOblicLinksHistory("org-r", "user-r", storage),
        [],
      );
    });
  });

  it("does not throw when localStorage write fails and returns false", () => {
    const storage = {
      getItem(): string | null {
        return null;
      },
      setItem(): void {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      },
    };
    assert.doesNotThrow(() => {
      const ok = writeGetOblicLinksHistory(
        "org-w",
        "user-w",
        [sampleHistoryEntry()],
        storage,
      );
      assert.equal(ok, false);
    });
  });

  it("keeps history helpers non-throwing under storage failures", () => {
    const storage = {
      getItem(): string | null {
        throw new Error("disabled");
      },
      setItem(): void {
        throw new Error("disabled");
      },
    };
    assert.doesNotThrow(() => {
      assert.deepEqual(
        upsertGetOblicLinkHistoryEntry(
          "org-x",
          "user-x",
          sampleHistoryEntry(),
          storage,
        ),
        [sampleHistoryEntry()],
      );
      assert.deepEqual(
        removeGetOblicLinkHistoryEntry("org-x", "user-x", "demo", storage),
        [],
      );
      assert.deepEqual(
        markGetOblicLinkHistoryMissing("org-x", "user-x", "demo", storage),
        [],
      );
    });
  });
});

describe("GetOblic Links — Worker client normalization", () => {
  it("parses GET link.url / click_count / disabled responses", () => {
    const nested = normalizeWorkerLink(
      {
        success: true,
        link: {
          schema_version: 1,
          slug: "abc123",
          url: "https://claim.getoblic.com/dest",
          short_url: "https://link.getoblic.com/abc123",
          created_at: "2026-07-26T00:00:00.000Z",
          updated_at: "2026-07-26T01:00:00.000Z",
          expires_at: null,
          disabled: false,
          click_count: 7,
          first_clicked_at: null,
          last_clicked_at: null,
          contact_id: null,
          business_name: null,
          campaign: null,
          channel: null,
          owner: null,
          created_by: null,
          notes: null,
        },
      },
      "https://link.getoblic.com",
    );
    assert.equal(nested.slug, "abc123");
    assert.equal(nested.url, "https://claim.getoblic.com/dest");
    assert.equal(nested.short_url, "https://link.getoblic.com/abc123");
    assert.equal(nested.click_count, 7);
    assert.equal(nested.disabled, false);
  });

  it("parses create destination_url responses and PATCH link envelopes", () => {
    const created = normalizeWorkerLink(
      {
        success: true,
        slug: "created1",
        short_url: "https://link.getoblic.com/created1",
        destination_url: "https://claim.getoblic.com/new",
        created_at: "2026-07-26T00:00:00.000Z",
        expires_at: null,
        disabled: false,
      },
      "https://link.getoblic.com",
    );
    assert.equal(created.url, "https://claim.getoblic.com/new");
    assert.equal(created.disabled, false);

    const patched = normalizeWorkerLink(
      {
        success: true,
        slug: "xyz",
        short_url: "https://link.getoblic.com/xyz",
        link: {
          slug: "xyz",
          url: "https://claim.getoblic.com/x",
          short_url: "https://link.getoblic.com/xyz",
          disabled: true,
          click_count: 0,
          created_at: null,
          updated_at: null,
          expires_at: null,
        },
      },
      "https://link.getoblic.com",
    );
    assert.equal(patched.disabled, true);
    assert.equal(patched.url, "https://claim.getoblic.com/x");
  });

  it("does not accept speculative destination/enabled aliases", () => {
    assert.throws(
      () =>
        normalizeWorkerLink(
          {
            slug: "xyz",
            destination: "https://claim.getoblic.com/x",
            enabled: false,
          },
          "https://link.getoblic.com",
        ),
      /missing url/i,
    );
  });

  it("maps Worker errors to Athena API errors without leaking secrets", () => {
    const mapped = toAthenaApiError(
      new GetOblicWorkerError("TIMEOUT", "GetOblic Links Worker timed out.", 504),
    );
    assert.equal(mapped.status, 504);
    assert.equal(mapped.body.ok, false);
    assert.equal(mapped.body.error.code, "TIMEOUT");
    assert.doesNotMatch(JSON.stringify(mapped.body), /Bearer|X-API-Key|API_KEY/i);
  });

  it("builds canonical public short_url from public base + slug", () => {
    const daniel = normalizeWorkerLink(
      {
        success: true,
        slug: "daniel",
        short_url: "https://getoblic-links.example.workers.dev/daniel",
        destination_url: "https://claim.getoblic.com/daniel",
        created_at: "2026-07-26T00:00:00.000Z",
        expires_at: null,
        disabled: false,
      },
      "https://link.getoblic.com",
    );
    assert.equal(daniel.short_url, "https://link.getoblic.com/daniel");

    const mixed = normalizeWorkerLink(
      {
        success: true,
        link: {
          slug: "DanielMix",
          url: "https://claim.getoblic.com/dest",
          short_url: "https://getoblic-links.example.workers.dev/DanielMix",
          disabled: false,
          click_count: 0,
        },
      },
      "https://link.getoblic.com",
    );
    assert.equal(mixed.slug, "DanielMix");
    assert.equal(mixed.short_url, "https://link.getoblic.com/DanielMix");
  });

  it("preserves external destination path, query, and fragment from Worker payloads", () => {
    const external =
      "https://example.com/products/item?id=123&utm_source=getoblic#details";
    const record = normalizeWorkerLink(
      {
        success: true,
        slug: "ext-dest",
        short_url: "https://link.getoblic.com/ext-dest",
        destination_url: external,
        created_at: "2026-07-26T00:00:00.000Z",
        expires_at: null,
        disabled: false,
      },
      "https://link.getoblic.com",
    );
    assert.equal(record.url, external);
    assert.equal(record.short_url, "https://link.getoblic.com/ext-dest");
  });

  it("ignores Worker-provided workers.dev short_url when building canonical URL", () => {
    const record = normalizeWorkerLink(
      {
        success: true,
        slug: "abc123",
        short_url: "https://getoblic-links.example.workers.dev/abc123",
        destination_url: "https://claim.getoblic.com/dest",
        disabled: false,
      },
      "https://link.getoblic.com",
    );
    assert.equal(record.short_url, "https://link.getoblic.com/abc123");
    assert.doesNotMatch(record.short_url, /workers\.dev/);
  });
});

describe("GetOblic Links — public base URL resolution", () => {
  const originalEnv = {
    publicBase: process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL,
    base: process.env.GETOBLIC_LINKS_BASE_URL,
  };

  afterEach(() => {
    if (originalEnv.publicBase === undefined) {
      delete process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL;
    } else {
      process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL = originalEnv.publicBase;
    }
    if (originalEnv.base === undefined) {
      delete process.env.GETOBLIC_LINKS_BASE_URL;
    } else {
      process.env.GETOBLIC_LINKS_BASE_URL = originalEnv.base;
    }
  });

  it("strips trailing slashes from GETOBLIC_LINKS_PUBLIC_BASE_URL", () => {
    process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL =
      "https://link.getoblic.com///";
    delete process.env.GETOBLIC_LINKS_BASE_URL;
    assert.equal(readPublicBaseUrl(), "https://link.getoblic.com");
  });

  it("falls back to GETOBLIC_LINKS_BASE_URL when public base is unset", () => {
    delete process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL;
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com/";
    assert.equal(readPublicBaseUrl(), "https://link.getoblic.com");
  });
});

describe("GetOblic Links — Worker client fetch", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    publicBase: process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL,
    base: process.env.GETOBLIC_LINKS_BASE_URL,
    key: process.env.GETOBLIC_LINKS_API_KEY,
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv.publicBase === undefined) {
      delete process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL;
    } else {
      process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL = originalEnv.publicBase;
    }
    if (originalEnv.base === undefined) {
      delete process.env.GETOBLIC_LINKS_BASE_URL;
    } else {
      process.env.GETOBLIC_LINKS_BASE_URL = originalEnv.base;
    }
    if (originalEnv.key === undefined) {
      delete process.env.GETOBLIC_LINKS_API_KEY;
    } else {
      process.env.GETOBLIC_LINKS_API_KEY = originalEnv.key;
    }
  });

  it("sends X-API-Key and url-only create payloads", async () => {
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com";
    process.env.GETOBLIC_LINKS_API_KEY = "test-secret-key";

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          slug: "created1",
          short_url: "https://link.getoblic.com/created1",
          destination_url: "https://claim.getoblic.com/new",
          created_at: "2026-07-26T00:00:00.000Z",
          expires_at: null,
          disabled: false,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const { createGetOblicLink } = await import(
      "../../lib/getoblic-links/server"
    );
    const link = await createGetOblicLink({
      url: "https://claim.getoblic.com/new",
      slug: "created1",
    });

    assert.equal(link.slug, "created1");
    assert.equal(link.url, "https://claim.getoblic.com/new");
    assert.equal(link.short_url, "https://link.getoblic.com/created1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://link.getoblic.com/api/links");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.cache, "no-store");
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("X-API-Key"), "test-secret-key");
    assert.equal(headers.get("Authorization"), null);
    const body = String(calls[0]?.init?.body);
    assert.match(body, /"url":"https:\/\/claim\.getoblic\.com\/new"/);
    assert.doesNotMatch(body, /"destination"/);
  });

  it("forwards an external destination to the Worker without rewriting it", async () => {
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com";
    process.env.GETOBLIC_LINKS_API_KEY = "test-secret-key";

    const destination =
      "https://example.com/products/item?id=123&utm_source=getoblic#details";
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          slug: "ext1",
          short_url: "https://link.getoblic.com/ext1",
          destination_url: destination,
          created_at: "2026-07-26T00:00:00.000Z",
          expires_at: null,
          disabled: false,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const { createGetOblicLink } = await import(
      "../../lib/getoblic-links/server"
    );
    const link = await createGetOblicLink({
      url: destination,
      slug: "ext1",
    });

    assert.equal(link.url, destination);
    assert.equal(link.short_url, "https://link.getoblic.com/ext1");
    const body = String(calls[0]?.init?.body);
    assert.match(
      body,
      /"url":"https:\/\/example\.com\/products\/item\?id=123&utm_source=getoblic#details"/,
    );
  });

  it("create normalizes short_url to public base even when Worker returns workers.dev", async () => {
    process.env.GETOBLIC_LINKS_BASE_URL =
      "https://getoblic-links.example.workers.dev";
    process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL = "https://link.getoblic.com";
    process.env.GETOBLIC_LINKS_API_KEY = "test-secret-key";

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          slug: "daniel",
          short_url: "https://getoblic-links.example.workers.dev/daniel",
          destination_url: "https://claim.getoblic.com/daniel",
          created_at: "2026-07-26T00:00:00.000Z",
          expires_at: null,
          disabled: false,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const { createGetOblicLink } = await import(
      "../../lib/getoblic-links/server"
    );
    const link = await createGetOblicLink({
      url: "https://claim.getoblic.com/daniel",
      slug: "daniel",
    });

    assert.equal(link.short_url, "https://link.getoblic.com/daniel");
    assert.doesNotMatch(link.short_url, /workers\.dev/);
  });

  it("sends disabled (not enabled) on PATCH", async () => {
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com";
    process.env.GETOBLIC_LINKS_API_KEY = "test-secret-key";

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          slug: "demo",
          short_url: "https://link.getoblic.com/demo",
          link: {
            slug: "demo",
            url: "https://claim.getoblic.com/demo",
            short_url: "https://link.getoblic.com/demo",
            disabled: true,
            click_count: 0,
            created_at: null,
            updated_at: null,
            expires_at: null,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const { updateGetOblicLink } = await import(
      "../../lib/getoblic-links/server"
    );
    const link = await updateGetOblicLink("demo", { disabled: true });
    assert.equal(link.disabled, true);
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("X-API-Key"), "test-secret-key");
    const body = String(calls[0]?.init?.body);
    assert.match(body, /"disabled":true/);
    assert.doesNotMatch(body, /"enabled"/);
  });

  it("calls health without X-API-Key even when key is configured", async () => {
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com";
    process.env.GETOBLIC_LINKS_API_KEY = "test-secret-key";

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          success: true,
          service: "getoblic-links",
          status: "healthy",
          kv_binding: "LINKS",
          timestamp: "2026-07-26T00:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const { getGetOblicLinksHealth } = await import(
      "../../lib/getoblic-links/server"
    );
    const health = await getGetOblicLinksHealth();
    assert.equal(health.healthy, true);
    assert.equal(calls[0]?.url, "https://link.getoblic.com/health");
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("X-API-Key"), null);
    assert.equal(headers.get("Authorization"), null);
  });

  it("allows unauthenticated health when API key is missing", async () => {
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com";
    delete process.env.GETOBLIC_LINKS_API_KEY;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
          service: "getoblic-links",
          status: "healthy",
          kv_binding: "LINKS",
          timestamp: "2026-07-26T00:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const { getGetOblicLinksHealth } = await import(
      "../../lib/getoblic-links/server"
    );
    const health = await getGetOblicLinksHealth();
    assert.equal(health.healthy, true);
  });

  it("treats health failures as unavailable instead of throwing", async () => {
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com";
    process.env.GETOBLIC_LINKS_API_KEY = "test-secret-key";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const { getGetOblicLinksHealth } = await import(
      "../../lib/getoblic-links/server"
    );
    const health = await getGetOblicLinksHealth();
    assert.equal(health.healthy, false);
    assert.equal(health.status, "unavailable");
  });
});

describe("GetOblic Links — API route and Identity contracts", () => {
  it("Identity page mounts GetOblicLinksCard in Other tools and a single DeepScrapeWebsiteButton in Website Knowledge", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /GetOblicLinksCard/);
    assert.match(page, /DeepScrapeWebsiteButton/);
    assert.equal((page.match(/<DeepScrapeWebsiteButton/g) ?? []).length, 1);
    const trainedStart = page.indexOf("{trained ? (");
    const trainedBlock = page.slice(
      trainedStart,
      page.indexOf(") : (", trainedStart),
    );
    assert.ok(
      trainedBlock.indexOf("{otherTools}") <
        trainedBlock.indexOf("IdentityWebsiteKnowledge"),
    );
    assert.match(page, /deepScrape=\{deepScrape\}/);
  });

  it("API routes use node runtime, force-dynamic, org auth, and no-store", () => {
    const files = [
      "app/api/getoblic-links/health/route.ts",
      "app/api/getoblic-links/route.ts",
      "app/api/getoblic-links/[slug]/route.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.match(source, /export const runtime = "nodejs"/);
      assert.match(source, /export const dynamic = "force-dynamic"/);
      assert.match(source, /requireCurrentOrganizationContext/);
      assert.match(source, /Cache-Control": "no-store"/);
      assert.match(source, /ok:\s*true/);
      assert.match(source, /ok:\s*false/);
      assert.doesNotMatch(source, /NEXT_PUBLIC_GETOBLIC/);
      assert.doesNotMatch(source, /body\.organizationId/);
    }
  });

  it("server client uses X-API-Key and never Bearer or NEXT_PUBLIC_", () => {
    const server = read("lib/getoblic-links/server.ts");
    assert.match(server, /GETOBLIC_LINKS_API_KEY/);
    assert.match(server, /GETOBLIC_LINKS_BASE_URL/);
    assert.match(server, /GETOBLIC_LINKS_PUBLIC_BASE_URL/);
    assert.match(server, /X-API-Key/);
    assert.doesNotMatch(server, /Authorization:\s*`Bearer/);
    assert.doesNotMatch(server, /NEXT_PUBLIC_GETOBLIC_LINKS/);
    assert.match(server, /cache:\s*"no-store"/);
    assert.doesNotMatch(server, /body\.destination\s*=/);
    assert.doesNotMatch(server, /body\.enabled\s*=/);
  });

  it("destination validation no longer restricts GetOblic hostnames", () => {
    const validation = read("lib/getoblic-links/validation.ts");
    const templates = read("lib/getoblic-links/templates.ts");
    const card = read("components/identity/GetOblicLinksCard.tsx");
    assert.doesNotMatch(validation, /isApprovedGetOblicHostname/);
    assert.doesNotMatch(validation, /approved GetOblic hostname/);
    assert.doesNotMatch(validation, /HTTPS GetOblic URL/);
    assert.match(validation, /parsed\.protocol !== "http:"/);
    assert.match(validation, /parsed\.protocol !== "https:"/);
    assert.doesNotMatch(templates, /approved GetOblic HTTPS/);
    assert.match(card, /Destination URL/);
  });

  it("client card does not reference the Worker API key", () => {
    const card = read("components/identity/GetOblicLinksCard.tsx");
    assert.doesNotMatch(card, /GETOBLIC_LINKS_API_KEY/);
    assert.doesNotMatch(card, /link\.getoblic\.com\/api/);
    assert.match(card, /\/api\/getoblic-links/);
    assert.match(card, /writeClipboardText/);
    assert.match(card, /role="dialog"/);
    assert.match(card, /\{\s*disabled:\s*!disabled\s*\}/);
    assert.match(card, /url:\s*preview/);
  });
});

describe("GetOblic Links — containment", () => {
  it("every button in GetOblicLinksCard declares type; only Create submit uses submit", () => {
    const card = read("components/identity/GetOblicLinksCard.tsx");
    const buttonTags = card.match(/<button\b[^>]*>/g) ?? [];
    assert.ok(buttonTags.length > 0, "expected buttons in GetOblicLinksCard");

    for (const tag of buttonTags) {
      assert.match(
        tag,
        /\btype=(["'])(button|submit)\1/,
        `button missing explicit type: ${tag}`,
      );
    }

    const submitButtons = buttonTags.filter((tag) =>
      /\btype=(["'])submit\1/.test(tag),
    );
    assert.equal(
      submitButtons.length,
      1,
      "only the Create form submit button may use type=submit",
    );
  });

  it("browser-safe GetOblic modules do not import server.ts", () => {
    const browserSafeFiles = [
      "lib/getoblic-links/history.ts",
      "lib/getoblic-links/qr.ts",
      "lib/getoblic-links/templates.ts",
      "lib/getoblic-links/types.ts",
      "lib/getoblic-links/validation.ts",
      "components/identity/GetOblicLinksCard.tsx",
    ];
    for (const file of browserSafeFiles) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /from ["']@\/lib\/getoblic-links\/server["']/,
        `${file} must not import server.ts`,
      );
      assert.doesNotMatch(
        source,
        /from ["']\.\.?\/.*server["']/,
        `${file} must not relative-import server.ts`,
      );
    }
  });

  it("GetOblicLinksCard does not import Worker secret or direct Worker client", () => {
    const card = read("components/identity/GetOblicLinksCard.tsx");
    assert.doesNotMatch(card, /GETOBLIC_LINKS_API_KEY/);
    assert.doesNotMatch(card, /getoblic-links\/server/);
    assert.doesNotMatch(
      card,
      /\b(createGetOblicLink|getGetOblicLink|updateGetOblicLink|deleteGetOblicLink)\b/,
    );
    assert.doesNotMatch(card, /link\.getoblic\.com\/api/);
  });

  it("Identity page keeps GetOblicLinksCard in Other tools and one DeepScrapeWebsiteButton in Website Knowledge", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /<GetOblicLinksCard/);
    assert.equal((page.match(/<DeepScrapeWebsiteButton/g) ?? []).length, 1);
    const trainedStart = page.indexOf("{trained ? (");
    const trainedBlock = page.slice(
      trainedStart,
      page.indexOf(") : (", trainedStart),
    );
    assert.ok(
      trainedBlock.indexOf("{otherTools}") <
        trainedBlock.indexOf("IdentityWebsiteKnowledge"),
    );
  });

  it("GetOblic Links card does not couple into Deep Scrape internals", () => {
    const card = read("components/identity/GetOblicLinksCard.tsx");
    assert.doesNotMatch(card, /DeepScrapeWebsiteButton/);
    assert.doesNotMatch(card, /formatDeepScrapeStatusLabel/);
    assert.doesNotMatch(card, /\/api\/identity\/deep-scrape/);
    const button = read("components/identity/DeepScrapeWebsiteButton.tsx");
    assert.match(button, /syncedInitiallyAvailable/);
    assert.match(button, /\/api\/identity\/deep-scrape/);
  });

  it("GETOBLIC_LINKS_API_KEY remains absent from client files", () => {
    const clientFiles = [
      "components/identity/GetOblicLinksCard.tsx",
      "lib/getoblic-links/history.ts",
      "lib/getoblic-links/qr.ts",
      "lib/getoblic-links/templates.ts",
      "lib/getoblic-links/types.ts",
      "lib/getoblic-links/validation.ts",
      "app/identity/page.tsx",
    ];
    for (const file of clientFiles) {
      assert.doesNotMatch(
        read(file),
        /GETOBLIC_LINKS_API_KEY/,
        `${file} must not contain GETOBLIC_LINKS_API_KEY`,
      );
    }
  });
});
