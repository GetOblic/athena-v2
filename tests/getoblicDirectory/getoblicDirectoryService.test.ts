import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  determineGetOblicListingClaimAvailability,
  getActiveGetOblicClaimByWordPressListingId,
  getActiveGetOblicClaimOrganizationIdsByWordPressListingIds,
  getActiveGetOblicLinkForProspect,
  getGetOblicAllocationUsage,
  getGetOblicDirectorySettings,
  hasOrganizationAlreadyConsumedListing,
} from "../../services/getoblicDirectory/getoblicDirectoryService";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
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
  period_start: string;
};

type QueryCall = {
  table: string;
  filters: Record<string, unknown>;
};

function completeLink(partial: Partial<LinkRow> & Pick<LinkRow, "organization_id" | "prospect_id" | "wordpress_listing_id" | "relationship_status">): LinkRow {
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

function installFixture(store: {
  settings?: SettingsRow[];
  links?: LinkRow[];
  events?: EventRow[];
}): { calls: QueryCall[] } {
  const calls: QueryCall[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let countHead = false;
    const call: QueryCall = { table, filters };
    calls.push(call);

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

    const result = () => {
      const matched = matchingRows();
      return {
        data: countHead ? null : matched,
        count: matched.length,
        error: null,
      };
    };

    const builder = {
      select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
        countHead = Boolean(options?.head && options.count === "exact");
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters[column] = values;
        return builder;
      },
      maybeSingle: async () => {
        const matched = matchingRows();
        return { data: matched[0] ?? null, error: null };
      },
      then(
        resolve: (value: { data: unknown; count: number; error: null }) => void,
      ) {
        return Promise.resolve(result()).then(resolve);
      },
    };

    return builder;
  };

  return { calls };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("GetOblic Directory settings", () => {
  it("returns a configured settings row", async () => {
    installFixture({
      settings: [
        {
          organization_id: ORG_A,
          monthly_allowance: 5,
          wordpress_author_id: 42,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
          updated_by_user_id: null,
        },
      ],
    });

    const result = await getGetOblicDirectorySettings(ORG_A);
    assert.equal(result.configured, true);
    if (result.configured) {
      assert.equal(result.settings.organization_id, ORG_A);
      assert.equal(result.settings.monthly_allowance, 5);
      assert.equal(result.settings.wordpress_author_id, 42);
    }
  });

  it("fails closed when the settings row is missing", async () => {
    installFixture({ settings: [] });
    const result = await getGetOblicDirectorySettings(ORG_A);
    assert.deepEqual(result, {
      configured: false,
      code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
    });
  });

  it("treats monthly_allowance=0 as valid configuration", async () => {
    installFixture({
      settings: [
        {
          organization_id: ORG_A,
          monthly_allowance: 0,
          wordpress_author_id: null,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
          updated_by_user_id: null,
        },
      ],
      events: [],
    });

    const settings = await getGetOblicDirectorySettings(ORG_A);
    assert.equal(settings.configured, true);
    if (settings.configured) {
      assert.equal(settings.settings.monthly_allowance, 0);
    }

    const usage = await getGetOblicAllocationUsage(ORG_A, NOW);
    assert.equal(usage.configured, true);
    if (usage.configured) {
      assert.equal(usage.monthly_allowance, 0);
      assert.equal(usage.used, 0);
      assert.equal(usage.remaining, 0);
    }
  });
});

describe("GetOblic allocation usage", () => {
  it("counts only the current UTC month and computes remaining", async () => {
    installFixture({
      settings: [
        {
          organization_id: ORG_A,
          monthly_allowance: 3,
          wordpress_author_id: null,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
          updated_by_user_id: null,
        },
      ],
      events: [
        { id: "e1", organization_id: ORG_A, wordpress_listing_id: 10, period_start: "2026-09-01" },
        { id: "e2", organization_id: ORG_A, wordpress_listing_id: 11, period_start: "2026-09-01" },
        { id: "e3", organization_id: ORG_A, wordpress_listing_id: 12, period_start: "2026-08-01" },
        { id: "e4", organization_id: ORG_B, wordpress_listing_id: 13, period_start: "2026-09-01" },
      ],
    });

    const usage = await getGetOblicAllocationUsage(ORG_A, NOW);
    assert.deepEqual(usage, {
      configured: true,
      monthly_allowance: 3,
      period_start: "2026-09-01",
      used: 2,
      remaining: 1,
    });
  });

  it("fails closed when settings are missing", async () => {
    installFixture({ settings: [], events: [] });
    const usage = await getGetOblicAllocationUsage(ORG_A, NOW);
    assert.deepEqual(usage, {
      configured: false,
      code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
    });
  });

  it("treats same-org historical consumption as already consumed", async () => {
    installFixture({
      events: [
        { id: "e1", organization_id: ORG_A, wordpress_listing_id: 99, period_start: "2026-01-01" },
      ],
    });

    assert.equal(await hasOrganizationAlreadyConsumedListing(ORG_A, 99), true);
    assert.equal(await hasOrganizationAlreadyConsumedListing(ORG_A, 100), false);
  });

  it("ignores another organization's consumption for this org's quota", async () => {
    installFixture({
      settings: [
        {
          organization_id: ORG_A,
          monthly_allowance: 2,
          wordpress_author_id: null,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
          updated_by_user_id: null,
        },
      ],
      events: [
        { id: "e1", organization_id: ORG_B, wordpress_listing_id: 50, period_start: "2026-09-01" },
      ],
    });

    assert.equal(await hasOrganizationAlreadyConsumedListing(ORG_A, 50), false);
    const usage = await getGetOblicAllocationUsage(ORG_A, NOW);
    assert.equal(usage.configured, true);
    if (usage.configured) {
      assert.equal(usage.used, 0);
      assert.equal(usage.remaining, 2);
    }
  });
});

describe("GetOblic claim lookup and availability (service)", () => {
  it("returns the tenant-scoped active link for a Prospect", async () => {
    installFixture({
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 123,
          relationship_status: "linked",
        }),
        completeLink({
          id: "link-other",
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 456,
          relationship_status: "linked",
        }),
      ],
    });

    const link = await getActiveGetOblicLinkForProspect(ORG_A, PROSPECT_A);
    assert.ok(link);
    assert.equal(link?.organization_id, ORG_A);
    assert.equal(link?.prospect_id, PROSPECT_A);
    assert.equal(link?.wordpress_listing_id, 123);
  });

  it("detects a global active claim without requiring the caller organization", async () => {
    const { calls } = installFixture({
      links: [
        completeLink({
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 123,
          relationship_status: "claiming",
        }),
      ],
    });

    const claim = await getActiveGetOblicClaimByWordPressListingId(123);
    assert.equal(claim.found, true);
    if (claim.found) {
      assert.equal(claim.organization_id, ORG_B);
    }
    const lookup = calls.find(
      (call) => call.table === "athena_getoblic_listing_links",
    );
    assert.ok(lookup);
    assert.equal(lookup?.filters.wordpress_listing_id, 123);
    assert.equal("organization_id" in (lookup?.filters ?? {}), false);
  });

  it("ignores released-only historical rows during global lookup", async () => {
    installFixture({
      links: [
        completeLink({
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 123,
          relationship_status: "released",
          released_at: "2026-08-01T00:00:00.000Z",
        }),
      ],
    });

    const claim = await getActiveGetOblicClaimByWordPressListingId(123);
    assert.deepEqual(claim, { found: false });
    const availability = await determineGetOblicListingClaimAvailability(
      ORG_A,
      PROSPECT_A,
      123,
    );
    assert.deepEqual(availability, { availability: "available" });
  });

  it("classifies cross-org remote_missing without exposing tenant identifiers", async () => {
    installFixture({
      links: [
        completeLink({
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 777,
          relationship_status: "remote_missing",
        }),
      ],
    });

    const result = await determineGetOblicListingClaimAvailability(
      ORG_A,
      PROSPECT_A,
      777,
    );
    assert.deepEqual(result, { availability: "claimed_by_other_org" });
    assert.deepEqual(Object.keys(result), ["availability"]);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(ORG_B));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(PROSPECT_B));
  });

  it("batches active claim organization IDs without scoping to the caller org", async () => {
    const { calls } = installFixture({
      links: [
        completeLink({
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 100,
          relationship_status: "linked",
        }),
        completeLink({
          id: "link-b",
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 200,
          relationship_status: "claiming",
        }),
        completeLink({
          id: "link-released",
          organization_id: ORG_B,
          prospect_id: PROSPECT_B,
          wordpress_listing_id: 300,
          relationship_status: "released",
        }),
      ],
    });

    const claims = await getActiveGetOblicClaimOrganizationIdsByWordPressListingIds([
      100,
      200,
      300,
      400,
    ]);
    assert.equal(claims.get(100), ORG_A);
    assert.equal(claims.get(200), ORG_B);
    assert.equal(claims.has(300), false);
    assert.equal(claims.has(400), false);
    const lookup = calls.find(
      (call) => call.table === "athena_getoblic_listing_links",
    );
    assert.ok(lookup);
    assert.equal("organization_id" in (lookup?.filters ?? {}), false);
  });
});
