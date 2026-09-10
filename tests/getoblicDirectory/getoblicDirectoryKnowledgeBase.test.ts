import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseLabeledDeploymentAssets } from "../../lib/deploymentAssets";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  hasCurrentKnowledgeBaseAsset,
  hashKnowledgeBaseContent,
  syncGetOblicListingKnowledgeBase,
  toPublicGetOblicKnowledgeBaseSync,
  type KnowledgeBaseWordpressPort,
} from "../../services/getoblicDirectory/getoblicDirectoryKnowledgeBaseService";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const ROOT = process.cwd();

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DISCUSSION_A = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const VERSION_CURRENT = "5a742720-356d-42b6-b109-566849fe8d71";
const VERSION_HISTORICAL = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const NOW = new Date("2026-09-15T12:00:00.000Z");
const PRIOR_PUSHED_AT = "2026-09-01T08:00:00.000Z";
const SECRET_KEY = "super-secret-directory-key";
const KB_BODY = "Exact knowledge base body.\n\nSecond paragraph with **markdown**.";
const KB_LABELED = `KNOWLEDGE_BASE_ENHANCEMENT:\n${KB_BODY}\n\nHIDDEN_GEMS:\nNot this asset.`;
const KB_BODY_CHANGED = "Changed knowledge base body after a later edit.";
const KB_LABELED_CHANGED = `KNOWLEDGE_BASE_ENHANCEMENT:\n${KB_BODY_CHANGED}\n\nHIDDEN_GEMS:\nNot this asset.`;
const EXPECTED_SHA = createHash("sha256")
  .update(KB_BODY, "utf8")
  .digest("hex");

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
  lifecycle_status: string;
  linked_discussion_id: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  discussion_id: string;
  organization_id: string;
  user_id: string | null;
  version_number: number;
  is_current: boolean;
  generated_at: string;
  generation_duration_ms: number | null;
  models_used: string | null;
  routing_profile: string | null;
  reasoning_profile: string | null;
  reasoning_effort: null;
  pipeline_version: string;
  regeneration_run_id: string | null;
  analysis_id: string | null;
  opportunity_id: string | null;
  review_id: string | null;
  blueprint_id: string | null;
  intelligence: { analysis: { suggested_cta: string } };
  created_at: string;
};

type Op = { op: string; table?: string; values?: Record<string, unknown> };

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function completeLink(
  partial: Partial<LinkRow> &
    Pick<
      LinkRow,
      "organization_id" | "prospect_id" | "wordpress_listing_id" | "relationship_status"
    >,
): LinkRow {
  return {
    id: partial.id ?? "link-1",
    google_id_snapshot: partial.google_id_snapshot ?? null,
    google_id_is_matchable: partial.google_id_is_matchable ?? false,
    relationship_origin: partial.relationship_origin ?? "linked_existing",
    wordpress_author_id: partial.wordpress_author_id ?? 271519816,
    allocated_at: partial.allocated_at ?? "2026-09-01T00:00:00.000Z",
    last_verified_at: partial.last_verified_at ?? "2026-09-01T00:00:00.000Z",
    last_remote_error: partial.last_remote_error ?? null,
    last_remote_error_at: partial.last_remote_error_at ?? null,
    kb_push_status: partial.kb_push_status ?? "never",
    kb_last_pushed_executive_version_id:
      partial.kb_last_pushed_executive_version_id ?? null,
    kb_last_content_sha256: partial.kb_last_content_sha256 ?? null,
    kb_last_pushed_at: partial.kb_last_pushed_at ?? null,
    kb_last_push_error: partial.kb_last_push_error ?? null,
    kb_last_push_error_at: partial.kb_last_push_error_at ?? null,
    created_by_user_id: partial.created_by_user_id ?? null,
    created_via_licensee_account_id:
      partial.created_via_licensee_account_id ?? null,
    created_at: partial.created_at ?? "2026-09-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-09-01T00:00:00.000Z",
    released_at: partial.released_at ?? null,
    ...partial,
  };
}

