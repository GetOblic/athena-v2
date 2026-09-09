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
  RESERVE_GETOBLIC_LISTING_CAPACITY_RPC,
  consumeGetOblicListingAllocation,
  toPublicGetOblicClaim,
  type ClaimKnownListingWordpressPort,
} from "../../services/getoblicDirectory/getoblicDirectoryClaimService";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import {
  GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
  type GetOblicListingLink,
} from "../../services/getoblicDirectory/getoblicDirectoryTypes";

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
        author_id: GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
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
  injectReservedLink?: LinkRow;
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
    if (fn === RESERVE_GETOBLIC_LISTING_CAPACITY_RPC) {
      if (store.failAllocationRpc) {
        return { data: null, error: { message: "allocation rpc failed" } };
      }
      return applyReserveRpc(
        store,
        args,
        () => `link-${nextLinkId++}`,
        () => `event-${nextEventId++}`,
        ops,
      );
    }
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

function applyReserveRpc(
  store: {
    settings?: SettingsRow[];
    links?: LinkRow[];
    events?: EventRow[];
    failNextLinkInsert?: boolean;
    raceWinner?: LinkRow;
    injectReservedLink?: LinkRow;
  },
  args: Record<string, unknown>,
  nextLinkId: () => string,
  nextEventId: () => string,
  ops: Op[],
): {
  data: Record<string, unknown>;
  error: null;
} {
  const organizationId = String(args.p_organization_id ?? "");
  const prospectId = String(args.p_prospect_id ?? "");
  const wordpressListingId = Number(args.p_wordpress_listing_id);
  const settings = (store.settings ?? []).find(
    (row) => row.organization_id === organizationId,
  );

  if (!settings) {
    return {
      data: {
        reserved: false,
        resumed: false,
        exceeded: false,
        not_configured: true,
        conflicted: false,
        listing_link_id: null,
        allocation_event_id: null,
        event_recorded: false,
      },
      error: null,
    };
  }

  if (store.injectReservedLink) {
    const injected = store.injectReservedLink;
    store.links = [...(store.links ?? []), injected];
    delete store.injectReservedLink;
    return {
      data: {
        reserved: false,
        resumed: true,
        exceeded: false,
        not_configured: false,
        conflicted: false,
        listing_link_id: injected.id,
        allocation_event_id: null,
        event_recorded: false,
      },
      error: null,
    };
  }

  const active = (store.links ?? []).filter((row) =>
    ["claiming", "linked", "remote_missing"].includes(row.relationship_status),
  );
  const sameActive = active.find(
    (row) =>
      row.organization_id === organizationId &&
      row.prospect_id === prospectId &&
      row.wordpress_listing_id === wordpressListingId,
  );
  if (sameActive) {
    const event = ensureFirstLifetimeEvent(store, args, sameActive.id, nextEventId);
    return {
      data: {
        reserved: false,
        resumed: true,
        exceeded: false,
        not_configured: false,
        conflicted: false,
        listing_link_id: sameActive.id,
        allocation_event_id: event.id,
        event_recorded: event.recordedNow,
      },
      error: null,
    };
  }

  const held = active.filter((row) => row.organization_id === organizationId)
    .length;
  if (held >= settings.monthly_allowance) {
    return {
      data: {
        reserved: false,
        resumed: false,
        exceeded: true,
        not_configured: false,
        conflicted: false,
        listing_link_id: null,
        allocation_event_id: null,
        event_recorded: false,
      },
      error: null,
    };
  }

  if (store.failNextLinkInsert) {
    store.failNextLinkInsert = false;
    if (store.raceWinner) {
      store.links = [...(store.links ?? []), store.raceWinner];
    }
    return {
      data: {
        reserved: false,
        resumed: false,
        exceeded: false,
        not_configured: false,
        conflicted: true,
        listing_link_id: store.raceWinner?.id ?? null,
        allocation_event_id: null,
        event_recorded: false,
      },
      error: null,
    };
  }

  const conflict = active.find(
    (row) =>
      row.prospect_id === prospectId ||
      row.wordpress_listing_id === wordpressListingId,
  );
  if (conflict) {
    return {
      data: {
        reserved: false,
        resumed: false,
        exceeded: false,
        not_configured: false,
        conflicted: true,
        listing_link_id: conflict.id,
        allocation_event_id: null,
        event_recorded: false,
      },
      error: null,
    };
  }

  const row = completeLink({
    id: nextLinkId(),
    organization_id: organizationId,
    prospect_id: prospectId,
    wordpress_listing_id: wordpressListingId,
    relationship_status: "claiming",
    created_by_user_id: (args.p_actor_user_id as string | null) ?? null,
    created_via_licensee_account_id:
      (args.p_actor_licensee_account_id as string | null) ?? null,
  });
  store.links = [...(store.links ?? []), row];
  ops.push({
    op: "insert",
    table: "athena_getoblic_listing_links",
    values: {
      relationship_status: "claiming",
      organization_id: organizationId,
      prospect_id: prospectId,
      wordpress_listing_id: wordpressListingId,
    },
  });
  const event = ensureFirstLifetimeEvent(store, args, row.id, nextEventId);
  return {
    data: {
      reserved: true,
      resumed: false,
      exceeded: false,
      not_configured: false,
      conflicted: false,
      listing_link_id: row.id,
      allocation_event_id: event.id,
      event_recorded: event.recordedNow,
    },
    error: null,
  };
}

