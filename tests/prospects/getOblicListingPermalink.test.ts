/**
 * View GetOblic Listing — authorization, permalink validation, and Funnel CTA.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { GetOblicListingPermalinkAction } from "../../components/prospects/GetOblicListingPermalinkAction";
import { ProspectFunnelShortLinks } from "../../components/prospects/ProspectFunnelShortLinks";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { readPublicHttpsListingPermalink } from "../../lib/prospects/getOblicListingPermalinkDisplay";
import { PROSPECT_FUNNEL_SHORT_LINK_CTAS } from "../../lib/prospects/prospectFunnelShortLinkDisplay";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import { getWordpressListingPermalink } from "../../services/getoblicDirectory/getoblicWordpressClient";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import {
  resolveProspectGetOblicListingPermalink,
  type GetOblicListingPermalinkReader,
} from "../../services/prospects/prospectGetOblicListingPermalink";

const ROOT = process.cwd();
const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LISTING_ID = 946970;
const PERMALINK = "https://getoblic.com/listing/clinique-paris-bercy/";
const PHISH = "https://evil-phish.com/stolen";
const AUTHORIZATION_RPC = "licensee_own_company_unclaimed_getoblic_authorized";
const CANONICAL_ID_RPC = "prospect_canonical_wordpress_listing_id";

const VIEW_LABELS = {
  en: "View GetOblic Listing",
  fr: "Voir le listing GetOblic",
  es: "Ver el listing GetOblic",
  it: "Vedi il listing GetOblic",
  de: "GetOblic-Listing ansehen",
  pt: "Ver o listing GetOblic",
} as const;

const LONG_AI =
  "https://claim.getoblic.com/business-portfolio-ai-agent-page?author_id=42&contact_id=946970&business_name=Acme";
const LONG_PHONE =
  "https://claim.getoblic.com/business-portfolio-virtual-line-page?author_id=42&contact_id=946970&business_name=Acme";
const LONG_CALENDAR =
  "https://claim.getoblic.com/business-portfolio-booking-page?author_id=42&contact_id=946970&business_name=Acme";
const LONG_CLAIM =
  "https://claim.getoblic.com/business-created-page?author_id=42&contact_id=946970&business_name=Acme";
const CALL = "tel:+33162045206,946970#";
const SHORT_AI = "https://link.getoblic.com/pf_ai_agents_slug";
const SHORT_PHONE = "https://link.getoblic.com/pf_virtual_phone_slug";
const SHORT_CALENDAR = "https://link.getoblic.com/pf_calendar_slug";
const SHORT_CLAIM = "https://link.getoblic.com/pf_claim_slug";

type LinkRow = {
  id: string;
  organization_id: string;
  prospect_id: string;
  wordpress_listing_id: number;
  google_id_snapshot: string | null;
  google_id_is_matchable: boolean;
  relationship_origin: string;
  relationship_status: string;
  wordpress_author_id: number | null;
  allocated_at: string | null;
  last_verified_at: string | null;
  last_remote_error: string | null;
  last_remote_error_at: string | null;
  kb_push_status: string;
  kb_last_pushed_executive_version_id: string | null;
  kb_last_content_sha256: string | null;
  kb_last_pushed_at: string | null;
  kb_last_push_error: string | null;
  kb_last_push_error_at: string | null;
  created_by_user_id: string | null;
  created_via_licensee_account_id: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
};

type ProspectRow = {
  id: string;
  organization_id: string;
  business_name: string;
  website: string | null;
  source: string;
  lifecycle_status: string;
  raw_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type Op = {
  op: string;
  table?: string;
  columns?: string;
  filters?: Record<string, unknown>;
  limit?: number | null;
  terminal?: "maybeSingle" | "list";
};

type PermalinkStore = {
  prospects?: ProspectRow[];
  links?: Array<LinkRow | Record<string, unknown>>;
  authorization?: boolean | "error" | "true-string";
  canonicalListingId?: number | string | null | "error";
  activeLinkQueryError?: string;
  failOpenActiveReads?: number;
};

const ACTIVE_LINK_LEAK =
  "athena_getoblic_listing_links wordpress_listing_id=946970 api-key=directory-secret";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function linkRow(
  status: string,
  listingId = LISTING_ID,
  id = "link-1",
): LinkRow {
  return {
    id,
    organization_id: ORG_A,
    prospect_id: PROSPECT_A,
    wordpress_listing_id: listingId,
    google_id_snapshot: null,
    google_id_is_matchable: false,
    relationship_origin: "linked_existing",
    relationship_status: status,
    wordpress_author_id: 42,
    allocated_at: "2026-09-01T00:00:00.000Z",
    last_verified_at: "2026-09-01T00:00:00.000Z",
    last_remote_error: null,
    last_remote_error_at: null,
    kb_push_status: "never",
    kb_last_pushed_executive_version_id: null,
    kb_last_content_sha256: null,
    kb_last_pushed_at: null,
    kb_last_push_error: null,
    kb_last_push_error_at: null,
    created_by_user_id: null,
    created_via_licensee_account_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    released_at: status === "released" ? "2026-09-02T00:00:00.000Z" : null,
  };
}

function prospectRow(overrides: Partial<ProspectRow> = {}): ProspectRow {
  return {
    id: PROSPECT_A,
    organization_id: ORG_A,
    business_name: "Clinique Paris-Bercy",
    website: "https://clinic.example",
    source: "manual",
    lifecycle_status: "New",
    raw_json: {
      wordpress_listing_id: 1,
      permalink: PHISH,
    },
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function unclaimedProspect(): ProspectRow {
  return prospectRow({
    source: "getoblic",
    raw_json: {
      origin: "getoblic_directory",
      wordpress_listing_id: 1,
      permalink: PHISH,
    },
  });
}

function installStore(store: PermalinkStore = {}): { ops: Op[] } {
  const ops: Op[] = [];
  const prospects = store.prospects ?? [];
  const links = store.links ?? [];
  let failOpenActiveReads = store.failOpenActiveReads ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    ops.push({ op: "from", table });
    const filters: Record<string, unknown> = {};
    let columns = "*";
    let rowLimit: number | null = null;
    const rows = (): Record<string, unknown>[] => {
      if (table === "prospects") return prospects as unknown as Record<string, unknown>[];
      if (table === "athena_getoblic_listing_links") {
        return links as unknown as Record<string, unknown>[];
      }
      return [];
    };
    const matching = () =>
      rows().filter((row) =>
        Object.entries(filters).every(([column, expected]) => {
          if (Array.isArray(expected)) return expected.includes(row[column]);
          return row[column] === expected;
        }),
      );
    const isActiveLinkRead = () =>
      table === "athena_getoblic_listing_links" &&
      Array.isArray(filters.relationship_status);
    const snapshot = (terminal: "maybeSingle" | "list"): Op => ({
      op: "read",
      table,
      columns,
      filters: Object.fromEntries(
        Object.entries(filters).map(([column, expected]) => [
          column,
          Array.isArray(expected) ? [...expected] : expected,
        ]),
      ),
      limit: rowLimit,
      terminal,
    });
    const activeLinkError = (message: string) => ({
      data: null,
      error: { code: "57014", message, details: message },
    });
    const builder = {
      select(value?: string) {
        if (typeof value === "string") columns = value;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters[column] = values;
        return builder;
      },
      limit(count: number) {
        rowLimit = count;
        return builder;
      },
      update(values: Record<string, unknown>) {
        ops.push({ op: "update", table });
        void values;
        return builder;
      },
      insert(values: Record<string, unknown>) {
        ops.push({ op: "insert", table });
        void values;
        return builder;
      },
      async maybeSingle() {
        ops.push(snapshot("maybeSingle"));
        if (isActiveLinkRead() && store.activeLinkQueryError) {
          return activeLinkError(store.activeLinkQueryError);
        }
        if (isActiveLinkRead() && failOpenActiveReads > 0) {
          failOpenActiveReads -= 1;
          return activeLinkError("statement timeout");
        }
        const found = matching();
        if (found.length > 1) {
          return {
            data: null,
            error: {
              code: "PGRST116",
              message: "JSON object requested, multiple (or no) rows returned",
              details: `Results contain ${found.length} rows`,
            },
          };
        }
        return { data: found[0] ?? null, error: null };
      },
      then(
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        ops.push(snapshot("list"));
        const found = matching();
        const value =
          isActiveLinkRead() && store.activeLinkQueryError
            ? activeLinkError(store.activeLinkQueryError)
            : {
                data: rowLimit == null ? found : found.slice(0, rowLimit),
                error: null,
              };
        return Promise.resolve(value).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = async (
    fn: string,
    args: Record<string, unknown> = {},
  ) => {
    ops.push({ op: "rpc", table: fn });
    void args;
    if (fn === AUTHORIZATION_RPC) {
      if (store.authorization === "error") {
        return { data: null, error: { message: "authorization lookup failed" } };
      }
      if (store.authorization === "true-string") return { data: "true", error: null };
      return { data: store.authorization === true, error: null };
    }
    if (fn === CANONICAL_ID_RPC) {
      if (store.canonicalListingId === "error") {
        return { data: null, error: { message: "canonical lookup failed" } };
      }
      return { data: store.canonicalListingId ?? null, error: null };
    }
    return { data: null, error: { message: "unexpected rpc" } };
  };

  return { ops };
}

function readerReturning(
  permalink: string,
  listingId = LISTING_ID,
): { calls: number[]; readPermalink: GetOblicListingPermalinkReader } {
  const calls: number[] = [];
  return {
    calls,
    readPermalink: async (wordpressListingId) => {
      calls.push(wordpressListingId);
      return { wordpress_listing_id: listingId, permalink };
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function permalinkPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    success: true,
    wordpress_listing_id: LISTING_ID,
    permalink: PERMALINK,
    ...overrides,
  };
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  delete process.env.ATHENA_V2_DIRECTORY_API_KEY;
  delete process.env.ATHENA_V2_DIRECTORY_BASE_URL;
});

describe("GetOblic listing permalink authorization", () => {
  it("returns only the linked owner's verified permalink and ignores stored URLs", async () => {
    const prospect = prospectRow();
    const { ops } = installStore({
      prospects: [prospect],
      links: [linkRow("linked")],
    });
    const reader = readerReturning(PERMALINK);
    const result = await resolveProspectGetOblicListingPermalink(
      {
        organizationId: ORG_A,
        prospectId: PROSPECT_A,
        wordpressListingId: 1,
        permalink: PHISH,
      } as { organizationId: string; prospectId: string },
      reader.readPermalink,
    );

    assert.deepEqual(result, { permalink: PERMALINK });
    assert.deepEqual(Object.keys(result), ["permalink"]);
    assert.deepEqual(reader.calls, [LISTING_ID]);
    assert.equal(prospect.website, "https://clinic.example");
    assert.equal(prospect.raw_json?.permalink, PHISH);
    assert.equal(ops.some((op) => op.op === "update" || op.op === "insert"), false);
    assert.equal(ops.some((op) => op.op === "rpc"), false);
    assert.equal(strictActiveReads(ops).length, 0);
  });

  it("uses the canonical unclaimed listing id, not raw_json", async () => {
    const prospect = unclaimedProspect();
    installStore({
      prospects: [prospect],
      links: [],
      authorization: true,
      canonicalListingId: "946970",
    });
    const reader = readerReturning(PERMALINK);
    const result = await resolveProspectGetOblicListingPermalink(
      { organizationId: ORG_A, prospectId: PROSPECT_A },
      reader.readPermalink,
    );
    assert.deepEqual(result, { permalink: PERMALINK });
    assert.deepEqual(reader.calls, [LISTING_ID]);
    assert.equal(prospect.website, "https://clinic.example");
  });

  it("fails closed before any permalink read for blocked relationships", async () => {
    const cases: Array<{
      links: LinkRow[];
      code: string;
    }> = [
      { links: [linkRow("claiming")], code: "GETOBLIC_RELATIONSHIP_NOT_LINKED" },
      { links: [linkRow("remote_missing")], code: "GETOBLIC_RELATIONSHIP_NOT_LINKED" },
      { links: [linkRow("released")], code: "GETOBLIC_RELATIONSHIP_NOT_LINKED" },
    ];

    for (const item of cases) {
      installStore({
        prospects: [unclaimedProspect()],
        links: item.links,
        authorization: true,
        canonicalListingId: LISTING_ID,
      });
      const reader = readerReturning(PERMALINK);
      await assert.rejects(
        () =>
          resolveProspectGetOblicListingPermalink(
            { organizationId: ORG_A, prospectId: PROSPECT_A },
            reader.readPermalink,
          ),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, item.code);
          assert.equal("permalink" in error, false);
          return true;
        },
      );
      assert.deepEqual(reader.calls, []);
    }
  });

  it("fails closed for unauthorized, missing, and invalid listings", async () => {
    const reader = readerReturning(PERMALINK);
    const cases: Array<{
      prospects: ProspectRow[];
      authorization?: boolean | "true-string";
      canonicalListingId?: number | string | null;
      code: string;
    }> = [
      {
        prospects: [unclaimedProspect()],
        authorization: false,
        canonicalListingId: LISTING_ID,
        code: "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
      },
      {
        prospects: [unclaimedProspect()],
        authorization: "true-string",
        canonicalListingId: LISTING_ID,
        code: "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
      },
      {
        prospects: [],
        code: "GETOBLIC_PROSPECT_NOT_FOUND",
      },
      {
        prospects: [prospectRow()],
        authorization: true,
        canonicalListingId: LISTING_ID,
        code: "GETOBLIC_LINK_NOT_FOUND",
      },
      {
        prospects: [unclaimedProspect()],
        authorization: true,
        canonicalListingId: null,
        code: "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
      },
      {
        prospects: [unclaimedProspect()],
        authorization: true,
        canonicalListingId: "0",
        code: "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
      },
    ];

    for (const item of cases) {
      installStore({
        prospects: item.prospects,
        links: [],
        authorization: item.authorization,
        canonicalListingId: item.canonicalListingId,
      });
      reader.calls.length = 0;
      await assert.rejects(
        () =>
          resolveProspectGetOblicListingPermalink(
            { organizationId: ORG_A, prospectId: PROSPECT_A },
            reader.readPermalink,
          ),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, item.code);
          return true;
        },
      );
      assert.deepEqual(reader.calls, []);
    }

    installStore({
      prospects: [prospectRow()],
      links: [linkRow("linked")],
    });
    await assert.rejects(
      () =>
        resolveProspectGetOblicListingPermalink(
          { organizationId: ORG_B, prospectId: PROSPECT_A },
          reader.readPermalink,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_NOT_FOUND");
        return true;
      },
    );
    assert.deepEqual(reader.calls, []);
  });

  it("fails closed when the permalink is missing, mismatched, or unsafe", async () => {
    installStore({
      prospects: [prospectRow()],
      links: [linkRow("linked")],
    });
    const logs: string[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args.map((arg) => JSON.stringify(arg)).join(" "));
    };

    const mismatch = readerReturning(PERMALINK, 1);
    await assert.rejects(
      () =>
        resolveProspectGetOblicListingPermalink(
          { organizationId: ORG_A, prospectId: PROSPECT_A },
          mismatch.readPermalink,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_PERMALINK_UNAVAILABLE");
        assert.equal(error.status, 503);
        assert.doesNotMatch(error.message, /getoblic\.com|evil-phish\.com/);
        return true;
      },
    );

    const unsafe = readerReturning("https://user:pass@getoblic.com/listing/x/");
    await assert.rejects(
      () =>
        resolveProspectGetOblicListingPermalink(
          { organizationId: ORG_A, prospectId: PROSPECT_A },
          unsafe.readPermalink,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.status, 503);
        assert.doesNotMatch(error.message, /user:pass/);
        return true;
      },
    );

    await assert.rejects(
      () =>
        resolveProspectGetOblicListingPermalink(
          { organizationId: ORG_A, prospectId: PROSPECT_A },
          async () => {
            throw new GetOblicWordpressError("NOT_FOUND", PHISH, 404);
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_PERMALINK_UNAVAILABLE");
        assert.equal(error.status, 404);
        assert.doesNotMatch(error.message, /evil-phish\.com/);
        return true;
      },
    );

    await assert.rejects(
      () =>
        resolveProspectGetOblicListingPermalink(
          { organizationId: ORG_A, prospectId: PROSPECT_A },
          async () => {
            throw new Error(PHISH);
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.status, 503);
        assert.doesNotMatch(error.message, /evil-phish\.com/);
        return true;
      },
    );
    assert.equal(logs.some((line) => line.includes(PHISH) || line.includes("user:pass")), false);
  });
});

describe("permalink active-link fail-closed check", () => {
  it("calls WordPress only after the strict read confirms zero active rows", async () => {
    const { ops } = installStore({
      prospects: [unclaimedProspect()],
      links: [],
      authorization: true,
      canonicalListingId: "946970",
    });
    const reader = readerReturning(PERMALINK);
    const logs: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    const result = await resolveProspectGetOblicListingPermalink(
      {
        organizationId: ORG_A,
        prospectId: PROSPECT_A,
        wordpressListingId: 1,
        permalink: PHISH,
      } as { organizationId: string; prospectId: string },
      reader.readPermalink,
    );

    assert.deepEqual(result, { permalink: PERMALINK });
    assert.deepEqual(Object.keys(result), ["permalink"]);
    assert.deepEqual(reader.calls, [LISTING_ID]);
    assertStrictActiveRead(ops);
    assert.equal(
      logs.some(
        (entry) =>
          entry[0] === "[GETOBLIC_LISTING_PERMALINK] active_link_check_failed",
      ),
      false,
    );
    assert.equal(ops.some((op) => op.op === "update" || op.op === "insert"), false);
  });

  for (const item of [
    {
      name: "active linked",
      outcome: "nonempty",
      links: [{ ...linkRow("linked"), last_remote_error: ACTIVE_LINK_LEAK }],
      failOpenActiveReads: 1,
    },
    {
      name: "claiming",
      outcome: "nonempty",
      links: [{ ...linkRow("claiming"), last_remote_error: ACTIVE_LINK_LEAK }],
      failOpenActiveReads: 1,
    },
    {
      name: "remote_missing",
      outcome: "nonempty",
      links: [
        { ...linkRow("remote_missing"), last_remote_error: ACTIVE_LINK_LEAK },
      ],
      failOpenActiveReads: 1,
    },
    {
      name: "database error",
      outcome: "query_error",
      links: [],
      activeLinkQueryError: ACTIVE_LINK_LEAK,
    },
    {
      name: "malformed row",
      outcome: "malformed",
      links: [
        {
          id: null,
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          relationship_status: "linked",
          last_remote_error: ACTIVE_LINK_LEAK,
        },
      ],
    },
    {
      name: "ambiguous result",
      outcome: "ambiguous",
      links: [
        {
          ...linkRow("linked", LISTING_ID, "link-1"),
          last_remote_error: ACTIVE_LINK_LEAK,
        },
        {
          ...linkRow("claiming", LISTING_ID, "link-2"),
          last_remote_error: ACTIVE_LINK_LEAK,
        },
      ],
    },
  ] as const) {
    it(`fails closed with no WordPress request for ${item.name}`, async () => {
      const { ops } = installStore({
        prospects: [unclaimedProspect()],
        links: [...item.links],
        authorization: true,
        canonicalListingId: LISTING_ID,
        activeLinkQueryError:
          "activeLinkQueryError" in item ? item.activeLinkQueryError : undefined,
        failOpenActiveReads:
          "failOpenActiveReads" in item ? item.failOpenActiveReads : undefined,
      });
      const reader = readerReturning(PERMALINK);
      let fetches = 0;
      globalThis.fetch = (() => {
        fetches += 1;
        return jsonResponse(permalinkPayload());
      }) as typeof fetch;
      const logs: unknown[][] = [];
      console.error = (...args: unknown[]) => {
        logs.push(args);
      };

      await assert.rejects(
        () =>
          resolveProspectGetOblicListingPermalink(
            { organizationId: ORG_A, prospectId: PROSPECT_A },
            reader.readPermalink,
          ),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, "GETOBLIC_LISTING_PERMALINK_UNAVAILABLE");
          assert.equal(error.status, 503);
          assert.equal(error.link, null);
          assert.equal(
            error.message,
            "This GetOblic listing permalink is unavailable.",
          );
          assert.doesNotMatch(
            `${error.message} ${JSON.stringify(error.link)}`,
            /directory-secret|946970|api-key|11111111|aaaaaaaa-aaaa/,
          );
          return true;
        },
      );

      assert.deepEqual(reader.calls, []);
      assert.equal(fetches, 0);
      const strictLogs = logs.filter(
        (entry) =>
          entry[0] === "[GETOBLIC_LISTING_PERMALINK] active_link_check_failed",
      );
      assert.deepEqual(strictLogs, [
        [
          "[GETOBLIC_LISTING_PERMALINK] active_link_check_failed",
          { code: item.outcome },
        ],
      ]);
      assert.doesNotMatch(
        JSON.stringify(strictLogs),
        /directory-secret|946970|api-key|11111111|aaaaaaaa-aaaa/,
      );
      assertStrictActiveRead(ops);
      assert.equal(ops.some((op) => op.op === "update" || op.op === "insert"), false);
    });
  }
});

describe("GetOblic listing permalink WordPress client", () => {
  it("GETs /listings/{id}/permalink and returns the validated URL unchanged", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse(permalinkPayload({ wordpress_listing_id: "946970" }));
    }) as typeof fetch;

    const result = await getWordpressListingPermalink(LISTING_ID);
    assert.deepEqual(result, {
      wordpress_listing_id: LISTING_ID,
      permalink: PERMALINK,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      "https://getoblic.com/wp-json/athena/v1/listings/946970/permalink",
    );
    assert.equal(calls[0]?.init?.method, "GET");
    assert.equal(calls[0]?.init?.body, undefined);
    assert.equal(calls[0]?.init?.redirect, "manual");
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("x-api-key"), "test-directory-key");
    assert.equal(headers.get("Authorization"), null);
    assert.equal(result.permalink, PERMALINK);
  });

  it("rejects mismatched ids, failed success, and non-public URLs without constructing one", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    const calls: string[] = [];
    const payloads: unknown[] = [
      permalinkPayload({ success: false }),
      permalinkPayload({ success: "true" }),
      permalinkPayload({ wordpress_listing_id: 946971, permalink: PHISH }),
      permalinkPayload({ wordpress_listing_id: "0946970" }),
      permalinkPayload({ permalink: PHISH }),
      permalinkPayload({ permalink: "http://getoblic.com/listing/clinique-paris-bercy/" }),
      permalinkPayload({ permalink: "https://user:pass@getoblic.com/listing/x/" }),
      permalinkPayload({ permalink: "https://www.getoblic.com/listing/clinique-paris-bercy/" }),
      permalinkPayload({ permalink: "https://getoblic.com.evil.com/listing/clinique-paris-bercy/" }),
      permalinkPayload({ permalink: "https://getoblic.com:444/listing/clinique-paris-bercy/" }),
      permalinkPayload({ permalink: "https://localhost/listing/x/" }),
      permalinkPayload({ permalink: "https://10.1.2.3/listing/x/" }),
      permalinkPayload({ permalink: "https://192.168.1.8/listing/x/" }),
      permalinkPayload({ permalink: "https://evil.example/phish" }),
      permalinkPayload({ permalink: "/listing/clinique-paris-bercy/" }),
      { success: true, wordpress_listing_id: LISTING_ID, slug: "clinique-paris-bercy" },
    ];
    let index = 0;
    globalThis.fetch = (async (input) => {
      calls.push(String(input));
      return jsonResponse(payloads[index++] ?? null);
    }) as typeof fetch;

    for (let attempt = 0; attempt < payloads.length; attempt += 1) {
      await assert.rejects(
        () => getWordpressListingPermalink(LISTING_ID),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicWordpressError);
          assert.equal(error.code, "INVALID_RESPONSE");
          assert.doesNotMatch(error.message, /evil-phish\.com|user:pass|clinique-paris-bercy/);
          return true;
        },
      );
    }
    assert.equal(calls.length, payloads.length);
    assert.equal(
      calls.every((url) => url.endsWith("/listings/946970/permalink")),
      true,
    );
    const withQuery = `${PERMALINK}?source=directory`;
    assert.equal(readPublicHttpsListingPermalink(PERMALINK), PERMALINK);
    assert.equal(readPublicHttpsListingPermalink(`  ${PERMALINK}  `), PERMALINK);
    assert.equal(readPublicHttpsListingPermalink(withQuery), withQuery);
    assert.equal(readPublicHttpsListingPermalink(PHISH), null);
    assert.equal(
      readPublicHttpsListingPermalink(
        "https://www.getoblic.com/listing/clinique-paris-bercy/",
      ),
      null,
    );
    assert.equal(
      readPublicHttpsListingPermalink(
        "https://getoblic.com.evil.com/listing/clinique-paris-bercy/",
      ),
      null,
    );
    assert.equal(
      readPublicHttpsListingPermalink(
        "https://getoblic.com:444/listing/clinique-paris-bercy/",
      ),
      null,
    );
  });

  it("does not follow a redirect or leak a missing configuration key", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "test-directory-key";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: PHISH },
      });
    }) as typeof fetch;

    await assert.rejects(
      () => getWordpressListingPermalink(LISTING_ID),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicWordpressError);
        assert.doesNotMatch(error.message, /evil-phish\.com/);
        return true;
      },
    );
    assert.equal(calls, 1);

    delete process.env.ATHENA_V2_DIRECTORY_API_KEY;
    calls = 0;
    await assert.rejects(
      () => getWordpressListingPermalink(LISTING_ID),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicWordpressError);
        assert.equal(error.code, "CONFIG_MISSING");
        assert.doesNotMatch(String(error.message), /test-directory-key/);
        return true;
      },
    );
    assert.equal(calls, 0);
  });
});

describe("View GetOblic Listing CTA", () => {
  it("keeps the six locale labels and does not language-route the listing URL", () => {
    const dictionaries = { en, fr, es, it: itMessages, de, pt };
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.equal(
        dictionaries[language].prospects.detail.getoblicFunnelViewListing,
        VIEW_LABELS[language],
      );
      assert.match(
        dictionaries[language].prospects.detail.getoblicFunnelViewListing,
        /GetOblic/,
      );
    }

    const action = read("components/prospects/GetOblicListingPermalinkAction.tsx");
    const page = read("app/prospects/[id]/page.tsx");
    const route = read("app/api/prospects/[id]/getoblic-listing-permalink/route.ts");
    const service = read("services/prospects/prospectGetOblicListingPermalink.ts");

    assert.match(action, /target="_blank"/);
    assert.match(action, /rel="noopener noreferrer"/);
    assert.match(action, /getoblic-listing-permalink/);
    assert.doesNotMatch(action, /getWordpressListingPermalink|licenseeDefaultLanguage|\/fr\//);
    assert.match(page, /GetOblicListingPermalinkAction/);
    assert.match(page, /label=\{copy\.detail\.getoblicFunnelViewListing\}/);
    assert.match(page, /ProspectFunnelShortLinks/);
    assert.match(page, /aiAgentsHref=\{getOblicFunnel\?\.aiAgentsHref/);
    assert.match(page, /virtualPhoneHref=\{getOblicFunnel\?\.virtualPhoneHref/);
    assert.match(page, /calendarHref=\{getOblicFunnel\?\.calendarHref/);
    assert.match(page, /callHref=\{callYourAiHref\}/);
    assert.match(page, /claimHref=\{claimYourAiHref\}/);
    assert.match(page, /GetOblicListingOutboundControls/);
    assert.match(page, /GetOblicListingReleaseControl/);
    assert.doesNotMatch(
      page,
      /resolveProspectGetOblicListingPermalink|getWordpressListingPermalink/,
    );

    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /export async function GET/);
    assert.match(route, /OrganizationAccessError/);
    assert.match(route, /code: "UNAUTHORIZED"/);
    assert.match(route, /\},\s*401,\s*\)/);
    assert.match(route, /error\.status/);
    assert.match(
      route,
      /resolveProspectGetOblicListingPermalink\(\{\s*organizationId,\s*prospectId,\s*\}\)/,
    );
    assert.match(route, /ok: true, permalink: result\.permalink/);
    assert.match(route, /Cache-Control": "no-store"/);
    assert.doesNotMatch(route, /searchParams|request\.json|request\.nextUrl|\.\.\.result/);
    assert.doesNotMatch(route, /wordpress_listing_id|listingId|ATHENA_V2_DIRECTORY_API_KEY|x-api-key/);
    assert.doesNotMatch(service, /ATHENA_V2_DIRECTORY_API_KEY|x-api-key/);
    assert.match(service, /resolveGetOblicOutboundContentTarget/);
    assert.match(service, /linked_owner/);
    assert.match(service, /unclaimed_authorized/);
    assert.doesNotMatch(service, /getActiveGetOblicLinkForProspect/);
    assert.match(service, /ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES/);
    assert.match(
      service,
      /if \(target\.mode === "unclaimed_authorized"\) \{\s*await assertUnclaimedPermalinkHasNoActiveLink\(\s*input\.organizationId,\s*input\.prospectId,/,
    );
    assert.doesNotMatch(
      service,
      /assertUnclaimedPermalinkHasNoActiveLink\(\s*target/,
    );
    const resolverCall = service.indexOf("resolveGetOblicOutboundContentTarget({");
    const strictCall = service.indexOf(
      "await assertUnclaimedPermalinkHasNoActiveLink(",
    );
    const wordpressCall = service.indexOf("readPermalink(target.wordpressListingId)");
    assert.ok(resolverCall !== -1 && resolverCall < strictCall);
    assert.ok(strictCall !== -1 && strictCall < wordpressCall);
    assert.match(
      service,
      /"id, organization_id, prospect_id, relationship_status"/,
    );
    assert.doesNotMatch(service, /select\("\*"\)/);
    assert.doesNotMatch(service, /\.update\(|\.insert\(|updateProspect|raw_json/);

    assert.deepEqual([...PROSPECT_FUNNEL_SHORT_LINK_CTAS], [
      "ai_agents",
      "virtual_phone",
      "calendar",
      "claim_your_ai",
    ]);
    for (const file of [
      "lib/prospects/prospectFunnelShortLinkDisplay.ts",
      "lib/prospects/getOblicFunnelPresentation.ts",
      "services/prospects/prospectFunnelShortLinks.ts",
      "services/prospects/prospectFunnelShortLinkWorker.ts",
      "services/prospects/prospectFunnelCanonicalDestinations.ts",
    ]) {
      assert.doesNotMatch(read(file), /getoblic-listing-permalink|getoblicFunnelViewListing/, file);
    }
  });

  it("renders the five Funnel actions before the permalink request resolves", () => {
    let fetches = 0;
    globalThis.fetch = (() => {
      fetches += 1;
      throw new Error("server render must not request a listing permalink");
    }) as typeof fetch;
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(ProspectFunnelShortLinks, funnelProps()),
        createElement(GetOblicListingPermalinkAction, {
          prospectId: PROSPECT_A,
          label: en.prospects.detail.getoblicFunnelViewListing,
        }),
      ),
    );
    assert.equal(fetches, 0);
    assert.deepEqual(funnelActions(html), [
      "getoblic-funnel-ai-agents",
      "getoblic-funnel-virtual-phone",
      "getoblic-funnel-calendar",
      "getoblic-funnel-call-your-ai",
      "getoblic-funnel-claim-your-ai",
    ]);
    assert.equal(hrefsFromHtml(html)["getoblic-funnel-call-your-ai"], CALL);
    assert.doesNotMatch(html, /getoblic-funnel-view-listing|View GetOblic Listing/);
    assert.match(html, /href="tel:\+33162045206,946970#"/);
  });

  it("adds the sixth action only after a verified permalink and leaves short links intact", async () => {
    const container = ensureDom();
    const root = createRoot(container);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const releases: Array<(response: Response) => void> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return await new Promise<Response>((resolve) => {
        releases.push(resolve);
      });
    }) as typeof fetch;

    try {
      await act(async () => {
        root.render(funnelTree("Voir le listing GetOblic"));
      });
      assert.equal(calls.length, 2);
      assert.equal(calls[0]?.url, `/api/prospects/${PROSPECT_A}/funnel-links`);
      assert.equal(calls[0]?.init?.method, "POST");
      assert.equal(calls[0]?.init?.body, "{}");
      assert.equal(
        calls[1]?.url,
        `/api/prospects/${PROSPECT_A}/getoblic-listing-permalink`,
      );
      assert.equal(calls[1]?.init?.method, "GET");
      assert.equal(calls[1]?.init?.body, undefined);
      assert.equal(calls[1]?.init?.cache, "no-store");
      assert.equal(calls[1]?.init?.credentials, "same-origin");
      assert.equal(calls[1]?.url.includes(String(LISTING_ID)), false);
      assert.deepEqual(Object.keys(hrefs(container)), [
        "getoblic-funnel-ai-agents",
        "getoblic-funnel-virtual-phone",
        "getoblic-funnel-calendar",
        "getoblic-funnel-call-your-ai",
        "getoblic-funnel-claim-your-ai",
      ]);
      assert.equal(hrefs(container)["getoblic-funnel-ai-agents"], LONG_AI);
      assert.equal(hrefs(container)["getoblic-funnel-call-your-ai"], CALL);

      await act(async () => {
        releases[0]?.(
          jsonResponse({
            ok: true,
            links: {
              ai_agents: SHORT_AI,
              virtual_phone: SHORT_PHONE,
              calendar: SHORT_CALENDAR,
              claim_your_ai: SHORT_CLAIM,
              view_listing: "https://link.getoblic.com/pf_view_must_be_ignored",
            },
          }),
        );
        releases[1]?.(
          jsonResponse({
            ok: true,
            wordpress_listing_id: 1,
            permalink: PERMALINK,
          }),
        );
      });

      const current = hrefs(container);
      assert.equal(current["getoblic-funnel-ai-agents"], SHORT_AI);
      assert.equal(current["getoblic-funnel-virtual-phone"], SHORT_PHONE);
      assert.equal(current["getoblic-funnel-calendar"], SHORT_CALENDAR);
      assert.equal(current["getoblic-funnel-claim-your-ai"], SHORT_CLAIM);
      assert.equal(current["getoblic-funnel-call-your-ai"], CALL);
      assert.equal(current["getoblic-funnel-view-listing"], PERMALINK);
      const listing = container.querySelector(
        '[data-prospect-header-action="getoblic-funnel-view-listing"]',
      );
      assert.equal(listing?.getAttribute("target"), "_blank");
      assert.equal(listing?.getAttribute("rel"), "noopener noreferrer");
      assert.equal(listing?.textContent, "Voir le listing GetOblic");
      assert.doesNotMatch(current["getoblic-funnel-view-listing"] ?? "", /\/fr\//);
      const call = container.querySelector(
        '[data-prospect-header-action="getoblic-funnel-call-your-ai"]',
      );
      assert.equal(call?.getAttribute("target"), null);
      assert.equal(
        container.querySelectorAll('a[target="_blank"]').length,
        5,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("keeps the five actions when the permalink request fails or is unsafe", async () => {
    const container = ensureDom();
    const root: Root = createRoot(container);
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("getoblic-listing-permalink")) {
        return jsonResponse({
          ok: true,
          permalink: PHISH,
        });
      }
      return jsonResponse({
        ok: true,
        links: {
          ai_agents: SHORT_AI,
          virtual_phone: SHORT_PHONE,
          calendar: SHORT_CALENDAR,
          claim_your_ai: SHORT_CLAIM,
        },
      });
    }) as typeof fetch;

    try {
      await act(async () => {
        root.render(funnelTree("Voir le listing GetOblic"));
        await Promise.resolve();
        await Promise.resolve();
      });
      const current = hrefs(container);
      assert.equal(current["getoblic-funnel-ai-agents"], SHORT_AI);
      assert.equal(current["getoblic-funnel-call-your-ai"], CALL);
      assert.equal(current["getoblic-funnel-view-listing"], undefined);
      assert.doesNotMatch(container.textContent ?? "", /Voir le listing GetOblic/);
      assert.doesNotMatch(container.innerHTML, /evil-phish\.com|user:pass|\/fr\//);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("drops a late permalink when the Prospect changes or the action unmounts", async () => {
    const container = ensureDom();
    const root = createRoot(container);
    const permalinkB = "https://getoblic.com/listing/autre-clinique/";
    const releases: Array<(response: Response) => void> = [];
    const calls: Array<{ url: string; signal: AbortSignal | null }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push({ url, signal: init?.signal ?? null });
      if (url.includes("getoblic-listing-permalink")) {
        return await new Promise<Response>((resolve) => {
          releases.push(resolve);
        });
      }
      return jsonResponse({
        ok: true,
        links: {
          ai_agents: SHORT_AI,
          virtual_phone: SHORT_PHONE,
          calendar: SHORT_CALENDAR,
          claim_your_ai: SHORT_CLAIM,
        },
      });
    }) as typeof fetch;

    try {
      await act(async () => {
        root.render(funnelTree(en.prospects.detail.getoblicFunnelViewListing));
      });
      const firstPermalink = calls.find((call) =>
        call.url.endsWith(`/prospects/${PROSPECT_A}/getoblic-listing-permalink`),
      );
      assert.ok(firstPermalink?.signal);
      assert.equal(releases.length, 1);

      await act(async () => {
        root.render(
          funnelTree(en.prospects.detail.getoblicFunnelViewListing, PROSPECT_B),
        );
      });
      assert.equal(firstPermalink.signal?.aborted, true);
      const secondPermalink = calls.find((call) =>
        call.url.endsWith(`/prospects/${PROSPECT_B}/getoblic-listing-permalink`),
      );
      assert.ok(secondPermalink?.signal);
      assert.equal(secondPermalink.signal?.aborted, false);
      assert.equal(releases.length, 2);

      await act(async () => {
        releases[0]?.(
          jsonResponse({
            ok: true,
            permalink: PERMALINK,
          }),
        );
      });
      assert.equal(hrefs(container)["getoblic-funnel-view-listing"], undefined);
      assert.doesNotMatch(container.innerHTML, /clinique-paris-bercy/);
      assert.equal(hrefs(container)["getoblic-funnel-ai-agents"], SHORT_AI);
      assert.equal(hrefs(container)["getoblic-funnel-call-your-ai"], CALL);

      await act(async () => {
        releases[1]?.(
          jsonResponse({
            ok: true,
            permalink: permalinkB,
          }),
        );
      });
      assert.equal(hrefs(container)["getoblic-funnel-view-listing"], permalinkB);
      assert.doesNotMatch(container.innerHTML, /clinique-paris-bercy/);

      await act(async () => {
        root.render(funnelTree("Open the listing", PROSPECT_B));
      });
      assert.equal(releases.length, 3);
      const thirdSignal = calls.at(-1)?.signal;
      assert.equal(thirdSignal?.aborted, false);

      await act(async () => {
        root.unmount();
      });
      assert.equal(secondPermalink.signal?.aborted, true);
      assert.equal(thirdSignal?.aborted, true);
      await act(async () => {
        releases[2]?.(
          jsonResponse({
            ok: true,
            permalink: PERMALINK,
          }),
        );
      });
      assert.equal(container.querySelector("a"), null);
      assert.doesNotMatch(container.innerHTML, /clinique-paris-bercy|autre-clinique/);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("keeps the five actions when the permalink request throws", async () => {
    const container = ensureDom();
    const root = createRoot(container);
    globalThis.fetch = (async (input) => {
      if (String(input).includes("getoblic-listing-permalink")) {
        throw new Error("directory unavailable");
      }
      return jsonResponse({
        ok: true,
        links: {
          ai_agents: SHORT_AI,
          virtual_phone: SHORT_PHONE,
          calendar: SHORT_CALENDAR,
          claim_your_ai: SHORT_CLAIM,
        },
      });
    }) as typeof fetch;

    try {
      await act(async () => {
        root.render(funnelTree(en.prospects.detail.getoblicFunnelViewListing));
        await Promise.resolve();
        await Promise.resolve();
      });
      const current = hrefs(container);
      assert.equal(current["getoblic-funnel-ai-agents"], SHORT_AI);
      assert.equal(current["getoblic-funnel-virtual-phone"], SHORT_PHONE);
      assert.equal(current["getoblic-funnel-calendar"], SHORT_CALENDAR);
      assert.equal(current["getoblic-funnel-claim-your-ai"], SHORT_CLAIM);
      assert.equal(current["getoblic-funnel-call-your-ai"], CALL);
      assert.equal(current["getoblic-funnel-view-listing"], undefined);
      assert.doesNotMatch(container.textContent ?? "", /View GetOblic Listing/);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});

function strictActiveReads(ops: Op[]): Op[] {
  return ops.filter(
    (op) =>
      op.terminal === "list" && op.table === "athena_getoblic_listing_links",
  );
}

function assertStrictActiveRead(ops: Op[]) {
  const reads = strictActiveReads(ops);
  assert.equal(reads.length, 1);
  const read = reads[0];
  assert.ok(read);
  assert.equal(
    read.columns,
    "id, organization_id, prospect_id, relationship_status",
  );
  assert.equal(read.columns.includes("wordpress_listing_id"), false);
  assert.equal(read.limit, 2);
  assert.equal(read.filters?.organization_id, ORG_A);
  assert.equal(read.filters?.prospect_id, PROSPECT_A);
  assert.deepEqual(read.filters?.relationship_status, [
    "claiming",
    "linked",
    "remote_missing",
  ]);
  assert.equal("wordpress_listing_id" in (read.filters ?? {}), false);
}

function funnelProps() {
  return {
    prospectId: PROSPECT_A,
    aiAgentsHref: LONG_AI,
    virtualPhoneHref: LONG_PHONE,
    calendarHref: LONG_CALENDAR,
    claimHref: LONG_CLAIM,
    callHref: CALL,
    aiAgentsLabel: "AI Agents",
    virtualPhoneLabel: "Virtual Phone",
    calendarLabel: "Calendar",
    callLabel: "Call your AI",
    claimLabel: "Claim your AI",
  };
}

function funnelTree(label: string, prospectId = PROSPECT_A) {
  return createElement(
    "div",
    null,
    createElement(ProspectFunnelShortLinks, {
      ...funnelProps(),
      prospectId,
    }),
    createElement(GetOblicListingPermalinkAction, {
      prospectId,
      label,
    }),
  );
}

function funnelActions(html: string): string[] {
  return [...html.matchAll(/data-prospect-header-action="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

function hrefsFromHtml(html: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of html.matchAll(
    /data-prospect-header-action="([^"]+)"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*data-prospect-header-action="([^"]+)"/g,
  )) {
    const action = match[1] || match[4] || "";
    const href = match[2] || match[3] || "";
    if (action) found[action] = href;
  }
  return found;
}

function hrefs(container: HTMLElement): Record<string, string> {
  const found: Record<string, string> = {};
  for (const anchor of container.querySelectorAll("a")) {
    const action = anchor.getAttribute("data-prospect-header-action");
    if (action) found[action] = anchor.getAttribute("href") ?? "";
  }
  return found;
}

function ensureDom(): HTMLElement {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/prospects/prospect-1",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: window.document,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: window.navigator,
  });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return window.document.getElementById("root")!;
}