function defaultProspect(overrides: Partial<ProspectRow> = {}): ProspectRow {
  return {
    id: PROSPECT_A,
    organization_id: ORG_A,
    business_name: "Acme",
    lifecycle_status: "Ready",
    linked_discussion_id: DISCUSSION_A,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function defaultVersion(overrides: Partial<VersionRow> = {}): VersionRow {
  return {
    id: VERSION_CURRENT,
    discussion_id: DISCUSSION_A,
    organization_id: ORG_A,
    user_id: null,
    version_number: 2,
    is_current: true,
    generated_at: "2026-09-07T00:00:00.000Z",
    generation_duration_ms: null,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "executive_intelligence_v1",
    regeneration_run_id: null,
    analysis_id: null,
    opportunity_id: null,
    review_id: null,
    blueprint_id: null,
    intelligence: { analysis: { suggested_cta: KB_LABELED } },
    created_at: "2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}

function defaultLinkedRow(overrides: Partial<LinkRow> = {}): LinkRow {
  return completeLink({
    organization_id: ORG_A,
    prospect_id: PROSPECT_A,
    wordpress_listing_id: 36440,
    relationship_status: "linked",
    ...overrides,
  });
}

function successWordpress(
  overrides: Partial<KnowledgeBaseWordpressPort> = {},
): KnowledgeBaseWordpressPort & {
  calls: Array<{ listingId: number; knowledgeBase: string }>;
} {
  const calls: Array<{ listingId: number; knowledgeBase: string }> = [];
  return {
    calls,
    putKnowledgeBase: async (listingId, knowledgeBase) => {
      calls.push({ listingId, knowledgeBase });
      return {
        wordpress_listing_id: listingId,
        sha256: "remote-ignored",
        changed: true,
      };
    },
    ...overrides,
  };
}

function installStore(store: {
  prospects?: ProspectRow[];
  links?: LinkRow[];
  versions?: VersionRow[];
  failNextLinkUpdate?: boolean;
}): { ops: Op[] } {
  const ops: Op[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;

    const rowsForTable = (): Record<string, unknown>[] => {
      if (table === "prospects") {
        return (store.prospects ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "athena_getoblic_listing_links") {
        return (store.links ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "athena_executive_intelligence_versions") {
        return (store.versions ?? []) as unknown as Record<string, unknown>[];
      }
      return [];
    };

    const matchingRows = () => {
      return rowsForTable().filter((row) => {
        return Object.entries(filters).every(([column, expected]) => {
          if (Array.isArray(expected)) {
            return expected.includes(row[column]);
          }
          return row[column] === expected;
        });
      });
    };

    const applyUpdate = () => {
      if (!pendingUpdate) {
        return { data: null, error: { message: "missing update" } };
      }
      ops.push({ op: "update", table, values: pendingUpdate });
      if (store.failNextLinkUpdate && table === "athena_getoblic_listing_links") {
        store.failNextLinkUpdate = false;
        return { data: null, error: { message: "persist failed" } };
      }
      const matched = matchingRows();
      const updated = matched.map((row) => ({ ...row, ...pendingUpdate }));
      if (table === "athena_getoblic_listing_links") {
        store.links = (store.links ?? []).map((row) => {
          const next = updated.find((item) => item.id === row.id);
          return next ? (next as unknown as LinkRow) : row;
        });
      }
      return { data: updated[0] ?? null, error: null };
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
      insert() {
        ops.push({ op: "insert", table });
        return builder;
      },
      async maybeSingle() {
        if (pendingUpdate) return applyUpdate();
        const matched = matchingRows();
        return { data: matched[0] ?? null, error: null };
      },
      async single() {
        if (pendingUpdate) return applyUpdate();
        const matched = matchingRows();
        return { data: matched[0] ?? null, error: null };
      },
    };

    return builder;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    ops.push({ op: "rpc", table: fn, values: args });
    return { data: null, error: { message: "unexpected rpc" } };
  };

  return { ops };
}

async function sync(
  store: {
    prospects?: ProspectRow[];
    links?: LinkRow[];
    versions?: VersionRow[];
    failNextLinkUpdate?: boolean;
  },
  wordpress?: KnowledgeBaseWordpressPort,
  input: {
    organizationId?: string;
    prospectId?: string;
  } = {},
) {
  return syncGetOblicListingKnowledgeBase(
    {
      organizationId: input.organizationId ?? ORG_A,
      prospectId: input.prospectId ?? PROSPECT_A,
      now: NOW,
    },
    wordpress,
  );
}

function readyStore(overrides: {
  prospects?: ProspectRow[];
  links?: LinkRow[];
  versions?: VersionRow[];
  failNextLinkUpdate?: boolean;
} = {}) {
  return {
    prospects: overrides.prospects ?? [defaultProspect()],
    links: overrides.links ?? [defaultLinkedRow()],
    versions: overrides.versions ?? [defaultVersion()],
    failNextLinkUpdate: overrides.failNextLinkUpdate,
  };
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
  delete process.env.ATHENA_V2_DIRECTORY_API_KEY;
});

describe("GetOblic Knowledge Base orchestration", () => {
  it("pushes the first Knowledge Base through the WordPress client and persists success", async () => {
    const parsed = parseLabeledDeploymentAssets(KB_LABELED);
    const kb = parsed.find((asset) => asset.assetKey === "knowledge_base_enhancement");
    assert.equal(kb?.content, KB_BODY);
    assert.equal(hashKnowledgeBaseContent(KB_BODY), EXPECTED_SHA);
    assert.equal(
      hasCurrentKnowledgeBaseAsset({ analysis: { suggested_cta: KB_LABELED } }),
      true,
    );
    assert.equal(
      hasCurrentKnowledgeBaseAsset({ analysis: { suggested_cta: "HIDDEN_GEMS:\nOnly." } }),
      false,
    );

    const store = readyStore();
    const wordpress = successWordpress();
    const { ops } = installStore(store);

    const result = await sync(store, wordpress);

    assert.deepEqual(result, {
      success: true,
      outcome: "pushed",
      prospect_id: PROSPECT_A,
      listing_link_id: "link-1",
      wordpress_listing_id: 36440,
      executive_version_id: VERSION_CURRENT,
      content_sha256: EXPECTED_SHA,
      kb_push_status: "success",
    });
    assert.equal(wordpress.calls.length, 1);
    assert.equal(wordpress.calls[0]?.listingId, 36440);
    assert.equal(wordpress.calls[0]?.knowledgeBase, KB_BODY);
    assert.equal(store.links[0]?.kb_push_status, "success");
    assert.equal(
      store.links[0]?.kb_last_pushed_executive_version_id,
      VERSION_CURRENT,
    );
    assert.equal(store.links[0]?.kb_last_content_sha256, EXPECTED_SHA);
    assert.equal(store.links[0]?.kb_last_pushed_at, NOW.toISOString());
    assert.equal(store.links[0]?.kb_last_push_error, null);
    assert.equal(store.links[0]?.kb_last_push_error_at, null);
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.equal(store.links[0]?.wordpress_listing_id, 36440);
    assert.equal(store.links[0]?.organization_id, ORG_A);
    assert.equal(store.links[0]?.prospect_id, PROSPECT_A);
    assert.equal(
      ops.some((op) => op.op === "rpc" || op.op === "insert"),
      false,
    );
  });

  it("requires a linked relationship", async () => {
    const wordpress = successWordpress();
    installStore(
      readyStore({
        links: [
          defaultLinkedRow({ relationship_status: "released", released_at: NOW.toISOString() }),
        ],
      }),
    );
    await assert.rejects(
      () => sync({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_RELATIONSHIP_NOT_LINKED");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("rejects a missing link without recording a remote failure", async () => {
    const store = readyStore({ links: [] });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LINK_NOT_FOUND");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links.length, 0);
  });

  it("rejects remote_missing without calling WordPress", async () => {
    const store = readyStore({
      links: [defaultLinkedRow({ relationship_status: "remote_missing" })],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_RELATIONSHIP_NOT_LINKED");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links[0]?.kb_push_status, "never");
    assert.equal(store.links[0]?.relationship_status, "remote_missing");
  });

  it("rejects claiming without calling WordPress", async () => {
    const store = readyStore({
      links: [defaultLinkedRow({ relationship_status: "claiming" })],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_RELATIONSHIP_NOT_LINKED");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links[0]?.kb_push_status, "never");
    assert.equal(store.links[0]?.relationship_status, "claiming");
  });

  it("resolves the Current Executive Version server-side and ignores historical versions", async () => {
    const historicalBody = "Historical knowledge base that must not be pushed.";
    const store = readyStore({
      versions: [
        defaultVersion({
          id: VERSION_HISTORICAL,
          version_number: 1,
          is_current: false,
          intelligence: {
            analysis: {
              suggested_cta: `KNOWLEDGE_BASE_ENHANCEMENT:\n${historicalBody}`,
            },
          },
        }),
        defaultVersion(),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    const result = await sync(store, wordpress);
    assert.equal(result.executive_version_id, VERSION_CURRENT);
    assert.equal(wordpress.calls[0]?.knowledgeBase, KB_BODY);
    assert.notEqual(wordpress.calls[0]?.knowledgeBase, historicalBody);
  });

  it("rejects a missing current Executive Version before any remote write", async () => {
    const store = readyStore({
      versions: [
        defaultVersion({
          id: VERSION_HISTORICAL,
          is_current: false,
        }),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CURRENT_EXECUTIVE_VERSION_MISSING");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links[0]?.kb_push_status, "never");
  });

  it("rejects a Prospect with no linked discussion as a missing current version", async () => {
    const store = readyStore({
      prospects: [defaultProspect({ linked_discussion_id: null })],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CURRENT_EXECUTIVE_VERSION_MISSING");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("rejects a missing knowledge_base_enhancement asset", async () => {
    const store = readyStore({
      versions: [
        defaultVersion({
          intelligence: { analysis: { suggested_cta: "HIDDEN_GEMS:\nGems only." } },
        }),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_KNOWLEDGE_BASE_ASSET_MISSING");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links[0]?.kb_push_status, "never");
  });

  it("rejects an empty knowledge_base_enhancement asset", async () => {
    const store = readyStore({
      versions: [
        defaultVersion({
          intelligence: {
            analysis: {
              suggested_cta:
                "HIDDEN_GEMS:\nGems.\n\nKNOWLEDGE_BASE_ENHANCEMENT:\n   \n",
            },
          },
        }),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_KNOWLEDGE_BASE_ASSET_MISSING");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links[0]?.kb_push_status, "never");
  });

  it("hashes the exact outgoing body and returns already_current without calling WordPress", async () => {
    assert.equal(hashKnowledgeBaseContent(KB_BODY), EXPECTED_SHA);
    const store = readyStore({
      links: [
        defaultLinkedRow({
          kb_push_status: "success",
          kb_last_pushed_executive_version_id: VERSION_CURRENT,
          kb_last_content_sha256: EXPECTED_SHA,
          kb_last_pushed_at: PRIOR_PUSHED_AT,
        }),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    const result = await sync(store, wordpress);
    assert.equal(result.outcome, "already_current");
    assert.equal(result.content_sha256, EXPECTED_SHA);
    assert.equal(result.kb_push_status, "success");
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links[0]?.kb_last_pushed_at, PRIOR_PUSHED_AT);
  });

  it("calls WordPress when the Executive Version changed", async () => {
    const nextVersion = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const store = readyStore({
      links: [
        defaultLinkedRow({
          kb_push_status: "success",
          kb_last_pushed_executive_version_id: VERSION_HISTORICAL,
          kb_last_content_sha256: EXPECTED_SHA,
          kb_last_pushed_at: PRIOR_PUSHED_AT,
        }),
      ],
      versions: [defaultVersion({ id: nextVersion })],
    });
    const wordpress = successWordpress();
    installStore(store);
    const result = await sync(store, wordpress);
    assert.equal(result.outcome, "pushed");
    assert.equal(result.executive_version_id, nextVersion);
    assert.equal(wordpress.calls.length, 1);
    assert.equal(store.links[0]?.kb_last_pushed_executive_version_id, nextVersion);
  });

  it("calls WordPress when the SHA changed for the same Executive Version", async () => {
    const store = readyStore({
      links: [
        defaultLinkedRow({
          kb_push_status: "success",
          kb_last_pushed_executive_version_id: VERSION_CURRENT,
          kb_last_content_sha256: EXPECTED_SHA,
          kb_last_pushed_at: PRIOR_PUSHED_AT,
        }),
      ],
      versions: [
        defaultVersion({
          intelligence: { analysis: { suggested_cta: KB_LABELED_CHANGED } },
        }),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    const result = await sync(store, wordpress);
    assert.equal(result.outcome, "pushed");
    assert.equal(wordpress.calls.length, 1);
    assert.equal(wordpress.calls[0]?.knowledgeBase, KB_BODY_CHANGED);
    assert.equal(
      result.content_sha256,
      hashKnowledgeBaseContent(KB_BODY_CHANGED),
    );
    assert.notEqual(result.content_sha256, EXPECTED_SHA);
  });

  it("records a WordPress failure without writing success metadata", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = SECRET_KEY;
    const store = readyStore();
    const wordpress = successWordpress({
      putKnowledgeBase: async () => {
        throw new GetOblicWordpressError(
          "REMOTE_ERROR",
          `WordPress rejected the write ${SECRET_KEY}`,
          502,
          "KB_UPDATE_FAILED",
        );
      },
    });
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_KB_WRITE_FAILED");
        assert.doesNotMatch(error.message, new RegExp(SECRET_KEY));
        return true;
      },
    );
    assert.equal(store.links[0]?.kb_push_status, "failed");
    assert.match(String(store.links[0]?.kb_last_push_error), /KB_UPDATE_FAILED/);
    assert.doesNotMatch(
      String(store.links[0]?.kb_last_push_error),
      new RegExp(SECRET_KEY),
    );
    assert.equal(store.links[0]?.kb_last_push_error_at, NOW.toISOString());
    assert.equal(store.links[0]?.kb_last_pushed_executive_version_id, null);
    assert.equal(store.links[0]?.kb_last_content_sha256, null);
    assert.equal(store.links[0]?.kb_last_pushed_at, null);
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("preserves prior successful version, hash, and timestamp after a later remote failure", async () => {
    const store = readyStore({
      links: [
        defaultLinkedRow({
          kb_push_status: "success",
          kb_last_pushed_executive_version_id: VERSION_CURRENT,
          kb_last_content_sha256: EXPECTED_SHA,
          kb_last_pushed_at: PRIOR_PUSHED_AT,
        }),
      ],
      versions: [
        defaultVersion({
          intelligence: { analysis: { suggested_cta: KB_LABELED_CHANGED } },
        }),
      ],
    });
    const wordpress = successWordpress({
      putKnowledgeBase: async () => {
        throw new GetOblicWordpressError(
          "REMOTE_ERROR",
          "WordPress write failed",
          502,
        );
      },
    });
    installStore(store);
    await assert.rejects(() => sync(store, wordpress));
    assert.equal(store.links[0]?.kb_push_status, "failed");
    assert.equal(
      store.links[0]?.kb_last_pushed_executive_version_id,
      VERSION_CURRENT,
    );
    assert.equal(store.links[0]?.kb_last_content_sha256, EXPECTED_SHA);
    assert.equal(store.links[0]?.kb_last_pushed_at, PRIOR_PUSHED_AT);
    assert.ok(store.links[0]?.kb_last_push_error);
    assert.equal(store.links[0]?.kb_last_push_error_at, NOW.toISOString());
  });

  it("isolates organizations and does not use another tenant's listing", async () => {
    const store = readyStore({
      prospects: [defaultProspect()],
      links: [
        defaultLinkedRow({
          organization_id: ORG_B,
          wordpress_listing_id: 99999,
        }),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress, { organizationId: ORG_A }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LINK_NOT_FOUND");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.links[0]?.kb_push_status, "never");
    assert.equal(store.links[0]?.wordpress_listing_id, 99999);
  });

  it("rejects a Prospect that is not visible in the current organization", async () => {
    const store = readyStore({
      prospects: [defaultProspect({ organization_id: ORG_B })],
    });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress, { organizationId: ORG_A }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_NOT_FOUND");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("returns a structured persistence error after remote success without claiming sync success", async () => {
    const store = readyStore({ failNextLinkUpdate: true });
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => sync(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_KB_SYNC_PERSISTENCE_FAILED");
        assert.equal(error.status, 500);
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 1);
    assert.equal(store.links[0]?.kb_push_status, "never");
    assert.equal(store.links[0]?.kb_last_content_sha256, null);
  });

  it("returns a safe public result without the Knowledge Base body or secrets", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = SECRET_KEY;
    const store = readyStore();
    const wordpress = successWordpress();
    installStore(store);
    const result = await sync(store, wordpress);
    const publicResult = toPublicGetOblicKnowledgeBaseSync(result);
    const serialized = JSON.stringify(publicResult);
    assert.equal(publicResult.success, true);
    assert.equal(publicResult.outcome, "pushed");
    assert.equal("knowledge_base" in publicResult, false);
    assert.doesNotMatch(serialized, /Exact knowledge base body/);
    assert.doesNotMatch(serialized, new RegExp(SECRET_KEY));
    assert.doesNotMatch(serialized, /x-api-key/i);
    assert.deepEqual(Object.keys(publicResult).sort(), [
      "content_sha256",
      "executive_version_id",
      "kb_push_status",
      "listing_link_id",
      "outcome",
      "prospect_id",
      "success",
      "wordpress_listing_id",
    ]);
  });
});

describe("GetOblic Knowledge Base route contract", () => {
  it("uses current org context and never accepts client-supplied authority", () => {
    const route = read(
      "app/api/prospects/[id]/getoblic-directory/knowledge-base/route.ts",
    );
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /syncGetOblicListingKnowledgeBase/);
    assert.doesNotMatch(route, /organizationId:\s*body/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(route, /body\.organization_id/);
    assert.doesNotMatch(route, /searchParams/);
    assert.doesNotMatch(route, /wordpressListingId/);
    assert.doesNotMatch(route, /wordpress_listing_id/);
    assert.doesNotMatch(route, /executive_version_id/);
    assert.doesNotMatch(route, /body\.knowledge_base/);
    assert.doesNotMatch(route, /request\.json/);
    assert.doesNotMatch(route, /ATHENA_V2_DIRECTORY_API_KEY/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
    assert.doesNotMatch(route, /x-api-key/);
    assert.doesNotMatch(route, /claimKnownExistingListing/);
    assert.doesNotMatch(route, /consumeGetOblicListingAllocation/);
  });

  it("reuses the existing parser, current-version primitive, and WordPress PUT helper", () => {
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryKnowledgeBaseService.ts",
    );
    assert.match(service, /parseLabeledDeploymentAssets/);
    assert.match(service, /knowledge_base_enhancement/);
    assert.match(service, /getCurrentExecutiveVersion/);
    assert.match(service, /is_current/);
    assert.match(service, /hasCurrentKnowledgeBaseAsset/);
    assert.match(service, /putWordpressListingKnowledgeBase/);
    assert.match(service, /createHash\("sha256"\)/);
    assert.match(service, /already_current/);
    assert.doesNotMatch(service, /getoblic\/v1\/update-knowledge-base/);
    assert.doesNotMatch(service, /claimKnownExistingListing/);
    assert.doesNotMatch(service, /consumeGetOblicListingAllocation/);
    assert.doesNotMatch(service, /consume_getoblic_listing_allocation/);
    assert.doesNotMatch(service, /relationship_status:\s*"released"/);
    assert.doesNotMatch(service, /relationship_status:\s*"claiming"/);
    assert.doesNotMatch(service, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
  });
});
