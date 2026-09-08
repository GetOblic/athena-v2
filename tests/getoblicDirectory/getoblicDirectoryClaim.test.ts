import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  buildGetOblicAllocateExistingIdempotencyKey,
  claimKnownExistingListing,
  CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC,
  consumeGetOblicListingAllocation,
  toPublicGetOblicClaim,
  type ClaimKnownListingWordpressPort,
} from "../../services/getoblicDirectory/getoblicDirectoryClaimService";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import type { GetOblicListingLink } from "../../services/getoblicDirectory/getoblicDirectoryTypes";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const originalGetUserById = supabaseAdmin.auth.admin.getUserById.bind(
  supabaseAdmin.auth.admin,
);
const ROOT = process.cwd();

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const NOW = new Date("2026-09-15T12:00:00.000Z");
const SECRET_KEY = "super-secret-directory-key";

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
  prospect_id: string | null;
  listing_link_id: string | null;
  wordpress_listing_id: number;
  event_kind: string;
  period_start: string;
  idempotency_key: string;
  actor_user_id: string | null;
  actor_licensee_account_id: string | null;
};

type ProspectRow = {
  id: string;
  organization_id: string;
  business_name: string;
  lifecycle_status: string;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  organization_id: string;
  user_id: string;
  role: string;
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
    wordpress_author_id: partial.wordpress_author_id ?? null,
    allocated_at: partial.allocated_at ?? null,
    last_verified_at: partial.last_verified_at ?? null,
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

function defaultSettings(
  overrides: Partial<SettingsRow> = {},
): SettingsRow {
  return {
    organization_id: ORG_A,
    monthly_allowance: 5,
    wordpress_author_id: 42,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    updated_by_user_id: null,
    ...overrides,
  };
}

function defaultProspect(overrides: Partial<ProspectRow> = {}): ProspectRow {
  return {
    id: PROSPECT_A,
    organization_id: ORG_A,
    business_name: "Acme",
    lifecycle_status: "New",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function successWordpress(
  overrides: Partial<ClaimKnownListingWordpressPort> = {},
): ClaimKnownListingWordpressPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getListingById: async (id) => {
      calls.push(`getListing:${id}`);
      return {
        wordpress_listing_id: id,
        status: "publish",
        title: "Listing",
        author_id: 1,
        google_id: null,
        google_place_url: null,
        knowledge_base: null,
      };
    },
    assignListingAuthor: async (listingId, userId) => {
      calls.push(`assignAuthor:${listingId}:${userId}`);
      return {
        wordpress_listing_id: listingId,
        wordpress_user_id: userId,
        changed: true,
      };
    },
    resolveOrCreateUser: async (email) => {
      calls.push(`resolveOrCreate:${email}`);
      return { wordpress_user_id: 99, created: false };
    },
    ...overrides,
  };
}

function installStore(store: {
  settings?: SettingsRow[];
  links?: LinkRow[];
  events?: EventRow[];
  prospects?: ProspectRow[];
  members?: MemberRow[];
  ownerEmails?: Record<string, string>;
  failNextLinkInsert?: boolean;
  failAllocationRpc?: boolean;
  raceWinner?: LinkRow;
}): { ops: Op[] } {
  const ops: Op[] = [];
  let nextLinkId = 100;
  let nextEventId = 100;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let countHead = false;
    let pendingInsert: Record<string, unknown> | null = null;
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
      if (table === "organization_members") {
        return (store.members ?? []) as unknown as Record<string, unknown>[];
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

    const applyInsert = () => {
      if (!pendingInsert) {
        return { data: null, error: { message: "missing insert" } };
      }
      ops.push({ op: "insert", table, values: pendingInsert });

      if (table === "athena_getoblic_listing_links") {
        if (store.failNextLinkInsert) {
          store.failNextLinkInsert = false;
          if (store.raceWinner) {
            store.links = [...(store.links ?? []), store.raceWinner];
          }
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
        const active = (store.links ?? []).filter((row) =>
          ["claiming", "linked", "remote_missing"].includes(row.relationship_status),
        );
        if (
          active.some(
            (row) =>
              row.prospect_id === pendingInsert?.prospect_id ||
              row.wordpress_listing_id === pendingInsert?.wordpress_listing_id,
          )
        ) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
        const row = completeLink({
          id: `link-${nextLinkId++}`,
          organization_id: String(pendingInsert.organization_id),
          prospect_id: String(pendingInsert.prospect_id),
          wordpress_listing_id: Number(pendingInsert.wordpress_listing_id),
          relationship_status: String(pendingInsert.relationship_status),
          relationship_origin: String(
            pendingInsert.relationship_origin ?? "linked_existing",
          ),
          created_by_user_id:
            (pendingInsert.created_by_user_id as string | null) ?? null,
          created_via_licensee_account_id:
            (pendingInsert.created_via_licensee_account_id as string | null) ??
            null,
        });
        store.links = [...(store.links ?? []), row];
        return { data: row, error: null };
      }

      if (table === "athena_getoblic_listing_allocation_events") {
        const existing = (store.events ?? []).find(
          (row) =>
            (row.organization_id === pendingInsert?.organization_id &&
              row.wordpress_listing_id === pendingInsert?.wordpress_listing_id) ||
            row.idempotency_key === pendingInsert?.idempotency_key,
        );
        if (existing) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
        const row: EventRow = {
          id: `event-${nextEventId++}`,
          organization_id: String(pendingInsert.organization_id),
          prospect_id: (pendingInsert.prospect_id as string | null) ?? null,
          listing_link_id: (pendingInsert.listing_link_id as string | null) ?? null,
          wordpress_listing_id: Number(pendingInsert.wordpress_listing_id),
          event_kind: String(pendingInsert.event_kind),
          period_start: String(pendingInsert.period_start),
          idempotency_key: String(pendingInsert.idempotency_key),
          actor_user_id: (pendingInsert.actor_user_id as string | null) ?? null,
          actor_licensee_account_id:
            (pendingInsert.actor_licensee_account_id as string | null) ?? null,
        };
        store.events = [...(store.events ?? []), row];
        return { data: row, error: null };
      }

      return { data: pendingInsert, error: null };
    };

    const applyUpdate = () => {
      if (!pendingUpdate) {
        return { data: null, error: { message: "missing update" } };
      }
      ops.push({ op: "update", table, values: pendingUpdate });
      const matched = matchingRows();
      const updated = matched.map((row) => ({ ...row, ...pendingUpdate }));
      if (table === "athena_getoblic_listing_links") {
        store.links = (store.links ?? []).map((row) => {
          const next = updated.find((item) => item.id === row.id);
          return next ? (next as unknown as LinkRow) : row;
        });
      }
      if (table === "athena_getoblic_directory_settings") {
        store.settings = (store.settings ?? []).map((row) => {
          const next = updated.find(
            (item) => item.organization_id === row.organization_id,
          );
          return next ? (next as unknown as SettingsRow) : row;
        });
      }
      return { data: updated[0] ?? null, error: null };
    };

    const result = () => {
      const matched = matchingRows();
      return {
        data: countHead ? null : matched,
        count: matched.length,
        error: null,
      };
    };

    const builder = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        countHead = Boolean(options?.head && options.count === "exact");
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
      is(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      insert(values: Record<string, unknown> | Record<string, unknown>[]) {
        pendingInsert = Array.isArray(values) ? values[0] ?? null : values;
        return builder;
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        return builder;
      },
      async maybeSingle() {
        if (pendingInsert) return applyInsert();
        if (pendingUpdate) return applyUpdate();
        const matched = matchingRows();
        return { data: matched[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return applyInsert();
        if (pendingUpdate) return applyUpdate();
        const matched = matchingRows();
        return { data: matched[0] ?? null, error: null };
      },
      then(
        resolve: (value: { data: unknown; count: number; error: null }) => void,
      ) {
        if (pendingInsert) {
          return Promise.resolve(applyInsert()).then(resolve as never);
        }
        return Promise.resolve(result()).then(resolve);
      },
    };

    return builder;
  };

  supabaseAdmin.auth.admin.getUserById = (async (userId: string) => {
    const email = store.ownerEmails?.[userId];
    if (!email) {
      return { data: { user: null }, error: { message: "not found" } };
    }
    return {
      data: { user: { id: userId, email } },
      error: null,
    };
  }) as typeof supabaseAdmin.auth.admin.getUserById;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = async (
    fn: string,
    args: Record<string, unknown> = {},
  ) => {
    ops.push({ op: "rpc", table: fn, values: args });
    if (fn !== CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC) {
      return { data: null, error: { message: "unexpected rpc" } };
    }
    if (store.failAllocationRpc) {
      return { data: null, error: { message: "allocation rpc failed" } };
    }
    return applyAllocationRpc(store, args, () => `event-${nextEventId++}`);
  };

  return { ops };
}

function applyAllocationRpc(
  store: {
    settings?: SettingsRow[];
    events?: EventRow[];
  },
  args: Record<string, unknown>,
  nextEventId: () => string,
): {
  data: Record<string, unknown>;
  error: null;
} {
  const organizationId = String(args.p_organization_id ?? "");
  const periodStart = String(args.p_period_start ?? "");
  const wordpressListingId = Number(args.p_wordpress_listing_id);
  const settings = (store.settings ?? []).find(
    (row) => row.organization_id === organizationId,
  );

  if (!settings) {
    return {
      data: {
        consumed: false,
        already: false,
        exceeded: false,
        not_configured: true,
        allocation_event_id: null,
        period_start: periodStart,
      },
      error: null,
    };
  }

  const existing = (store.events ?? []).find(
    (row) =>
      row.organization_id === organizationId &&
      row.wordpress_listing_id === wordpressListingId,
  );
  if (existing) {
    return {
      data: {
        consumed: false,
        already: true,
        exceeded: false,
        not_configured: false,
        allocation_event_id: existing.id,
        period_start: existing.period_start,
      },
      error: null,
    };
  }

  const used = (store.events ?? []).filter(
    (row) =>
      row.organization_id === organizationId &&
      row.period_start === periodStart,
  ).length;
  if (used >= settings.monthly_allowance) {
    return {
      data: {
        consumed: false,
        already: false,
        exceeded: true,
        not_configured: false,
        allocation_event_id: null,
        period_start: periodStart,
      },
      error: null,
    };
  }

  const row: EventRow = {
    id: nextEventId(),
    organization_id: organizationId,
    prospect_id: (args.p_prospect_id as string | null) ?? null,
    listing_link_id: (args.p_listing_link_id as string | null) ?? null,
    wordpress_listing_id: wordpressListingId,
    event_kind: "allocate_existing",
    period_start: periodStart,
    idempotency_key: String(args.p_idempotency_key ?? ""),
    actor_user_id: (args.p_actor_user_id as string | null) ?? null,
    actor_licensee_account_id:
      (args.p_actor_licensee_account_id as string | null) ?? null,
  };
  store.events = [...(store.events ?? []), row];
  return {
    data: {
      consumed: true,
      already: false,
      exceeded: false,
      not_configured: false,
      allocation_event_id: row.id,
      period_start: periodStart,
    },
    error: null,
  };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
  supabaseAdmin.auth.admin.getUserById = originalGetUserById;
}

afterEach(() => {
  restoreSupabaseAdmin();
  delete process.env.ATHENA_V2_DIRECTORY_API_KEY;
});

async function claim(
  overrides: Partial<Parameters<typeof claimKnownExistingListing>[0]> = {},
  wordpress?: ClaimKnownListingWordpressPort,
) {
  return claimKnownExistingListing(
    {
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      wordpressListingId: 1000,
      actorUserId: USER_A,
      actorLicenseeAccountId: null,
      now: NOW,
      ...overrides,
    },
    wordpress,
  );
}

describe("GetOblic claim orchestration", () => {
  it("1. missing directory settings fails closed", async () => {
    installStore({
      settings: [],
      prospects: [defaultProspect()],
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_DIRECTORY_NOT_CONFIGURED");
        return true;
      },
    );
  });

  it("2. invalid prospect/org ownership fails", async () => {
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect({ organization_id: ORG_B })],
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_NOT_FOUND");
        return true;
      },
    );
  });

  it("3. new claim inserts claiming before remote side effects", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    const timeline: string[] = [];
    const { ops } = installStore(store);
    const wordpress = successWordpress({
      getListingById: async (id) => {
        timeline.push("remote:getListing");
        return {
          wordpress_listing_id: id,
          status: "publish",
          title: "Listing",
          author_id: 1,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
        };
      },
    });
    const originalInsertCount = () =>
      ops.filter(
        (op) => op.op === "insert" && op.table === "athena_getoblic_listing_links",
      ).length;
    const wordpressWithOrder: ClaimKnownListingWordpressPort = {
      ...wordpress,
      getListingById: async (id) => {
        assert.equal(originalInsertCount(), 1);
        return wordpress.getListingById(id);
      },
    };
    const result = await claim({}, wordpressWithOrder);
    assert.deepEqual(
      ops.find(
        (op) => op.op === "insert" && op.table === "athena_getoblic_listing_links",
      )?.values?.relationship_status,
      "claiming",
    );
    assert.equal(timeline[0], "remote:getListing");
    assert.equal(result.outcome, "linked");
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("4. same prospect/same listing idempotent retry continues", async () => {
    const existing = completeLink({
      organization_id: ORG_A,
      prospect_id: PROSPECT_A,
      wordpress_listing_id: 1000,
      relationship_status: "claiming",
    });
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [existing],
      events: [] as EventRow[],
    };
    const { ops } = installStore(store);
    const wordpress = successWordpress();
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "linked");
    assert.equal(
      ops.filter((op) => op.op === "insert" && op.table === "athena_getoblic_listing_links")
        .length,
      0,
    );
    assert.equal(store.links.length, 1);
  });

  it("5. same prospect/different listing conflicts", async () => {
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 2000,
          relationship_status: "linked",
        }),
      ],
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_ALREADY_LINKED");
        return true;
      },
    );
  });

  it("6. same org/different prospect conflicts", async () => {
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 1000,
          relationship_status: "claiming",
        }),
      ],
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CLAIMED_SAME_ORG");
        assert.doesNotMatch(error.message, new RegExp(PROSPECT_B));
        return true;
      },
    );
  });

  it("7. other org active claim is a generic conflict", async () => {
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CLAIMED_OTHER_ORG");
        assert.doesNotMatch(error.message, new RegExp(ORG_B));
        assert.doesNotMatch(error.message, new RegExp(PROSPECT_B));
        assert.doesNotMatch(JSON.stringify(error), new RegExp(ORG_B));
        assert.doesNotMatch(JSON.stringify(error), new RegExp(PROSPECT_B));
        return true;
      },
    );
  });

  it("8. unique-race reservation conflict resolves deterministically", async () => {
    const raced = completeLink({
      organization_id: ORG_B,
      prospect_id: PROSPECT_B,
      wordpress_listing_id: 1000,
      relationship_status: "claiming",
    });
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [],
      failNextLinkInsert: true,
      raceWinner: raced,
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CLAIMED_OTHER_ORG");
        return true;
      },
    );
  });

  it("9. remote 404 transitions to remote_missing without allocating", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      getListingById: async () => {
        throw new GetOblicWordpressError(
          "NOT_FOUND",
          "Listing not found.",
          404,
          "LISTING_NOT_FOUND",
        );
      },
    });
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "remote_missing");
    assert.equal(store.links[0]?.relationship_status, "remote_missing");
    assert.equal(store.events.length, 0);
    assert.ok(store.links[0]?.last_remote_error);
  });

  it("10. transient remote failure stays claiming", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      getListingById: async () => {
        throw new GetOblicWordpressError("NETWORK", "unavailable", 502);
      },
    });
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_TRANSIENT");
        assert.equal(error.link?.relationship_status, "claiming");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.events.length, 0);
  });

  it("11. remote_missing retry 404 stays remote_missing", async () => {
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
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      getListingById: async () => {
        throw new GetOblicWordpressError(
          "NOT_FOUND",
          "Listing not found.",
          404,
          "LISTING_NOT_FOUND",
        );
      },
    });
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "remote_missing");
    assert.equal(store.links[0]?.relationship_status, "remote_missing");
    assert.equal(wordpress.calls.some((call) => call.startsWith("assignAuthor:")), false);
  });

  it("12. remote_missing retry 200 continues acquisition", async () => {
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
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress();
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "linked");
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("mapped wordpress_author_id skips resolve-or-create and continues author assignment", async () => {
    const store = {
      settings: [defaultSettings({ wordpress_author_id: 42 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress();
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "linked");
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("resolveOrCreate:")),
      false,
    );
    assert.equal(
      wordpress.calls.some((call) => call === "assignAuthor:1000:42"),
      true,
    );
    assert.equal(store.links[0]?.wordpress_author_id, 42);
  });

  it("13. author already correct changed=false is success", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      assignListingAuthor: async (listingId, userId) => ({
        wordpress_listing_id: listingId,
        wordpress_user_id: userId,
        changed: false,
      }),
    });
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "linked");
    assert.equal(store.links[0]?.wordpress_author_id, 42);
  });

  it("14. author changed=true is success", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "linked");
    assert.equal(result.allocated, true);
  });

  it("15. author remote failure stays claiming and does not allocate", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      assignListingAuthor: async () => {
        throw new GetOblicWordpressError("NETWORK", "author failed", 502);
      },
    });
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_AUTHOR_FAILED");
        assert.equal(error.link?.relationship_status, "claiming");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.events.length, 0);
  });

  it("16. existing lifetime ledger avoids second consumption", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [
        {
          id: "e1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          listing_link_id: "old",
          wordpress_listing_id: 1000,
          event_kind: "allocate_existing",
          period_start: "2026-01-01",
          idempotency_key: "old-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    const { ops } = installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "linked");
    assert.equal(result.allocated, false);
    assert.equal(
      ops.filter(
        (op) =>
          op.op === "insert" &&
          op.table === "athena_getoblic_listing_allocation_events",
      ).length,
      0,
    );
    assert.equal(
      ops.filter(
        (op) =>
          op.op === "rpc" && op.table === CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC,
      ).length,
      1,
    );
    assert.equal(store.events.length, 1);
  });

  it("17. allowance exceeded stops before ledger insert and linked", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [
        {
          id: "e1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          listing_link_id: "other",
          wordpress_listing_id: 2000,
          event_kind: "allocate_existing",
          period_start: "2026-09-01",
          idempotency_key: "other-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "allowance_exceeded");
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.events.length, 1);
    assert.match(
      String(store.links[0]?.last_remote_error),
      /GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED/,
    );
  });

  it("18. successful first allocation uses a deterministic idempotency key", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    const { ops } = installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.allocated, true);
    assert.equal(store.events.length, 1);
    assert.equal(store.events[0]?.event_kind, "allocate_existing");
    assert.equal(
      store.events[0]?.idempotency_key,
      buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
    );
    assert.equal(store.events[0]?.period_start, "2026-09-01");
    const rpc = ops.find(
      (op) =>
        op.op === "rpc" && op.table === CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC,
    );
    assert.ok(rpc?.values);
    assert.equal(
      rpc?.values?.p_idempotency_key,
      buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
    );
    assert.equal(rpc?.values?.p_period_start, "2026-09-01");
    assert.equal(Object.hasOwn(rpc?.values ?? {}, "p_monthly_allowance"), false);
    assert.equal(Object.hasOwn(rpc?.values ?? {}, "monthly_allowance"), false);
    assert.equal(Object.hasOwn(rpc?.values ?? {}, "p_event_kind"), false);
    assert.equal(Object.hasOwn(rpc?.values ?? {}, "event_kind"), false);
    assert.equal(
      ops.filter(
        (op) =>
          op.op === "insert" &&
          op.table === "athena_getoblic_listing_allocation_events",
      ).length,
      0,
    );
  });

  it("19. final linked state clears remote errors and records the author", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "claiming",
          last_remote_error: "previous",
          last_remote_error_at: "2026-09-01T00:00:00.000Z",
        }),
      ],
      events: [] as EventRow[],
    };
    installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "linked");
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.equal(store.links[0]?.wordpress_author_id, 42);
    assert.equal(store.links[0]?.last_remote_error, null);
    assert.equal(store.links[0]?.allocated_at, NOW.toISOString());
  });

  it("20. no second active listing for a prospect", async () => {
    const source = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(source, /GETOBLIC_PROSPECT_ALREADY_LINKED/);
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1111,
          relationship_status: "remote_missing",
        }),
      ],
    });
    await assert.rejects(
      () => claim({ wordpressListingId: 1000 }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_ALREADY_LINKED");
        return true;
      },
    );
  });

  it("21. no second active claim for a WordPress listing", async () => {
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 1000,
          relationship_status: "remote_missing",
        }),
      ],
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CLAIMED_SAME_ORG");
        return true;
      },
    );
  });

  it("22. no tenant identity leakage in cross-org conflicts", async () => {
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 1000,
          relationship_status: "claiming",
        }),
      ],
    });
    await assert.rejects(
      () => claim(),
      (error: unknown) => {
        const serialized = JSON.stringify(error);
        assert.doesNotMatch(serialized, new RegExp(ORG_B));
        assert.doesNotMatch(serialized, new RegExp(PROSPECT_B));
        assert.doesNotMatch(
          (error as GetOblicDirectoryError).message,
          /organization|prospect id/i,
        );
        return true;
      },
    );
  });

  it("23. no API key leakage in claim errors or persisted remote errors", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = SECRET_KEY;
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      getListingById: async () => {
        throw new GetOblicWordpressError(
          "UNAUTHORIZED",
          `Invalid key ${SECRET_KEY}`,
          403,
          "INVALID_API_KEY",
        );
      },
    });
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.doesNotMatch(error.message, new RegExp(SECRET_KEY));
        assert.doesNotMatch(JSON.stringify(error), new RegExp(SECRET_KEY));
        assert.doesNotMatch(
          String(error.link?.last_remote_error),
          new RegExp(SECRET_KEY),
        );
        return true;
      },
    );
  });

  it("linked same triple is idempotent readback without remote or allocation", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
          wordpress_author_id: 42,
          allocated_at: "2026-09-01T00:00:00.000Z",
        }),
      ],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress();
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "linked");
    assert.equal(wordpress.calls.length, 0);
    assert.equal(store.events.length, 0);
  });

  it("fails closed when wordpress_author_id is unmapped and no owner email exists", async () => {
    const source = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(source, /organization_members/);
    assert.match(source, /\.eq\("role", "owner"\)/);
    assert.match(source, /getUserById/);
    assert.doesNotMatch(source, /prospect\.email/);
    assert.doesNotMatch(source, /actorUserId.*email/);
    installStore({
      settings: [defaultSettings({ wordpress_author_id: null })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      members: [],
    });
    const wordpress = successWordpress();
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED");
        return true;
      },
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("resolveOrCreate:")),
      false,
    );
  });

  it("resolves a null wordpress_author_id from the organization owner email only", async () => {
    const store = {
      settings: [defaultSettings({ wordpress_author_id: null })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
      members: [
        { organization_id: ORG_A, user_id: USER_A, role: "owner" },
      ],
      ownerEmails: { [USER_A]: "owner@example.com" },
    };
    installStore(store);
    const wordpress = successWordpress({
      resolveOrCreateUser: async (email) => {
        assert.equal(email, "owner@example.com");
        return { wordpress_user_id: 271519816, created: false };
      },
    });
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "linked");
    assert.equal(store.settings[0]?.wordpress_author_id, 271519816);
    assert.equal(store.links[0]?.wordpress_author_id, 271519816);
    assert.equal(store.events.length, 1);
  });

  it("does not consume allowance when only provisioning the WordPress user", async () => {
    const source = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    const resolveIdx = source.indexOf("resolveOrCreateWordpressUser");
    const allocateIdx = source.indexOf("consumeAllowanceIfNeeded");
    assert.ok(resolveIdx >= 0);
    assert.ok(allocateIdx > resolveIdx);
  });

  it("allowance 0 exceeds without inserting an event or linking", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 0 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "allowance_exceeded");
    assert.equal(result.allocated, false);
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.events.length, 0);
    assert.match(
      String(store.links[0]?.last_remote_error),
      /GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED/,
    );
  });

  it("unexpected allocation RPC failure stays claiming and does not link", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
      failAllocationRpc: true,
    };
    installStore(store);
    await assert.rejects(
      () => claim({}, successWordpress()),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CONCURRENCY_CONFLICT");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.events.length, 0);
  });

  it("service no longer performs a separate monthly count + insert", () => {
    const source = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(source, /consume_getoblic_listing_allocation/);
    assert.match(source, /supabaseAdmin\.rpc\(/);
    assert.doesNotMatch(source, /GETOBLIC_LISTING_ALLOCATION_EVENTS_TABLE/);
    assert.doesNotMatch(source, /countPeriodAllocations/);
    assert.doesNotMatch(source, /insertAllocationEvent/);
    assert.doesNotMatch(source, /findLifetimeAllocation/);
    assert.doesNotMatch(source, /count:\s*"exact"/);
    assert.doesNotMatch(source, /event_kind:\s*["']allocate_existing["']/);
  });

  it("rejects an invalid WordPress listing ID", async () => {
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
    });
    await assert.rejects(
      () => claim({ wordpressListingId: 0 }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_INVALID_WORDPRESS_LISTING_ID");
        return true;
      },
    );
  });
});

