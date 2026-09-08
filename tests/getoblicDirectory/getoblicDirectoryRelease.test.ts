import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  releaseGetOblicListing,
  toPublicGetOblicRelease,
  type ReleaseGetOblicListingWordpressPort,
} from "../../services/getoblicDirectory/getoblicDirectoryReleaseService";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import { getGetOblicListingCapacity } from "../../services/getoblicDirectory/getoblicDirectoryService";
import {
  GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
  type GetOblicListingLink,
} from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { classifyGetOblicDirectorySearchClaimStatus } from "../../services/getoblicDirectory/getoblicDirectoryTypes";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const ROOT = process.cwd();

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-15T12:00:00.000Z");

type SettingsRow = {
  organization_id: string;
  monthly_allowance: number;
  wordpress_author_id: number | null;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

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

type EventRow = {
  id: string;
  organization_id: string;
  wordpress_listing_id: number;
};

type ProspectRow = {
  id: string;
  organization_id: string;
  business_name: string;
  lifecycle_status: string;
  created_at: string;
  updated_at: string;
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
    wordpress_author_id: partial.wordpress_author_id ?? 42,
    allocated_at: partial.allocated_at ?? "2026-09-01T00:00:00.000Z",
    last_verified_at: partial.last_verified_at ?? null,
    last_remote_error: partial.last_remote_error ?? null,
    last_remote_error_at: partial.last_remote_error_at ?? null,
    kb_push_status: partial.kb_push_status ?? "never",
    kb_last_pushed_executive_version_id: null,
    kb_last_content_sha256: null,
    kb_last_pushed_at: null,
    kb_last_push_error: null,
    kb_last_push_error_at: null,
    created_by_user_id: null,
    created_via_licensee_account_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    released_at: partial.released_at ?? null,
    ...partial,
  };
}

function defaultSettings(): SettingsRow {
  return {
    organization_id: ORG_A,
    monthly_allowance: 5,
    wordpress_author_id: 42,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    updated_by_user_id: null,
  };
}

