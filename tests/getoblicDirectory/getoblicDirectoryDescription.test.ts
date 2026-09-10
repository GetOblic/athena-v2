import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  resolveOutboundGeneratedDescription,
  syncGetOblicListingDescription,
  toPublicGetOblicDescriptionSync,
  type DescriptionWordpressPort,
} from "../../services/getoblicDirectory/getoblicDirectoryDescriptionService";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import { GETOBLIC_DESCRIPTION_MAX_CHARS } from "../../services/prospects/prospectGeneratedListingDescription";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const ROOT = process.cwd();

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GENERATED_DESCRIPTION =
  "Athena-generated directory copy for the linked GetOblic listing.";
const OBSERVED_DESCRIPTION = "Observed listing copy that must never be sent.";

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
  generated_listing_description: unknown;
  raw_json: unknown;
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
    linked_discussion_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    generated_listing_description: {
      description: GENERATED_DESCRIPTION,
      generatedAt: "2026-09-10T12:00:00.000Z",
    },
    raw_json: {
      observed: { description: OBSERVED_DESCRIPTION },
    },
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
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
  overrides: Partial<DescriptionWordpressPort> = {},
): DescriptionWordpressPort & {
  calls: Array<{ listingId: number; description: string }>;
} {
  const calls: Array<{ listingId: number; description: string }> = [];
  return {
    calls,
    putDescription: async (listingId, description) => {
      calls.push({ listingId, description });
      return {
        wordpress_listing_id: listingId,
        changed: true,
      };
    },
    ...overrides,
  };
}

