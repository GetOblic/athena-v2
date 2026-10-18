/**
 * Saved-artifact GetOblic publication for the source Prospect and the
 * converted Client. WordPress is mocked. No remote write is performed.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";
import "./getoblicContentEditorTestDom";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it } from "node:test";
import { GetoblicContentEditor } from "../../components/prospects/GetoblicContentEditor";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import {
  getoblicClientPublicationDeniedHttp,
  publishClientGetOblicDescription,
  publishClientGetOblicKnowledgeBase,
} from "../../services/prospects/getoblicClientPublication";
import type { ClientProspectIntelligenceAuthority } from "../../services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const ROOT = process.cwd();

const CLIENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SOURCE = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const PROSPECT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LICENSEE = "99999999-9999-9999-9999-999999999999";
const VERSION = "5a742720-356d-42b6-b109-566849fe8d71";
const SAVED_DESCRIPTION = "Saved directory description for publication.";
const EDITED_DESCRIPTION = "Edited saved description revision.";
const LEGACY_DESCRIPTION = "Legacy generated description that must not be sent.";
const SAVED_KB = "Saved knowledge base for publication.";
const EXECUTIVE_KB = "Executive intelligence knowledge base that must not be sent.";
const CANONICAL_LISTING_ID = 88021;

const CATALOGS = { en, fr, es, it: itMessages, de, pt } as const;

type Lookup = { table: string; filters: Record<string, unknown>; op: string };

function sha(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function artifact(input: {
  type: "description" | "knowledge_base";
  content: string;
  revision?: number;
  sourceExecutiveVersionId?: string | null;
}) {
  return {
    prospect_id: PROSPECT,
    organization_id: SOURCE,
    artifact_type: input.type,
    revision: input.revision ?? 1,
    content: input.content,
    content_sha256: sha(input.content),
    origin: "edited" as const,
    source_executive_version_id: input.sourceExecutiveVersionId ?? null,
    saved_at: "2026-10-18T12:00:00.000Z",
    saved_by_organization_id: SOURCE,
  };
}

function prospect(overrides: Record<string, unknown> = {}) {
  return {
    id: PROSPECT,
    organization_id: SOURCE,
    business_name: "Harbor Practice",
    lifecycle_status: "Ready",
    linked_discussion_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    source: "manual",
    raw_json: { observed: { description: "Observed copy" } },
    generated_listing_description: { description: LEGACY_DESCRIPTION },
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    organization_id: SOURCE,
    prospect_id: PROSPECT,
    wordpress_listing_id: 36440,
    google_id_snapshot: null,
    google_id_is_matchable: false,
    relationship_origin: "linked_existing",
    relationship_status: "linked",
    wordpress_author_id: 271519816,
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
    released_at: null,
    ...overrides,
  };
}

function conversion(overrides: Record<string, unknown> = {}) {
  return {
    prospect_id: PROSPECT,
    source_organization_id: SOURCE,
    client_organization_id: CLIENT,
    licensee_account_id: LICENSEE,
    licensee_sub_account_id: null,
    status: "active",
    ...overrides,
  };
}

function unclaimedProspect() {
  return prospect({
    source: "getoblic",
    raw_json: {
      origin: "getoblic_directory",
      organization_id: OTHER,
      wordpress_listing_id: 11111,
      observed: { description: EXECUTIVE_KB, wordpress_listing_id: 22222 },
    },
  });
}

type Store = {
  prospects: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  conversions: Array<Record<string, unknown>>;
  authorization?: boolean | "error";
  canonicalListingId?: number | string | null | "error";
  activeClaimLookupError?: boolean;
  dropConversionsAfter?: number;
  conversionReads: number;
};

function install(store: Store): { lookups: Lookup[] } {
  const lookups: Lookup[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    const rows = () => {
      if (table === "licensee_prospect_client_conversions") {
        store.conversionReads += 1;
        if (
          store.dropConversionsAfter != null &&
          store.conversionReads > store.dropConversionsAfter
        ) {
          return [];
        }
      }
      const source =
        table === "prospects"
          ? store.prospects
          : table === "athena_getoblic_listing_links"
            ? store.links
            : table === "prospect_directory_artifacts"
              ? store.artifacts
              : table === "licensee_prospect_client_conversions"
                ? store.conversions
                : [];
      return source.filter((row) =>
        Object.entries(filters).every(([column, expected]) => {
          if (Array.isArray(expected)) return expected.includes(row[column]);
          return row[column] === expected;
        }),
      );
    };
    const builder = {
      select() {
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
      limit() {
        return builder;
      },
      order() {
        return builder;
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        return builder;
      },
      insert(values: Record<string, unknown>) {
        lookups.push({ table, filters: { ...filters }, op: "insert" });
        if (table === "athena_getoblic_listing_links") store.links.push(values);
        return builder;
      },
      then(
        onFulfilled?: (value: {
          data: unknown;
          error: { message: string } | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        lookups.push({ table, filters: { ...filters }, op: "list" });
        if (table === "athena_getoblic_listing_links" && store.activeClaimLookupError) {
          return Promise.resolve({
            data: null,
            error: { message: "active claim lookup failed" },
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: rows(), error: null as null }).then(
          onFulfilled,
          onRejected,
        );
      },
      async maybeSingle() {
        lookups.push({ table, filters: { ...filters }, op: "maybeSingle" });
        if (pendingUpdate && table === "athena_getoblic_listing_links") {
          const matched = rows();
          const next = matched.map((row) => ({ ...row, ...pendingUpdate }));
          store.links = store.links.map((row) => {
            const updated = next.find((item) => item.id === row.id);
            return updated ?? row;
          });
          return { data: next[0] ?? null, error: null };
        }
        return { data: rows()[0] ?? null, error: null };
      },
    };
    return builder;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    lookups.push({ table: fn, filters: args, op: "rpc" });
    if (fn === "licensee_own_company_unclaimed_getoblic_authorized") {
      if (store.authorization === "error") {
        return { data: null, error: { message: "authorization failed" } };
      }
      return { data: store.authorization === true, error: null };
    }
    if (fn === "prospect_canonical_wordpress_listing_id") {
      if (store.canonicalListingId === "error") {
        return { data: null, error: { message: "canonical failed" } };
      }
      return { data: store.canonicalListingId ?? null, error: null };
    }
    return { data: null, error: { message: "unexpected rpc" } };
  };
  return { lookups };
}

function baseStore(overrides: Partial<Store> = {}): Store {
  return {
    prospects: overrides.prospects ?? [prospect()],
    links: overrides.links ?? [link()],
    artifacts: overrides.artifacts ?? [
      artifact({ type: "description", content: SAVED_DESCRIPTION, revision: 3 }),
      artifact({
        type: "knowledge_base",
        content: SAVED_KB,
        revision: 4,
        sourceExecutiveVersionId: VERSION,
      }),
    ],
    conversions: overrides.conversions ?? [conversion()],
    authorization: overrides.authorization,
    canonicalListingId: overrides.canonicalListingId,
    activeClaimLookupError: overrides.activeClaimLookupError,
    dropConversionsAfter: overrides.dropConversionsAfter,
    conversionReads: 0,
  };
}

const activeConversion = {
  prospectId: PROSPECT,
  sourceOrganizationId: SOURCE,
  clientOrganizationId: CLIENT,
  licenseeAccountId: LICENSEE,
  licenseeSubAccountId: null,
  status: "active" as const,
};

function descriptionPort() {
  const calls: Array<{ listingId: number; description: string }> = [];
  return {
    calls,
    putDescription: async (listingId: number, description: string) => {
      calls.push({ listingId, description });
      return { wordpress_listing_id: listingId, changed: true };
    },
  };
}

function knowledgePort(fail?: GetOblicWordpressError) {
  const calls: Array<{ listingId: number; knowledgeBase: string }> = [];
  return {
    calls,
    putKnowledgeBase: async (listingId: number, knowledgeBase: string) => {
      calls.push({ listingId, knowledgeBase });
      if (fail) throw fail;
      return { wordpress_listing_id: listingId, sha256: "remote", changed: true };
    },
  };
}

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
});

describe("client saved-artifact publication", () => {
  it("sends both saved artifacts through the active conversion", async () => {
    const descriptionStore = baseStore();
    const descriptionLookups = install(descriptionStore);
    const descriptions = descriptionPort();
    const descriptionResult = await publishClientGetOblicDescription({
      clientOrganizationId: CLIENT,
      wordpress: descriptions,
    });
    assert.equal(descriptionResult.ok, true);
    if (!descriptionResult.ok) return;
    assert.equal(descriptionResult.result.prospect_id, PROSPECT);
    assert.equal(descriptionResult.result.listing_link_id, "link-1");
    assert.equal(descriptions.calls[0]?.description, SAVED_DESCRIPTION);
    assert.notEqual(descriptions.calls[0]?.description, LEGACY_DESCRIPTION);
    assert.ok(
      descriptionLookups.lookups.some(
        (lookup) =>
          lookup.table === "prospects" && lookup.filters.organization_id === SOURCE,
      ),
    );
    assert.equal(
      descriptionLookups.lookups.some(
        (lookup) =>
          lookup.table === "prospects" && lookup.filters.organization_id === CLIENT,
      ),
      false,
    );
    assert.equal(
      descriptionLookups.lookups.some((lookup) => lookup.op === "insert" || lookup.op === "update"),
      false,
    );

    const knowledgeStore = baseStore({
      prospects: [unclaimedProspect()],
      links: [],
      authorization: true,
      canonicalListingId: CANONICAL_LISTING_ID,
    });
    const knowledgeLookups = install(knowledgeStore);
    const knowledge = knowledgePort();
    const knowledgeResult = await publishClientGetOblicKnowledgeBase({
      clientOrganizationId: CLIENT,
      wordpress: knowledge,
      now: new Date("2026-10-18T12:00:00.000Z"),
    });
    assert.equal(knowledgeResult.ok, true);
    if (!knowledgeResult.ok) return;
    assert.equal(knowledgeResult.result.listing_link_id, null);
    assert.equal(knowledgeResult.result.wordpress_listing_id, CANONICAL_LISTING_ID);
    assert.equal(knowledge.calls[0]?.knowledgeBase, SAVED_KB);
    assert.notEqual(knowledge.calls[0]?.knowledgeBase, EXECUTIVE_KB);
    assert.equal(knowledgeStore.links.length, 0);
    assert.equal(
      knowledgeLookups.lookups.some(
        (lookup) =>
          lookup.table === "athena_executive_intelligence_versions" ||
          lookup.table === "athena_identity" ||
          lookup.table === "client_brain",
      ),
      false,
    );
    assert.equal(
      knowledgeLookups.lookups.some((lookup) => lookup.op === "update" || lookup.op === "insert"),
      false,
    );
  });

  it("denies delegated unclaimed sends when another organization holds the listing", async () => {
    for (const relationship_status of ["claiming", "linked", "remote_missing"] as const) {
      const foreign = link({
        id: `foreign-${relationship_status}`,
        organization_id: OTHER,
        prospect_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        wordpress_listing_id: CANONICAL_LISTING_ID,
        relationship_status,
      });
      const before = JSON.stringify(foreign);
      const descriptionStore = baseStore({
        prospects: [unclaimedProspect()],
        links: [foreign],
        authorization: true,
        canonicalListingId: CANONICAL_LISTING_ID,
      });
      install(descriptionStore);
      const descriptions = descriptionPort();
      await assert.rejects(
        () =>
          publishClientGetOblicDescription({
            clientOrganizationId: CLIENT,
            wordpress: descriptions,
          }),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, "GETOBLIC_LISTING_CLAIMED_OTHER_ORG");
          return true;
        },
      );
      assert.equal(descriptions.calls.length, 0, relationship_status);
      assert.equal(JSON.stringify(descriptionStore.links[0]), before);

      const knowledgeStore = baseStore({
        prospects: [unclaimedProspect()],
        links: [foreign],
        authorization: true,
        canonicalListingId: CANONICAL_LISTING_ID,
      });
      install(knowledgeStore);
      const knowledge = knowledgePort();
      await assert.rejects(
        () =>
          publishClientGetOblicKnowledgeBase({
            clientOrganizationId: CLIENT,
            wordpress: knowledge,
            now: new Date("2026-10-18T12:00:00.000Z"),
          }),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, "GETOBLIC_LISTING_CLAIMED_OTHER_ORG");
          return true;
        },
      );
      assert.equal(knowledge.calls.length, 0, relationship_status);
      assert.equal(knowledgeStore.links.length, 1);
    }
  });

  it("denies a delegated unclaimed send when the active-claim lookup errors", async () => {
    const store = baseStore({
      prospects: [unclaimedProspect()],
      links: [],
      authorization: true,
      canonicalListingId: CANONICAL_LISTING_ID,
      activeClaimLookupError: true,
    });
    install(store);
    const descriptions = descriptionPort();
    await assert.rejects(
      () =>
        publishClientGetOblicDescription({
          clientOrganizationId: CLIENT,
          wordpress: descriptions,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CONCURRENCY_CONFLICT");
        return true;
      },
    );
    assert.equal(descriptions.calls.length, 0);
    assert.equal(store.links.length, 0);
  });

  it("denies reversed, foreign, and ambiguous conversions before WordPress", async () => {
    const reversed = baseStore({ dropConversionsAfter: 2 });
    install(reversed);
    const reversedPort = descriptionPort();
    const reversedResult = await publishClientGetOblicDescription({
      clientOrganizationId: CLIENT,
      wordpress: reversedPort,
    });
    assert.deepEqual(reversedResult, { ok: false, reason: "no_active_conversion" });
    assert.equal(reversedPort.calls.length, 0);

    const foreignPort = descriptionPort();
    const foreign = await publishClientGetOblicDescription({
      clientOrganizationId: CLIENT,
      wordpress: foreignPort,
      resolveAuthority: async () => ({ ok: false, reason: "client_mismatch" }),
    });
    assert.deepEqual(foreign, { ok: false, reason: "client_mismatch" });
    assert.equal(foreignPort.calls.length, 0);
    assert.equal(getoblicClientPublicationDeniedHttp("client_mismatch").status, 404);
    assert.equal(getoblicClientPublicationDeniedHttp("ambiguous_conversion").status, 409);

    const ambiguous = baseStore({
      conversions: [
        conversion(),
        conversion({ licensee_account_id: "88888888-8888-8888-8888-888888888888" }),
      ],
    });
    install(ambiguous);
    const ambiguousPort = knowledgePort();
    const ambiguousResult = await publishClientGetOblicKnowledgeBase({
      clientOrganizationId: CLIENT,
      wordpress: ambiguousPort,
    });
    assert.deepEqual(ambiguousResult, { ok: false, reason: "ambiguous_conversion" });
    assert.equal(ambiguousPort.calls.length, 0);

    let reads = 0;
    const switchedPort = descriptionPort();
    install(baseStore());
    const switched = await publishClientGetOblicDescription({
      clientOrganizationId: CLIENT,
      wordpress: switchedPort,
      resolveAuthority: async (): Promise<ClientProspectIntelligenceAuthority> => {
        reads += 1;
        if (reads === 1) return { ok: true, conversion: activeConversion };
        return {
          ok: true,
          conversion: { ...activeConversion, prospectId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
        };
      },
    });
    assert.deepEqual(switched, { ok: false, reason: "source_mismatch" });
    assert.equal(switchedPort.calls.length, 0);
  });

  it("denies the wrong prospect ownership and a missing listing", async () => {
    const foreignProspect = baseStore({
      prospects: [prospect({ organization_id: OTHER })],
    });
    install(foreignProspect);
    const foreignPort = descriptionPort();
    await assert.rejects(
      () =>
        publishClientGetOblicDescription({
          clientOrganizationId: CLIENT,
          wordpress: foreignPort,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_NOT_FOUND");
        return true;
      },
    );
    assert.equal(foreignPort.calls.length, 0);

    const missingListing = baseStore({ links: [], prospects: [prospect()] });
    install(missingListing);
    const missingPort = knowledgePort();
    await assert.rejects(
      () =>
        publishClientGetOblicKnowledgeBase({
          clientOrganizationId: CLIENT,
          wordpress: missingPort,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LINK_NOT_FOUND");
        return true;
      },
    );
    assert.equal(missingPort.calls.length, 0);
  });

  it("maps a WordPress description failure and does not write Client Brain", async () => {
    install(baseStore());
    const port = descriptionPort();
    port.putDescription = async () => {
      throw new GetOblicWordpressError(
        "REMOTE_ERROR",
        "WordPress rejected the description",
        502,
      );
    };
    await assert.rejects(
      () =>
        publishClientGetOblicDescription({
          clientOrganizationId: CLIENT,
          wordpress: port,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_DESCRIPTION_WRITE_FAILED");
        assert.equal(error.status, 502);
        return true;
      },
    );
    const descriptionService = read(
      "services/getoblicDirectory/getoblicDirectoryDescriptionService.ts",
    );
    const knowledgeService = read(
      "services/getoblicDirectory/getoblicDirectoryKnowledgeBaseService.ts",
    );
    const clientService = read("services/prospects/getoblicClientPublication.ts");
    for (const source of [descriptionService, knowledgeService, clientService]) {
      assert.doesNotMatch(source, /athena_identity|client_brain|generated_listing_description/);
      assert.doesNotMatch(source, /getCurrentExecutiveVersion/);
    }
  });
});

describe("prospect outbound route compatibility", () => {
  it("keeps the existing prospect URLs and session authority", () => {
    const description = read(
      "app/api/prospects/[id]/getoblic-directory/description/route.ts",
    );
    const knowledge = read(
      "app/api/prospects/[id]/getoblic-directory/knowledge-base/route.ts",
    );
    for (const route of [description, knowledge]) {
      assert.match(route, /requireCurrentOrganizationContext/);
      assert.match(route, /_request: NextRequest/);
      assert.doesNotMatch(route, /request\.json|searchParams|body\.description|body\.knowledge/);
    }
    assert.match(description, /syncGetOblicListingDescription/);
    assert.match(knowledge, /syncGetOblicListingKnowledgeBase/);

    const clientDescription = read(
      "app/api/client-prospect-intelligence/getoblic-publication/description/route.ts",
    );
    const clientKnowledge = read(
      "app/api/client-prospect-intelligence/getoblic-publication/knowledge-base/route.ts",
    );
    for (const route of [clientDescription, clientKnowledge]) {
      assert.match(route, /requireCurrentOrganizationContext/);
      assert.match(route, /export async function POST\(_request: NextRequest\)/);
      assert.doesNotMatch(
        route,
        /request\.json|searchParams|prospectId|wordpressListingId|organizationId:\s*body/,
      );
    }
    assert.match(clientDescription, /publishClientGetOblicDescription/);
    assert.match(clientKnowledge, /publishClientGetOblicKnowledgeBase/);
    assert.equal(clientDescription.includes("params"), false);
    assert.equal(clientKnowledge.includes("params"), false);
  });
});

describe("saved publication editor", () => {
  it("does not send automatically, blocks unsaved text, and ignores duplicate clicks", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ?? null });
      return jsonResponse({ ok: true, success: true });
    }) as typeof fetch;
    const mounted = mountEditor({
      surface: "prospect",
      artifact: "description",
      saved: { revision: 2, content: SAVED_DESCRIPTION },
    });
    try {
      assert.equal(calls.length, 0);
      assert.equal(actionButton(mounted.container, "send").disabled, false);
      commitValue(textarea(mounted.container), `${SAVED_DESCRIPTION}\nunsaved draft`);
      assert.equal(calls.length, 0);
      assert.match(mounted.container.textContent ?? "", /last saved revision/);
      assert.equal(
        mounted.container
          .querySelector("[data-getoblic-content-send-warning='saved-revision']")
          ?.textContent,
        en.clientProspectIntelligence.editor.sendPublishesSaved,
      );
      const send = actionButton(mounted.container, "send");
      await act(async () => {
        send.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        send.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.body, null);
      assert.match(calls[0]?.url ?? "", /\/api\/prospects\/.+\/getoblic-directory\/description$/);
      assert.doesNotMatch(JSON.stringify(calls[0]), /unsaved draft/);
      assert.match(mounted.container.textContent ?? "", /Sent successfully/);
    } finally {
      globalThis.fetch = originalFetch;
      mounted.unmount();
    }
  });

  it("keeps send disabled until an explicit save, then sends no textarea body", async () => {
    const calls: Array<{ url: string; body: string | null }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url: String(url), body });
      if (String(url).endsWith("/getoblic-content")) {
        return jsonResponse({
          ok: true,
          revision: 1,
          content: EDITED_DESCRIPTION,
        });
      }
      return jsonResponse({ ok: true, success: true });
    }) as typeof fetch;
    const mounted = mountEditor({
      surface: "client",
      artifact: "knowledge_base",
      saved: null,
    });
    try {
      assert.equal(actionButton(mounted.container, "send").disabled, true);
      commitValue(textarea(mounted.container), EDITED_DESCRIPTION);
      assert.equal(calls.length, 0);
      await clickAction(mounted.container, "save");
      assert.equal(calls.length, 1);
      assert.match(calls[0]?.body ?? "", /Edited saved description revision/);
      assert.equal(actionButton(mounted.container, "send").disabled, false);
      await clickAction(mounted.container, "send");
      assert.equal(calls.length, 2);
      assert.equal(calls[1]?.body, null);
      assert.equal(
        calls[1]?.url,
        "/api/client-prospect-intelligence/getoblic-publication/knowledge-base",
      );
    } finally {
      globalThis.fetch = originalFetch;
      mounted.unmount();
    }
  });
});

describe("publication copy", () => {
  it("keeps the new editor strings in all six languages", () => {
    const keys = [
      "sendDescription",
      "sendKnowledgeBase",
      "sending",
      "sent",
      "sendFailed",
      "sendRequiresSaved",
      "sendPublishesSaved",
    ] as const;
    const canonical = Object.keys(en.clientProspectIntelligence.editor).sort();
    for (const language of ORGANIZATION_LANGUAGES) {
      const editor = CATALOGS[language].clientProspectIntelligence.editor;
      assert.deepEqual(Object.keys(editor).sort(), canonical);
      for (const key of keys) {
        assert.ok(editor[key].trim().length > 0, `${language}.${key}`);
      }
      assert.match(editor.sendPublishesSaved, /GetOblic|editor|éditeur|editor|Editor|editor/i);
    }
    assert.notEqual(fr.clientProspectIntelligence.editor.sendDescription, en.clientProspectIntelligence.editor.sendDescription);
    assert.notEqual(es.clientProspectIntelligence.editor.sendDescription, en.clientProspectIntelligence.editor.sendDescription);
    assert.notEqual(itMessages.clientProspectIntelligence.editor.sendDescription, en.clientProspectIntelligence.editor.sendDescription);
    assert.notEqual(de.clientProspectIntelligence.editor.sendDescription, en.clientProspectIntelligence.editor.sendDescription);
    assert.notEqual(pt.clientProspectIntelligence.editor.sendDescription, en.clientProspectIntelligence.editor.sendDescription);
  });
});

function jsonResponse(bodyValue: unknown, status = 200): Response {
  return new Response(JSON.stringify(bodyValue), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textarea(container: ParentNode): HTMLTextAreaElement {
  const element = container.querySelector("textarea");
  assert.ok(element);
  return element as HTMLTextAreaElement;
}

function actionButton(container: ParentNode, action: string): HTMLButtonElement {
  const element = container.querySelector(
    `button[data-getoblic-content-action="${action}"]`,
  );
  assert.ok(element, action);
  return element as HTMLButtonElement;
}

async function clickAction(container: ParentNode, action: string) {
  const button = actionButton(container, action);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

function commitValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  const previous = element.value;
  setter.call(element, value);
  const tracker = (
    element as HTMLTextAreaElement & { _valueTracker?: { setValue: (next: string) => void } }
  )._valueTracker;
  tracker?.setValue(previous);
  act(() => {
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function mountEditor(input: {
  surface: "prospect" | "client";
  artifact: "description" | "knowledge_base";
  saved: { revision: number; content: string } | null;
}): { container: HTMLElement; unmount: () => void } {
  const container = document.getElementById("getoblic-content-editor-root");
  assert.ok(container);
  container.replaceChildren();
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(GetoblicContentEditor, {
        surface: input.surface,
        prospectId: input.surface === "prospect" ? PROSPECT : undefined,
        artifact: input.artifact,
        saved: input.saved,
        copy: en.clientProspectIntelligence.editor,
      }),
    );
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.replaceChildren();
    },
  };
}