function defaultProspect(): ProspectRow {
  return {
    id: PROSPECT_A,
    organization_id: ORG_A,
    business_name: "Acme",
    lifecycle_status: "New",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

function successWordpress(
  authorId: number,
  overrides: Partial<ReleaseGetOblicListingWordpressPort> = {},
): ReleaseGetOblicListingWordpressPort & { calls: string[] } {
  const calls: string[] = [];
  let currentAuthor = authorId;
  return {
    calls,
    getListingById: async (id) => {
      calls.push(`getListing:${id}:${currentAuthor}`);
      return {
        wordpress_listing_id: id,
        status: "publish",
        title: "Listing",
        author_id: currentAuthor,
        google_id: null,
        google_place_url: null,
        knowledge_base: null,
      };
    },
    assignListingAuthor: async (listingId, userId) => {
      calls.push(`assignAuthor:${listingId}:${userId}`);
      currentAuthor = userId;
      return {
        wordpress_listing_id: listingId,
        wordpress_user_id: userId,
        changed: true,
      };
    },
    ...overrides,
  };
}

function installStore(store: {
  settings?: SettingsRow[];
  links?: LinkRow[];
  events?: EventRow[];
  prospects?: ProspectRow[];
  failNextReleaseUpdate?: boolean;
}): { ops: Op[] } {
  const ops: Op[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;

    const rowsForTable = (): Record<string, unknown>[] => {
      if (table === "athena_getoblic_directory_settings") {
        return (store.settings ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "athena_getoblic_listing_links") {
        return (store.links ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "athena_getoblic_listing_allocation_events") {
        return (store.events ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "prospects") {
        return (store.prospects ?? []) as unknown as Record<string, unknown>[];
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
      if (table === "athena_getoblic_listing_links" && store.failNextReleaseUpdate) {
        store.failNextReleaseUpdate = false;
        return { data: null, error: null };
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
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        return builder;
      },
      async maybeSingle() {
        if (pendingUpdate) return applyUpdate();
        return { data: matchingRows()[0] ?? null, error: null };
      },
      async single() {
        if (pendingUpdate) return applyUpdate();
        return { data: matchingRows()[0] ?? null, error: null };
      },
    };

    return builder;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = async (fn: string) => {
    ops.push({ op: "rpc", table: fn });
    return { data: null, error: { message: "unexpected rpc" } };
  };

  return { ops };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

async function release(
  store: {
    settings?: SettingsRow[];
    links?: LinkRow[];
    events?: EventRow[];
    prospects?: ProspectRow[];
    failNextReleaseUpdate?: boolean;
  },
  wordpress: ReleaseGetOblicListingWordpressPort,
  organizationId = ORG_A,
) {
  installStore(store);
  return releaseGetOblicListing(
    {
      organizationId,
      prospectId: PROSPECT_A,
      actorUserId: null,
      now: NOW,
    },
    wordpress,
  );
}

describe("GetOblic listing release", () => {
  it("releases a linked listing owned by the org author to the inventory pool", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      events: [{ id: "e1", organization_id: ORG_A, wordpress_listing_id: 1000 }],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
          wordpress_author_id: 42,
        }),
      ],
    };
    const wordpress = successWordpress(42);
    const result = await release(store, wordpress);
    assert.equal(result.outcome, "released");
    assert.equal(store.links[0]?.relationship_status, "released");
    assert.equal(store.links[0]?.released_at, NOW.toISOString());
    assert.equal(store.links[0]?.last_remote_error, null);
    assert.equal(store.prospects[0]?.id, PROSPECT_A);
    assert.equal(store.events.length, 1);
    const capacity = await getGetOblicListingCapacity(ORG_A);
    assert.equal(capacity.configured, true);
    if (capacity.configured) {
      assert.equal(capacity.currentlyHeld, 0);
      assert.equal(capacity.available, 5);
    }
    assert.deepEqual(wordpress.calls, [
      "getListing:1000:42",
      "assignAuthor:1000:271519816",
      "getListing:1000:271519816",
    ]);
    const publicRelease = toPublicGetOblicRelease(result);
    assert.doesNotMatch(JSON.stringify(publicRelease), /organization_id|ATHENA_V2|password/);
  });

  it("releases a claiming relationship the same way", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "claiming",
          wordpress_author_id: 42,
        }),
      ],
    };
    const result = await release(store, successWordpress(42));
    assert.equal(result.outcome, "released");
    assert.equal(store.links[0]?.relationship_status, "released");
  });

  it("completes Athena release when WordPress is already pool-owned", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    const wordpress = successWordpress(GETOBLIC_INVENTORY_POOL_AUTHOR_ID);
    const result = await release(store, wordpress);
    assert.equal(result.outcome, "released");
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("rejects remote_missing tenant release and leaves the relationship active", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "remote_missing",
        }),
      ],
    };
    const wordpress = successWordpress(42);
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_RELEASE_REMOTE_MISSING");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "remote_missing");
    assert.equal(wordpress.calls.length, 0);
  });

  it("rejects a third-party owner with no assign and leaves the relationship active", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    const wordpress = successWordpress(99);
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_RELEASE_THIRD_PARTY_OWNER");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.match(String(store.links[0]?.last_remote_error), /GETOBLIC_RELEASE_THIRD_PARTY_OWNER/);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("leaves the relationship active when WordPress GET returns 404", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    const wordpress = successWordpress(42, {
      getListingById: async () => {
        throw new GetOblicWordpressError(
          "NOT_FOUND",
          "Listing not found.",
          404,
          "LISTING_NOT_FOUND",
        );
      },
    });
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_LISTING_MISSING");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.equal(store.links[0]?.released_at, null);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("leaves the relationship active when WordPress GET times out", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    const wordpress = successWordpress(42, {
      getListingById: async () => {
        throw new GetOblicWordpressError("TIMEOUT", "timed out", 504);
      },
    });
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_TRANSIENT");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.equal(store.links[0]?.released_at, null);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("leaves the relationship active when WordPress GET is unauthorized", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    const wordpress = successWordpress(42, {
      getListingById: async () => {
        throw new GetOblicWordpressError("UNAUTHORIZED", "invalid key", 401);
      },
    });
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_AUTH_FAILED");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.equal(store.links[0]?.released_at, null);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("leaves the relationship active when WordPress GET fails", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    const wordpress = successWordpress(42, {
      getListingById: async () => {
        throw new GetOblicWordpressError("NETWORK", "down", 502);
      },
    });
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_TRANSIENT");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("leaves the relationship active when WordPress assign fails", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    const wordpress = successWordpress(42, {
      assignListingAuthor: async () => {
        throw new GetOblicWordpressError("NETWORK", "assign failed", 502);
      },
    });
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_AUTHOR_FAILED");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("leaves the relationship active when post-assign verification fails", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    let gets = 0;
    const wordpress: ReleaseGetOblicListingWordpressPort = {
      getListingById: async (id) => {
        gets += 1;
        return {
          wordpress_listing_id: id,
          status: "publish",
          title: "Listing",
          author_id: gets === 1 ? 42 : 99,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
        };
      },
      assignListingAuthor: async (listingId, userId) => ({
        wordpress_listing_id: listingId,
        wordpress_user_id: userId,
        changed: true,
      }),
    };
    await assert.rejects(
      () => release(store, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_AUTHOR_FAILED");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("rejects a duplicate release instead of reporting false success", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "released",
          released_at: "2026-09-01T00:00:00.000Z",
        }),
      ],
    };
    await assert.rejects(
      () => release(store, successWordpress(GETOBLIC_INVENTORY_POOL_AUTHOR_ID)),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_RELEASE_NOT_ACTIVE");
        return true;
      },
    );
  });

  it("rejects a wrong-org release", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    await assert.rejects(
      () => release(store, successWordpress(42), ORG_B),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_NOT_FOUND");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("does not report false success when the persistence race updates zero rows", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      failNextReleaseUpdate: true,
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    };
    await assert.rejects(
      () => release(store, successWordpress(GETOBLIC_INVENTORY_POOL_AUTHOR_ID)),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CONCURRENCY_CONFLICT");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("makes a pool-owned released listing AVAILABLE in search overlay", () => {
    assert.equal(
      classifyGetOblicDirectorySearchClaimStatus(ORG_A, null, GETOBLIC_INVENTORY_POOL_AUTHOR_ID),
      "AVAILABLE",
    );
  });

  it("does not delete allocation events, invoke generation, or attach release to the website card", () => {
    const releaseSource = read(
      "services/getoblicDirectory/getoblicDirectoryReleaseService.ts",
    );
    const route = read(
      "app/api/prospects/[id]/getoblic-directory/release/route.ts",
    );
    const card = read("components/prospects/GetOblicWebsiteCompletionCard.tsx");
    const page = read("app/prospects/[id]/page.tsx");
    assert.doesNotMatch(releaseSource, /delete\(/);
    assert.doesNotMatch(releaseSource, /openrouter|OpenRouter|ensureProspectGenerationQueued/i);
    assert.doesNotMatch(route, /ATHENA_V2_DIRECTORY_API_KEY|password/);
    assert.doesNotMatch(card, /Release GetOblic listing|getoblic-directory\/release/);
    assert.match(page, /GetOblicListingReleaseControl/);
    assert.match(page, /getActiveGetOblicLinkForProspect/);
    assert.doesNotMatch(releaseSource, /discussion|intelligence|executive_version|openrouter/i);
    assert.doesNotMatch(releaseSource, /putWordpressListingKnowledgeBase|knowledge-base/);
    const kb = read(
      "services/getoblicDirectory/getoblicDirectoryKnowledgeBaseService.ts",
    );
    assert.match(kb, /GETOBLIC_RELATIONSHIP_NOT_LINKED/);
    assert.match(kb, /relationship_status !== "linked"/);
    const deleteProspect = read("services/prospects/prospectService.ts");
    assert.match(deleteProspect, /getActiveGetOblicLinkForProspect/);
    assert.match(deleteProspect, /getOblicListingActiveClaimError/);
  });

  it("keeps Prospect CRM history and discussion intelligence outside the release path", () => {
    const releaseSource = read(
      "services/getoblicDirectory/getoblicDirectoryReleaseService.ts",
    );
    assert.doesNotMatch(releaseSource, /deleteProspect/);
    assert.doesNotMatch(releaseSource, /updateProspect/);
    assert.doesNotMatch(releaseSource, /deleteDiscussion/);
    assert.doesNotMatch(releaseSource, /athena_identity|logoPreview/);
  });

  it("public release payload stays narrow", () => {
    const link = completeLink({
      organization_id: ORG_B,
      prospect_id: PROSPECT_A,
      wordpress_listing_id: 1000,
      relationship_status: "released",
      released_at: NOW.toISOString(),
    }) as unknown as GetOblicListingLink;
    const mapped = toPublicGetOblicRelease({
      outcome: "released",
      link: { ...link, relationship_status: "released" },
    });
    assert.deepEqual(Object.keys(mapped).sort(), [
      "listing_link_id",
      "outcome",
      "relationship_status",
      "released_at",
      "wordpress_listing_id",
    ]);
    assert.doesNotMatch(JSON.stringify(mapped), new RegExp(ORG_B));
  });
});