function installStore(store: {
  prospects?: ProspectRow[];
  links?: LinkRow[];
}): { ops: Op[] } {
  const ops: Op[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};

    const rowsForTable = (): Record<string, unknown>[] => {
      if (table === "prospects") {
        return (store.prospects ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "athena_getoblic_listing_links") {
        return (store.links ?? []) as unknown as Record<string, unknown>[];
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
      async maybeSingle() {
        const matched = matchingRows();
        return { data: matched[0] ?? null, error: null };
      },
      async single() {
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
  },
  wordpress?: DescriptionWordpressPort,
  input: {
    organizationId?: string;
    prospectId?: string;
  } = {},
) {
  return syncGetOblicListingDescription(
    {
      organizationId: input.organizationId ?? ORG_A,
      prospectId: input.prospectId ?? PROSPECT_A,
    },
    wordpress,
  );
}

function readyStore(overrides: {
  prospects?: ProspectRow[];
  links?: LinkRow[];
} = {}) {
  return {
    prospects: overrides.prospects ?? [defaultProspect()],
    links: overrides.links ?? [defaultLinkedRow()],
  };
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
  delete process.env.ATHENA_V2_DIRECTORY_API_KEY;
});

describe("GetOblic description outbound orchestration", () => {
  it("pushes generated_listing_description.description and never observed copy", async () => {
    const store = readyStore();
    const wordpress = successWordpress();
    installStore(store);

    const result = await sync(store, wordpress);

    assert.deepEqual(result, {
      success: true,
      prospect_id: PROSPECT_A,
      listing_link_id: "link-1",
      wordpress_listing_id: 36440,
      changed: true,
    });
    assert.equal(wordpress.calls.length, 1);
    assert.equal(wordpress.calls[0]?.listingId, 36440);
    assert.equal(wordpress.calls[0]?.description, GENERATED_DESCRIPTION);
    assert.notEqual(wordpress.calls[0]?.description, OBSERVED_DESCRIPTION);
  });

  it("preserves remote changed=false as success", async () => {
    const store = readyStore();
    const wordpress = successWordpress({
      putDescription: async (listingId, description) => {
        wordpress.calls.push({ listingId, description });
        return { wordpress_listing_id: listingId, changed: false };
      },
    });
    installStore(store);
    const result = await sync(store, wordpress);
    assert.equal(result.success, true);
    assert.equal(result.changed, false);
    assert.equal(wordpress.calls.length, 1);
  });

  it("rejects a prospect from another organization before any remote write", async () => {
    const wordpress = successWordpress();
    installStore(readyStore());
    await assert.rejects(
      () => sync({}, wordpress, { organizationId: ORG_B }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_PROSPECT_NOT_FOUND");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("fails if there is no active GetOblic relationship", async () => {
    const wordpress = successWordpress();
    installStore(readyStore({ links: [] }));
    await assert.rejects(
      () => sync({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_LINK_NOT_FOUND");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("fails if the relationship is not linked", async () => {
    const wordpress = successWordpress();
    for (const relationship_status of ["claiming", "remote_missing", "released"] as const) {
      wordpress.calls.length = 0;
      installStore(
        readyStore({
          links: [
            defaultLinkedRow({
              relationship_status,
              released_at:
                relationship_status === "released"
                  ? "2026-09-15T12:00:00.000Z"
                  : null,
            }),
          ],
        }),
      );
      await assert.rejects(
        () => sync({}, wordpress),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(
            error.code,
            relationship_status === "released"
              ? "GETOBLIC_RELATIONSHIP_NOT_LINKED"
              : "GETOBLIC_RELATIONSHIP_NOT_LINKED",
          );
          return true;
        },
      );
      assert.equal(wordpress.calls.length, 0, relationship_status);
    }
  });

  it("fails if generated_listing_description is missing", async () => {
    const wordpress = successWordpress();
    installStore(
      readyStore({
        prospects: [defaultProspect({ generated_listing_description: null })],
      }),
    );
    await assert.rejects(
      () => sync({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_GENERATED_DESCRIPTION_MISSING");
        return true;
      },
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("fails if the generated description is empty or invalid", async () => {
    const wordpress = successWordpress();
    const invalids = [
      { description: "   ", generatedAt: "2026-09-10T12:00:00.000Z" },
      { description: "", generatedAt: "2026-09-10T12:00:00.000Z" },
      { description: "x".repeat(GETOBLIC_DESCRIPTION_MAX_CHARS + 1) },
      { notDescription: GENERATED_DESCRIPTION },
      "plain string",
    ];
    for (const generated_listing_description of invalids) {
      wordpress.calls.length = 0;
      installStore(
        readyStore({
          prospects: [defaultProspect({ generated_listing_description })],
        }),
      );
      await assert.rejects(
        () => sync({}, wordpress),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, "GETOBLIC_GENERATED_DESCRIPTION_INVALID");
          return true;
        },
      );
      assert.equal(wordpress.calls.length, 0);
    }
  });

  it("uses only the description payload and the server-resolved listing id", async () => {
    const store = readyStore({
      links: [defaultLinkedRow({ wordpress_listing_id: 99901 })],
    });
    const wordpress = successWordpress();
    installStore(store);
    const result = await sync(store, wordpress);
    assert.equal(result.wordpress_listing_id, 99901);
    assert.equal(wordpress.calls[0]?.listingId, 99901);
    assert.deepEqual(Object.keys(wordpress.calls[0] ?? {}), [
      "listingId",
      "description",
    ]);
  });

  it("maps remote write failures without leaking the API key", async () => {
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "super-secret-directory-key";
    const wordpress = successWordpress({
      putDescription: async () => {
        throw new GetOblicWordpressError(
          "REMOTE_ERROR",
          "WordPress rejected the write super-secret-directory-key",
          502,
        );
      },
    });
    installStore(readyStore());
    await assert.rejects(
      () => sync({}, wordpress),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_WORDPRESS_DESCRIPTION_WRITE_FAILED");
        assert.doesNotMatch(error.message, /super-secret-directory-key/);
        return true;
      },
    );
  });

  it("returns a public result without description body or observed copy", async () => {
    const store = readyStore();
    const wordpress = successWordpress();
    installStore(store);
    const publicResult = toPublicGetOblicDescriptionSync(
      await sync(store, wordpress),
    );
    const serialized = JSON.stringify(publicResult);
    assert.equal("description" in publicResult, false);
    assert.doesNotMatch(serialized, new RegExp(GENERATED_DESCRIPTION));
    assert.doesNotMatch(serialized, new RegExp(OBSERVED_DESCRIPTION));
    assert.deepEqual(Object.keys(publicResult).sort(), [
      "changed",
      "listing_link_id",
      "prospect_id",
      "success",
      "wordpress_listing_id",
    ]);
  });
});

describe("GetOblic description outbound validation", () => {
  it("trims a valid persisted generated description", () => {
    assert.equal(
      resolveOutboundGeneratedDescription({
        description: `  ${GENERATED_DESCRIPTION}  `,
        generatedAt: "2026-09-10T12:00:00.000Z",
      }),
      GENERATED_DESCRIPTION,
    );
  });

  it("does not read observed description keys", () => {
    const resolver = resolveOutboundGeneratedDescription.toString();
    assert.doesNotMatch(resolver, /raw_json/);
    assert.doesNotMatch(resolver, /observed/);
    assert.match(resolver, /description/);
    assert.throws(
      () =>
        resolveOutboundGeneratedDescription({
          observed: { description: OBSERVED_DESCRIPTION },
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_GENERATED_DESCRIPTION_INVALID");
        return true;
      },
    );
  });
});

describe("GetOblic description route contract", () => {
  it("authenticates, stays organization-scoped, and never accepts client authority", () => {
    const route = read(
      "app/api/prospects/[id]/getoblic-directory/description/route.ts",
    );
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryDescriptionService.ts",
    );
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /OrganizationAccessError/);
    assert.match(route, /401/);
    assert.match(route, /Authentication required/);
    assert.match(route, /syncGetOblicListingDescription/);
    assert.match(route, /_request: NextRequest/);
    assert.doesNotMatch(route, /organizationId:\s*body/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(route, /body\.organization_id/);
    assert.doesNotMatch(route, /searchParams/);
    assert.doesNotMatch(route, /wordpressListingId/);
    assert.doesNotMatch(route, /wordpress_listing_id/);
    assert.doesNotMatch(route, /body\.description/);
    assert.doesNotMatch(route, /request\.json/);
    assert.doesNotMatch(route, /ATHENA_V2_DIRECTORY_API_KEY/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
    assert.doesNotMatch(route, /x-api-key/);
    assert.match(service, /generated_listing_description/);
    assert.match(service, /resolveOutboundGeneratedDescription/);
    assert.match(service, /putWordpressListingDescription/);
    assert.match(service, /relationship_status === "linked"/);
    assert.doesNotMatch(service, /raw_json\?\.observed|observed\.description/);
    assert.doesNotMatch(service, /readObservedListingDescription/);
    assert.doesNotMatch(service, /wordpressListingId:\s*input/);
    assert.doesNotMatch(service, /description:\s*input/);
    assert.doesNotMatch(service, /claimKnownExistingListing/);
    assert.doesNotMatch(service, /consumeGetOblicListingAllocation/);
  });
});