function ensureFirstLifetimeEvent(
  store: { events?: EventRow[] },
  args: Record<string, unknown>,
  listingLinkId: string,
  nextEventId: () => string,
): { id: string | null; recordedNow: boolean } {
  const organizationId = String(args.p_organization_id ?? "");
  const wordpressListingId = Number(args.p_wordpress_listing_id);
  const existing = (store.events ?? []).find(
    (row) =>
      row.organization_id === organizationId &&
      row.wordpress_listing_id === wordpressListingId,
  );
  if (existing) {
    return { id: existing.id, recordedNow: false };
  }
  const row: EventRow = {
    id: nextEventId(),
    organization_id: organizationId,
    prospect_id: (args.p_prospect_id as string | null) ?? null,
    listing_link_id: listingLinkId,
    wordpress_listing_id: wordpressListingId,
    event_kind: "allocate_existing",
    period_start: String(args.p_period_start ?? ""),
    idempotency_key: String(args.p_idempotency_key ?? ""),
    actor_user_id: (args.p_actor_user_id as string | null) ?? null,
    actor_licensee_account_id:
      (args.p_actor_licensee_account_id as string | null) ?? null,
  };
  store.events = [...(store.events ?? []), row];
  return { id: row.id, recordedNow: true };
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

  it("3. new claim reserves claiming before assign and allocation", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    const timeline: string[] = [];
    const { ops } = installStore(store);
    const insertCount = () =>
      ops.filter(
        (op) => op.op === "insert" && op.table === "athena_getoblic_listing_links",
      ).length;
    const wordpress = successWordpress({
      getListingById: async (id) => {
        timeline.push(`remote:getListing:${insertCount()}`);
        return {
          wordpress_listing_id: id,
          status: "publish",
          title: "Listing",
          author_id: GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
        };
      },
      assignListingAuthor: async (listingId, userId) => {
        timeline.push("remote:assignAuthor");
        assert.equal(insertCount(), 1);
        return {
          wordpress_listing_id: listingId,
          wordpress_user_id: userId,
          changed: true,
        };
      },
    });
    const result = await claim({}, wordpress);
    assert.deepEqual(
      ops.find(
        (op) => op.op === "insert" && op.table === "athena_getoblic_listing_links",
      )?.values?.relationship_status,
      "claiming",
    );
    assert.equal(timeline[0], "remote:getListing:0");
    assert.ok(timeline.includes("remote:getListing:1"));
    assert.ok(timeline.indexOf("remote:assignAuthor") > timeline.indexOf("remote:getListing:1"));
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

  it("5a. claiming reservation listing-id mismatch is rejected before WordPress work", async () => {
    const wordpress = successWordpress();
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      injectReservedLink: completeLink({
        id: "injected-claiming",
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 2000,
        relationship_status: "claiming",
      }),
    });
    await assert.rejects(
      () => claim({ wordpressListingId: 1000 }, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_ALREADY_LINKED");
        return true;
      },
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("getListing:2000")),
      false,
    );
  });

  it("5b. remote_missing reservation listing-id mismatch is rejected before WordPress work", async () => {
    const wordpress = successWordpress();
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      injectReservedLink: completeLink({
        id: "injected-remote-missing",
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 2000,
        relationship_status: "remote_missing",
      }),
    });
    await assert.rejects(
      () => claim({ wordpressListingId: 1000 }, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_ALREADY_LINKED");
        return true;
      },
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("getListing:2000")),
      false,
    );
  });

  it("5c. linked reservation listing-id mismatch remains rejected before WordPress work", async () => {
    const wordpress = successWordpress();
    installStore({
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      injectReservedLink: completeLink({
        id: "injected-linked",
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 2000,
        relationship_status: "linked",
      }),
    });
    await assert.rejects(
      () => claim({ wordpressListingId: 1000 }, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_ALREADY_LINKED");
        return true;
      },
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("getListing:2000")),
      false,
    );
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
      () => claim({}, successWordpress()),
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
    assert.equal(store.events.length, 1);
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
    assert.equal(store.events.length, 1);
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

  it("rejects a brand-new ineligible Add before inserting a claiming reservation", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    const { ops } = installStore(store);
    const wordpress = successWordpress({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: "Listing",
        author_id: 271520168,
        google_id: null,
        google_place_url: null,
        knowledge_base: null,
      }),
    });
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_NOT_CLAIMABLE");
        assert.equal(error.status, 409);
        assert.equal(error.link, null);
        assert.doesNotMatch(error.message, /271519816|271520168|WordPress|author/i);
        return true;
      },
    );
    assert.equal(store.links.length, 0);
    assert.equal(store.events.length, 0);
    assert.equal(
      ops.filter(
        (op) => op.op === "insert" && op.table === "athena_getoblic_listing_links",
      ).length,
      0,
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("fails closed at claim time when the live owner is no longer the inventory pool", async () => {
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
    const wordpress = successWordpress({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: "Listing",
        author_id: 99,
        google_id: null,
        google_place_url: null,
        knowledge_base: null,
      }),
    });
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_NOT_CLAIMABLE");
        assert.equal(error.link?.id, "link-1");
        assert.equal(error.link?.relationship_status, "claiming");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.links[0]?.wordpress_author_id, null);
    assert.equal(store.events.length, 1);
    assert.equal(
      ops.filter(
        (op) =>
          op.op === "rpc" && op.table === RESERVE_GETOBLIC_LISTING_CAPACITY_RPC,
      ).length,
      1,
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("re-reads the live owner after search and rejects a TOCTOU owner change", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    let reads = 0;
    const wordpress = successWordpress({
      getListingById: async (id) => {
        reads += 1;
        return {
          wordpress_listing_id: id,
          status: "publish",
          title: "Listing",
          author_id:
            reads === 1 ? GETOBLIC_INVENTORY_POOL_AUTHOR_ID : 271520168,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
        };
      },
    });
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_NOT_CLAIMABLE");
        return true;
      },
    );
    assert.equal(reads, 2);
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.links[0]?.wordpress_author_id, null);
    assert.equal(store.events.length, 1);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
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
    assert.equal(store.events.length, 1);
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
          op.op === "rpc" && op.table === RESERVE_GETOBLIC_LISTING_CAPACITY_RPC,
      ).length,
      1,
    );
    assert.equal(store.events.length, 1);
  });

  it("17. over capacity is rejected before WP author assign and claiming insert", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          id: "held",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 2000,
          relationship_status: "linked",
        }),
      ],
      events: [
        {
          id: "e1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          listing_link_id: "held",
          wordpress_listing_id: 2000,
          event_kind: "allocate_existing",
          period_start: "2026-09-01",
          idempotency_key: "other-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CAPACITY_EXCEEDED");
        return true;
      },
    );
    assert.equal(store.links.length, 1);
    assert.equal(store.links[0]?.id, "held");
    assert.equal(store.events.length, 1);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
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
        op.op === "rpc" && op.table === RESERVE_GETOBLIC_LISTING_CAPACITY_RPC,
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
    const store = {
      settings: [defaultSettings({ wordpress_author_id: null })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
      members: [],
    };
    installStore(store);
    const wordpress = successWordpress();
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED");
        assert.equal(error.link?.relationship_status, "claiming");
        return true;
      },
    );
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.match(
      String(store.links[0]?.last_remote_error),
      /GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED/,
    );
    assert.equal(store.events.length, 1);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("resolveOrCreate:")),
      false,
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("stamps last_remote_error when author mapping fails after reservation", async () => {
    const reserved = completeLink({
      id: "link-reserved",
      organization_id: ORG_A,
      prospect_id: PROSPECT_A,
      wordpress_listing_id: 1000,
      relationship_status: "claiming",
      wordpress_author_id: null,
      allocated_at: null,
      last_remote_error: null,
    });
    const store = {
      settings: [defaultSettings({ wordpress_author_id: null })],
      prospects: [defaultProspect()],
      links: [reserved],
      events: [] as EventRow[],
      members: [],
    };
    installStore(store);
    const wordpress = successWordpress();
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED");
        assert.equal(error.link?.id, "link-reserved");
        assert.equal(error.link?.relationship_status, "claiming");
        return true;
      },
    );
    assert.equal(store.links.length, 1);
    assert.equal(store.links[0]?.id, "link-reserved");
    assert.equal(store.links[0]?.relationship_status, "claiming");
    assert.equal(store.links[0]?.wordpress_author_id, null);
    assert.equal(store.links[0]?.allocated_at, null);
    assert.match(
      String(store.links[0]?.last_remote_error),
      /GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED/,
    );
    assert.ok(store.links[0]?.last_remote_error_at);
    assert.equal(store.events.length, 1);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("populates allocated_at when resume sees an already-consumed allocation", async () => {
    const store = {
      settings: [defaultSettings()],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          id: "link-1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "claiming",
          wordpress_author_id: null,
          allocated_at: null,
        }),
      ],
      events: [
        {
          id: "e1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          listing_link_id: "link-1",
          wordpress_listing_id: 1000,
          event_kind: "allocate_existing",
          period_start: "2026-09-01",
          idempotency_key: buildGetOblicAllocateExistingIdempotencyKey(
            ORG_A,
            1000,
          ),
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    const { ops } = installStore(store);
    const wordpress = successWordpress();
    const result = await claim({}, wordpress);
    assert.equal(result.outcome, "linked");
    assert.equal(result.allocated, false);
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.equal(store.links[0]?.wordpress_author_id, 42);
    assert.equal(store.links[0]?.allocated_at, NOW.toISOString());
    assert.equal(store.events.length, 1);
    assert.equal(store.events[0]?.id, "e1");
    assert.equal(
      ops.filter(
        (op) =>
          op.op === "rpc" && op.table === RESERVE_GETOBLIC_LISTING_CAPACITY_RPC,
      ).length,
      1,
    );
    assert.equal(
      ops.filter(
        (op) =>
          op.op === "insert" &&
          op.table === "athena_getoblic_listing_allocation_events",
      ).length,
      0,
    );
    assert.equal(
      wordpress.calls.some((call) => call === "assignAuthor:1000:42"),
      true,
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

  it("reserves capacity before WordPress author assignment", async () => {
    const source = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    const reserveIdx = source.indexOf("reserveGetOblicListingCapacity");
    const assignIdx = source.indexOf("assignAuthor(");
    assert.ok(reserveIdx >= 0);
    assert.ok(assignIdx > reserveIdx);
    assert.doesNotMatch(source, /consumeAllowanceIfNeeded/);
  });

  it("capacity 0 blocks a new claim before claiming insert or WP assign", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 0 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CAPACITY_EXCEEDED");
        return true;
      },
    );
    assert.equal(store.links.length, 0);
    assert.equal(store.events.length, 0);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("unexpected reservation RPC failure does not insert claiming or link", async () => {
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
    assert.equal(store.links.length, 0);
    assert.equal(store.events.length, 0);
  });

  it("service reserves capacity in SQL and does not count allocation events", () => {
    const source = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(source, /reserve_getoblic_listing_capacity/);
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

  it("configured capacity below the limit succeeds and records a first-lifetime event", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 3 })],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          id: "held-1",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 2000,
          relationship_status: "linked",
        }),
      ],
      events: [] as EventRow[],
    };
    installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "linked");
    assert.equal(result.allocated, true);
    assert.equal(
      store.links.filter((row) => row.relationship_status !== "released").length,
      2,
    );
    assert.equal(store.events.length, 1);
  });

  it("the last available slot succeeds", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "linked");
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("a historical allocation event is not held and does not bypass capacity on reclaim", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          id: "held",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 2000,
          relationship_status: "linked",
        }),
        completeLink({
          id: "released-old",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "released",
          released_at: "2026-08-01T00:00:00.000Z",
        }),
      ],
      events: [
        {
          id: "e-old",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          listing_link_id: "released-old",
          wordpress_listing_id: 1000,
          event_kind: "allocate_existing",
          period_start: "2026-01-01",
          idempotency_key: "old-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CAPACITY_EXCEEDED");
        return true;
      },
    );
    assert.equal(store.events.length, 1);
    assert.equal(store.events[0]?.id, "e-old");
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("claiming, linked, and remote_missing count as held; released does not", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 3 })],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          id: "c",
          organization_id: ORG_A,
          prospect_id: "cccccccc-cccc-cccc-cccc-cccccccccc01",
          wordpress_listing_id: 11,
          relationship_status: "claiming",
        }),
        completeLink({
          id: "l",
          organization_id: ORG_A,
          prospect_id: "cccccccc-cccc-cccc-cccc-cccccccccc02",
          wordpress_listing_id: 12,
          relationship_status: "linked",
        }),
        completeLink({
          id: "m",
          organization_id: ORG_A,
          prospect_id: "cccccccc-cccc-cccc-cccc-cccccccccc03",
          wordpress_listing_id: 13,
          relationship_status: "remote_missing",
        }),
        completeLink({
          id: "r",
          organization_id: ORG_A,
          prospect_id: "cccccccc-cccc-cccc-cccc-cccccccccc04",
          wordpress_listing_id: 14,
          relationship_status: "released",
          released_at: "2026-08-01T00:00:00.000Z",
        }),
      ],
      events: [] as EventRow[],
    };
    const wordpress = successWordpress();
    installStore(store);
    await assert.rejects(
      () => claim({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_CAPACITY_EXCEEDED");
        return true;
      },
    );
    assert.equal(
      store.links.filter((row) => row.wordpress_listing_id === 1000).length,
      0,
    );
  });

  it("same already-active relationship resumes without consuming another slot", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          id: "link-active",
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "claiming",
          wordpress_author_id: null,
        }),
      ],
      events: [] as EventRow[],
    };
    const { ops } = installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "linked");
    assert.equal(store.links.length, 1);
    assert.equal(store.links[0]?.id, "link-active");
    assert.equal(store.links[0]?.relationship_status, "linked");
    assert.equal(store.events.length, 1);
    assert.equal(
      ops.filter(
        (op) =>
          op.op === "rpc" && op.table === RESERVE_GETOBLIC_LISTING_CAPACITY_RPC,
      ).length,
      1,
    );
  });

  it("a released listing frees capacity so another claim can succeed", async () => {
    const store = {
      settings: [defaultSettings({ monthly_allowance: 1 })],
      prospects: [defaultProspect()],
      links: [
        completeLink({
          id: "released-old",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 2000,
          relationship_status: "released",
          released_at: "2026-08-01T00:00:00.000Z",
        }),
      ],
      events: [
        {
          id: "e-old",
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          listing_link_id: "released-old",
          wordpress_listing_id: 2000,
          event_kind: "allocate_existing",
          period_start: "2026-01-01",
          idempotency_key: "old-key",
          actor_user_id: null,
          actor_licensee_account_id: null,
        },
      ] as EventRow[],
    };
    installStore(store);
    const result = await claim({}, successWordpress());
    assert.equal(result.outcome, "linked");
    assert.equal(
      store.links.filter((row) => row.relationship_status !== "released").length,
      1,
    );
    assert.equal(store.events.length, 2);
    assert.equal(store.events[0]?.id, "e-old");
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

describe("GetOblic make-assigned claim (Google / no author POST)", () => {
  it("reserves capacity, verifies google_id and mapped author, and links without /author POST", async () => {
    const store = {
      settings: [defaultSettings({ wordpress_author_id: 42 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: "Oak Street Salon",
        author_id: 42,
        google_id: "ChIJexamplePlace",
        google_place_url: "https://maps.google.com/?cid=1",
        knowledge_base: null,
      }),
    });
    const result = await claim(
      {
        verification: {
          mode: "make_assigned",
          expectedGoogleId: "ChIJexamplePlace",
          expectedWordpressAuthorId: 42,
        },
      },
      wordpress,
    );
    assert.equal(result.outcome, "linked");
    assert.equal(result.link.relationship_status, "linked");
    assert.equal(result.link.wordpress_author_id, 42);
    assert.equal(result.link.google_id_snapshot, "ChIJexamplePlace");
    assert.equal(result.link.google_id_is_matchable, true);
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("resolveOrCreate:")),
      false,
    );
    assert.equal(store.links[0]?.relationship_status, "linked");
  });

  it("rejects a Make-assigned listing whose google_id does not match", async () => {
    const store = {
      settings: [defaultSettings({ wordpress_author_id: 42 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: "Oak Street Salon",
        author_id: 42,
        google_id: "ChIJotherPlace",
        google_place_url: null,
        knowledge_base: null,
      }),
    });
    await assert.rejects(
      () =>
        claim(
          {
            verification: {
              mode: "make_assigned",
              expectedGoogleId: "ChIJexamplePlace",
              expectedWordpressAuthorId: 42,
            },
          },
          wordpress,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_NOT_CLAIMABLE");
        return true;
      },
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });

  it("rejects a Make-assigned listing whose author is not the mapped org author", async () => {
    const store = {
      settings: [defaultSettings({ wordpress_author_id: 42 })],
      prospects: [defaultProspect()],
      links: [] as LinkRow[],
      events: [] as EventRow[],
    };
    installStore(store);
    const wordpress = successWordpress({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: "Oak Street Salon",
        author_id: GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
        google_id: "ChIJexamplePlace",
        google_place_url: null,
        knowledge_base: null,
      }),
    });
    await assert.rejects(
      () =>
        claim(
          {
            verification: {
              mode: "make_assigned",
              expectedGoogleId: "ChIJexamplePlace",
              expectedWordpressAuthorId: 42,
            },
          },
          wordpress,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LISTING_NOT_CLAIMABLE");
        return true;
      },
    );
    assert.equal(
      wordpress.calls.some((call) => call.startsWith("assignAuthor:")),
      false,
    );
  });
});