describe("GetOblic claim route contract", () => {
  it("uses current org context and never accepts organizationId from the client", () => {
    const route = read(
      "app/api/prospects/[id]/getoblic-directory/claim/route.ts",
    );
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /claimKnownExistingListing/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(route, /ATHENA_V2_DIRECTORY_API_KEY/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
    assert.match(route, /LICENSEE_ORIGIN_COOKIE/);
  });

  it("does not implement search, create, KB push, release, or autocomplete", () => {
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    const route = read(
      "app/api/prospects/[id]/getoblic-directory/claim/route.ts",
    );
    assert.doesNotMatch(claim, /putWordpressListingKnowledgeBase/);
    assert.doesNotMatch(claim, /getWordpressListingsByGoogleId/);
    assert.doesNotMatch(claim, /relationship_status:\s*"released"/);
    assert.doesNotMatch(route, /knowledge-base/);
    assert.doesNotMatch(route, /autocomplete/);
  });
});

describe("GetOblic consumeGetOblicListingAllocation wrapper", () => {
  it("maps missing settings to not_configured and does not insert", async () => {
    const store = {
      settings: [] as SettingsRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const decision = await consumeGetOblicListingAllocation({
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      listingLinkId: "link-1",
      wordpressListingId: 1000,
      periodStart: "2026-09-01",
      idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
      actorUserId: USER_A,
      actorLicenseeAccountId: null,
    });
    assert.equal(decision.kind, "not_configured");
    assert.equal(store.events.length, 0);
  });

  it("maps a lifetime event to already without new consumption", async () => {
    const store = {
      settings: [defaultSettings()],
      events: [
        {
          id: "e1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          listing_link_id: "old",
          wordpress_listing_id: 1000,
          event_kind: "allocate_existing",
          period_start: "2026-01-01",
          idempotency_key: "old-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    installStore(store);
    const decision = await consumeGetOblicListingAllocation({
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      listingLinkId: "link-1",
      wordpressListingId: 1000,
      periodStart: "2026-09-01",
      idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
      actorUserId: USER_A,
      actorLicenseeAccountId: null,
    });
    assert.deepEqual(decision, {
      kind: "already",
      allocationEventId: "e1",
      periodStart: "2026-01-01",
    });
    assert.equal(store.events.length, 1);
  });

  it("maps allowance 0 to exceeded", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 0 })],
      events: [] as EventRow[],
    };
    installStore(store);
    const decision = await consumeGetOblicListingAllocation({
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      listingLinkId: "link-1",
      wordpressListingId: 1000,
      periodStart: "2026-09-01",
      idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
      actorUserId: null,
      actorLicenseeAccountId: null,
    });
    assert.equal(decision.kind, "exceeded");
    assert.equal(store.events.length, 0);
  });

  it("maps an exhausted period to exceeded", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      events: [
        {
          id: "e1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          listing_link_id: "other",
          wordpress_listing_id: 2000,
          event_kind: "allocate_existing",
          period_start: "2026-09-01",
          idempotency_key: "other-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    installStore(store);
    const decision = await consumeGetOblicListingAllocation({
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      listingLinkId: "link-1",
      wordpressListingId: 1000,
      periodStart: "2026-09-01",
      idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
      actorUserId: null,
      actorLicenseeAccountId: null,
    });
    assert.equal(decision.kind, "exceeded");
    assert.equal(store.events.length, 1);
  });

  it("maps room in the allowance to consumed with frozen event fields", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      events: [] as EventRow[],
    };
    const { ops } = installStore(store);
    const decision = await consumeGetOblicListingAllocation({
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      listingLinkId: "link-1",
      wordpressListingId: 1000,
      periodStart: "2026-09-01",
      idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
      actorUserId: USER_A,
      actorLicenseeAccountId: null,
    });
    assert.equal(decision.kind, "consumed");
    assert.equal(store.events.length, 1);
    assert.equal(store.events[0]?.event_kind, "allocate_existing");
    assert.equal(store.events[0]?.organization_id, ORG_A);
    assert.equal(store.events[0]?.prospect_id, PROSPECT_A);
    assert.equal(store.events[0]?.listing_link_id, "link-1");
    assert.equal(store.events[0]?.wordpress_listing_id, 1000);
    assert.equal(store.events[0]?.period_start, "2026-09-01");
    assert.equal(
      store.events[0]?.idempotency_key,
      buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 1000),
    );
    assert.equal(store.events[0]?.actor_user_id, USER_A);
    const rpc = ops.find(
      (op) =>
        op.op === "rpc" && op.table === CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC,
    );
    assert.equal(Object.hasOwn(rpc?.values ?? {}, "monthly_allowance"), false);
    assert.equal(Object.hasOwn(rpc?.values ?? {}, "event_kind"), false);
  });

  it("does not share allowance pools across organizations", async () => {
    const store = {
      settings: [
        defaultSettings({ monthly_allowance: 1 }),
        defaultSettings({
          organization_id: ORG_B,
          monthly_allowance: 1,
        }),
      ],
      events: [
        {
          id: "e1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          listing_link_id: "a",
          wordpress_listing_id: 1000,
          event_kind: "allocate_existing",
          period_start: "2026-09-01",
          idempotency_key: "org-a-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    installStore(store);
    const orgA = await consumeGetOblicListingAllocation({
      organizationId: ORG_A,
      prospectId: PROSPECT_B,
      listingLinkId: "link-b",
      wordpressListingId: 2000,
      periodStart: "2026-09-01",
      idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(ORG_A, 2000),
      actorUserId: null,
      actorLicenseeAccountId: null,
    });
    const orgB = await consumeGetOblicListingAllocation({
      organizationId: ORG_B,
      prospectId: PROSPECT_B,
      listingLinkId: "link-c",
      wordpressListingId: 2000,
      periodStart: "2026-09-01",
      idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(ORG_B, 2000),
      actorUserId: null,
      actorLicenseeAccountId: null,
    });
    assert.equal(orgA.kind, "exceeded");
    assert.equal(orgB.kind, "consumed");
    assert.equal(store.events.length, 2);
    assert.equal(
      store.events.filter((row) => row.organization_id === ORG_B).length,
      1,
    );
  });

  it("treats an unexpected RPC transport failure as a concurrency conflict", async () => {
    installStore({
      settings: [defaultSettings()],
      failAllocationRpc: true,
    });
    await assert.rejects(
      () =>
        consumeGetOblicListingAllocation({
          organizationId: ORG_A,
          prospectId: PROSPECT_A,
          listingLinkId: "link-1",
          wordpressListingId: 1000,
          periodStart: "2026-09-01",
          idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(
            ORG_A,
            1000,
          ),
          actorUserId: null,
          actorLicenseeAccountId: null,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CONCURRENCY_CONFLICT");
        return true;
      },
    );
  });
});

describe("GetOblic claim public payload", () => {
  it("omits foreign tenant identifiers from the public claim shape", () => {
    const publicClaim = {
      outcome: "linked" as const,
      relationship_status: "linked" as const,
      listing_link_id: "link-1",
      wordpress_listing_id: 1000,
      wordpress_author_id: 42,
      allocated: true,
      allocated_at: NOW.toISOString(),
      last_verified_at: NOW.toISOString(),
    };
    const serialized = JSON.stringify(publicClaim);
    assert.doesNotMatch(serialized, /organization_id/);
    assert.doesNotMatch(serialized, /prospect_id/);
    const link = completeLink({
      organization_id: ORG_B,
      prospect_id: PROSPECT_B,
      wordpress_listing_id: 1000,
      relationship_status: "linked",
    }) as unknown as GetOblicListingLink;
    const mapped = toPublicGetOblicClaim({
      outcome: "linked",
      link,
      allocated: false,
    });
    assert.doesNotMatch(JSON.stringify(mapped), new RegExp(ORG_B));
    assert.doesNotMatch(JSON.stringify(mapped), new RegExp(PROSPECT_B));
  });
});
