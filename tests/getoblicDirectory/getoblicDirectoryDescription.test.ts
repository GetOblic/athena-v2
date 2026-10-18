import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  directoryErrorStatus,
  GetOblicDirectoryError,
} from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  syncGetOblicListingDescription,
  toPublicGetOblicDescriptionSync,
  type DescriptionWordpressPort,
  type SyncGetOblicListingDescriptionInput,
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
const LEGACY_DESCRIPTION = "Legacy generated listing description that must not be sent.";
const OBSERVED_DESCRIPTION = "Observed listing copy that must never be sent.";
const CANONICAL_LISTING_ID = 88021;
const PROSPECT_OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const AUTHORIZATION_RPC = "licensee_own_company_unclaimed_getoblic_authorized";
const CANONICAL_ID_RPC = "prospect_canonical_wordpress_listing_id";

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
  source?: string;
  created_at: string;
  updated_at: string;
};

type ArtifactRow = {
  prospect_id: string;
  organization_id: string;
  artifact_type: "description" | "knowledge_base";
  revision: number;
  content: string;
  content_sha256: string;
  origin: "generated" | "edited";
  source_executive_version_id: string | null;
  saved_at: string;
  saved_by_organization_id: string;
};

type Op = { op: string; table?: string; values?: Record<string, unknown> };

function descriptionArtifact(
  content = GENERATED_DESCRIPTION,
  overrides: Partial<ArtifactRow> = {},
): ArtifactRow {
  const body = overrides.content ?? content;
  return {
    prospect_id: PROSPECT_A,
    organization_id: ORG_A,
    artifact_type: "description",
    revision: 1,
    content: body,
    content_sha256: createHash("sha256").update(body, "utf8").digest("hex"),
    origin: "edited",
    source_executive_version_id: null,
    saved_at: "2026-09-10T12:00:00.000Z",
    saved_by_organization_id: ORG_A,
    ...overrides,
    content: body,
    content_sha256:
      overrides.content_sha256 ??
      createHash("sha256").update(body, "utf8").digest("hex"),
  };
}

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
  artifacts?: ArtifactRow[];
  authorization?: boolean | "error" | "true-string";
  canonicalListingId?: number | string | null | "error";
  activeClaimLookupError?: boolean;
}): { ops: Op[] } {
  const ops: Op[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    ops.push({ op: "from", table });
    const filters: Record<string, unknown> = {};

    const rowsForTable = (): Record<string, unknown>[] => {
      if (table === "prospects") {
        return (store.prospects ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "athena_getoblic_listing_links") {
        return (store.links ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "prospect_directory_artifacts") {
        return (store.artifacts ?? []) as unknown as Record<string, unknown>[];
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
      update(values: Record<string, unknown>) {
        ops.push({ op: "update", table, values });
        return builder;
      },
      insert(values: Record<string, unknown>) {
        ops.push({ op: "insert", table, values });
        return builder;
      },
      then(
        onFulfilled?: (value: {
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (table === "athena_getoblic_listing_links" && store.activeClaimLookupError) {
          return Promise.resolve({
            data: null,
            error: { message: "active claim lookup failed" },
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: matchingRows(), error: null as null }).then(
          onFulfilled,
          onRejected,
        );
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
    if (fn === AUTHORIZATION_RPC) {
      if (store.authorization === "error") {
        return { data: null, error: { message: "authorization lookup failed" } };
      }
      if (store.authorization === "true-string") {
        return { data: "true", error: null };
      }
      if (typeof store.authorization === "boolean") {
        return { data: store.authorization, error: null };
      }
    }
    if (fn === CANONICAL_ID_RPC) {
      if (store.canonicalListingId === "error") {
        return { data: null, error: { message: "canonical lookup failed" } };
      }
      if ("canonicalListingId" in store && store.canonicalListingId !== "error") {
        return { data: store.canonicalListingId ?? null, error: null };
      }
    }
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
  artifacts?: ArtifactRow[];
} = {}) {
  return {
    prospects: overrides.prospects ?? [defaultProspect()],
    links: overrides.links ?? [defaultLinkedRow()],
    artifacts: overrides.artifacts ?? [descriptionArtifact()],
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
  it("pushes the saved description artifact and never observed or legacy copy", async () => {
    const store = readyStore({
      prospects: [
        defaultProspect({
          generated_listing_description: {
            description: LEGACY_DESCRIPTION,
            generatedAt: "2026-09-10T12:00:00.000Z",
          },
        }),
      ],
    });
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
    assert.notEqual(wordpress.calls[0]?.description, LEGACY_DESCRIPTION);
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

  it("does not call WordPress when no valid saved description exists", async () => {
    const wordpress = successWordpress();
    const blocked = [
      [],
      [descriptionArtifact(`  ${GENERATED_DESCRIPTION}  `)],
      [
        descriptionArtifact("x".repeat(GETOBLIC_DESCRIPTION_MAX_CHARS + 1), {
          content_sha256: "not-a-matching-hash",
        }),
      ],
    ];
    for (const artifacts of blocked) {
      wordpress.calls.length = 0;
      installStore(
        readyStore({
          artifacts,
          prospects: [
            defaultProspect({
              generated_listing_description: {
                description: LEGACY_DESCRIPTION,
              },
            }),
          ],
        }),
      );
      await assert.rejects(
        () => sync({}, wordpress),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, "GETOBLIC_SAVED_DESCRIPTION_MISSING");
          assert.equal(error.status, 409);
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
  it("sends the saved artifact exactly and ignores request content", async () => {
    const edited = "Edited saved description for the listing.";
    const store = readyStore({
      artifacts: [
        descriptionArtifact(edited, { revision: 4, origin: "edited" }),
      ],
    });
    const wordpress = successWordpress();
    installStore(store);
    await syncGetOblicListingDescription(
      {
        organizationId: ORG_A,
        prospectId: PROSPECT_A,
        content: "Unsaved draft that must not be sent.",
        description: "Browser description that must not be sent.",
      } as SyncGetOblicListingDescriptionInput,
      wordpress,
    );
    assert.equal(wordpress.calls[0]?.description, edited);
    assert.equal(wordpress.calls.length, 1);
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
    const authorization = read(
      "services/getoblicDirectory/getoblicOutboundContentAuthorization.ts",
    );
    assert.match(service, /loadPublishableSavedDirectoryArtifact/);
    assert.match(service, /prospect_directory_artifacts|artifactType: "description"/);
    assert.doesNotMatch(service, /generated_listing_description/);
    assert.doesNotMatch(service, /resolveOutboundGeneratedDescription/);
    assert.match(service, /putWordpressListingDescription/);
    assert.match(service, /recheckGetOblicOutboundContentTarget/);
    assert.match(service, /resolveGetOblicOutboundContentTarget/);
    assert.match(authorization, /relationship_status === "linked"/);
    assert.doesNotMatch(service, /raw_json\?\.observed|observed\.description/);
    assert.doesNotMatch(service, /readObservedListingDescription/);
    assert.doesNotMatch(service, /wordpressListingId:\s*input/);
    assert.doesNotMatch(service, /description:\s*input/);
    assert.doesNotMatch(service, /claimKnownExistingListing/);
    assert.doesNotMatch(service, /consumeGetOblicListingAllocation/);
  });
});

function unclaimedRawJson(): Record<string, unknown> {
  return {
    origin: "getoblic_directory",
    organization_id: ORG_B,
    wordpress_listing_id: 11111,
    observed: {
      description: OBSERVED_DESCRIPTION,
      wordpress_listing_id: 22222,
    },
  };
}

function unclaimedProspect(overrides: Partial<ProspectRow> = {}): ProspectRow {
  return defaultProspect({
    source: "getoblic",
    raw_json: unclaimedRawJson(),
    ...overrides,
  });
}

function unclaimedStore(
  extra: {
    prospects?: ProspectRow[];
    links?: LinkRow[];
    artifacts?: ArtifactRow[];
    authorization?: boolean | "error" | "true-string";
    canonicalListingId?: number | string | null | "error";
    activeClaimLookupError?: boolean;
  } = {},
) {
  return {
    prospects: extra.prospects ?? [unclaimedProspect()],
    links: extra.links ?? [],
    artifacts: extra.artifacts ?? [descriptionArtifact()],
    authorization: extra.authorization ?? true,
    canonicalListingId:
      "canonicalListingId" in extra ? extra.canonicalListingId : CANONICAL_LISTING_ID,
    activeClaimLookupError: extra.activeClaimLookupError,
  };
}

function rpcOps(ops: Op[]): Op[] {
  return ops.filter((operation) => operation.op === "rpc");
}

function mutationOps(ops: Op[]): Op[] {
  return ops.filter(
    (operation) => operation.op === "insert" || operation.op === "update",
  );
}

async function expectSyncError(
  run: () => Promise<unknown>,
  code: string,
  status?: number,
) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof GetOblicDirectoryError);
    assert.equal(error.code, code);
    if (status != null) assert.equal(error.status, status);
    return true;
  });
}

describe("GetOblic unclaimed description outbound", () => {
  it("keeps a linked owner on the linked row and ignores unclaimed SQL", async () => {
    const store = {
      ...readyStore(),
      authorization: false as const,
      canonicalListingId: 1,
    };
    const wordpress = successWordpress();
    const { ops } = installStore(store);
    const result = await sync(store, wordpress);

    assert.equal(result.listing_link_id, "link-1");
    assert.equal(result.wordpress_listing_id, 36440);
    assert.equal(wordpress.calls[0]?.listingId, 36440);
    assert.equal(wordpress.calls[0]?.description, GENERATED_DESCRIPTION);
    assert.equal(rpcOps(ops).length, 0);
    assert.equal(mutationOps(ops).length, 0);
  });

  it("puts the SQL canonical listing id for an authorized unclaimed Prospect", async () => {
    const prospect = unclaimedProspect();
    const store = unclaimedStore({ prospects: [prospect] });
    const wordpress = successWordpress();
    const { ops } = installStore(store);
    const result = await sync(store, wordpress);
    const calls = rpcOps(ops);

    assert.deepEqual(result, {
      success: true,
      prospect_id: PROSPECT_A,
      listing_link_id: null,
      wordpress_listing_id: CANONICAL_LISTING_ID,
      changed: true,
    });
    assert.equal(wordpress.calls.length, 1);
    assert.equal(wordpress.calls[0]?.listingId, CANONICAL_LISTING_ID);
    assert.equal(wordpress.calls[0]?.description, GENERATED_DESCRIPTION);
    assert.notEqual(wordpress.calls[0]?.description, OBSERVED_DESCRIPTION);
    assert.notEqual(wordpress.calls[0]?.listingId, 11111);
    assert.notEqual(wordpress.calls[0]?.listingId, 22222);
    assert.deepEqual(
      calls.map((call) => call.table),
      [AUTHORIZATION_RPC, CANONICAL_ID_RPC, AUTHORIZATION_RPC, CANONICAL_ID_RPC],
    );
    assert.deepEqual(calls[0]?.values, { p_organization_id: ORG_A });
    assert.deepEqual(calls[1]?.values, { p_raw: prospect.raw_json });
    assert.equal(mutationOps(ops).length, 0);
    assert.equal(store.links.length, 0);
    assert.equal(store.prospects.length, 1);
    assert.equal(
      ops.some((operation) => operation.table === "licensee_accounts"),
      false,
    );
    assert.equal(
      ops.some((operation) => operation.table === "licensee_sub_accounts"),
      false,
    );
  });

  it("accepts a canonical id returned as a numeric string", async () => {
    const store = unclaimedStore({ canonicalListingId: String(CANONICAL_LISTING_ID) });
    const wordpress = successWordpress();
    installStore(store);
    const result = await sync(store, wordpress);
    assert.equal(result.wordpress_listing_id, CANONICAL_LISTING_ID);
    assert.equal(result.listing_link_id, null);
    assert.equal(wordpress.calls[0]?.listingId, CANONICAL_LISTING_ID);
  });

  it("denies a listing claimed by another organization without mutating that link", async () => {
    const wordpress = successWordpress();
    for (const relationship_status of ["claiming", "linked", "remote_missing"] as const) {
      wordpress.calls.length = 0;
      const foreign = defaultLinkedRow({
        id: `other-org-${relationship_status}`,
        organization_id: ORG_B,
        prospect_id: PROSPECT_OTHER,
        wordpress_listing_id: CANONICAL_LISTING_ID,
        relationship_status,
      });
      const before = JSON.stringify(foreign);
      const store = unclaimedStore({ links: [foreign] });
      const { ops } = installStore(store);
      await expectSyncError(
        () => sync(store, wordpress),
        "GETOBLIC_LISTING_CLAIMED_OTHER_ORG",
        409,
      );
      assert.equal(wordpress.calls.length, 0, relationship_status);
      assert.equal(JSON.stringify(store.links[0]), before, relationship_status);
      assert.equal(mutationOps(ops).length, 0, relationship_status);
      assert.equal(store.links.length, 1, relationship_status);
    }
  });

  it("denies an unclaimed send when the active-claim lookup errors", async () => {
    const store = unclaimedStore({ activeClaimLookupError: true });
    const wordpress = successWordpress();
    const { ops } = installStore(store);
    await expectSyncError(
      () => sync(store, wordpress),
      "GETOBLIC_CONCURRENCY_CONFLICT",
      409,
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(mutationOps(ops).length, 0);
    assert.equal(store.links.length, 0);
  });

  it("blocks a remote PUT when unclaimed authorization is false", async () => {
    const store = unclaimedStore({ authorization: false });
    const wordpress = successWordpress();
    const { ops } = installStore(store);
    await expectSyncError(
      () => sync(store, wordpress),
      "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
      403,
    );
    assert.equal(directoryErrorStatus("GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED"), 403);
    assert.equal(wordpress.calls.length, 0);
    assert.deepEqual(
      rpcOps(ops).map((call) => call.table),
      [AUTHORIZATION_RPC],
    );
    assert.equal(mutationOps(ops).length, 0);
    assert.equal(store.prospects.length, 1);
  });

  it("blocks a remote PUT when Own Company authorization is false", async () => {
    const wordpress = successWordpress();
    const store = unclaimedStore({ authorization: false });
    const { ops } = installStore(store);
    await expectSyncError(
      () => sync(store, wordpress),
      "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
      403,
    );
    assert.equal(wordpress.calls.length, 0);
    assert.equal(
      ops.some(
        (operation) =>
          operation.table === "licensee_accounts" ||
          operation.table === "licensee_sub_accounts",
      ),
      false,
    );
    assert.equal(mutationOps(ops).length, 0);
  });

  it("fails closed when the authorization lookup errors", async () => {
    const store = unclaimedStore({ authorization: "error" });
    const wordpress = successWordpress();
    installStore(store);
    await expectSyncError(
      () => sync(store, wordpress),
      "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
      403,
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("fails closed when authorization is not a boolean true", async () => {
    const store = unclaimedStore({ authorization: "true-string" });
    const wordpress = successWordpress();
    installStore(store);
    await expectSyncError(
      () => sync(store, wordpress),
      "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
    );
    assert.equal(wordpress.calls.length, 0);
  });

  it("blocks a remote PUT when the canonical listing id is missing or invalid", async () => {
    const invalidIds: Array<number | string | null | "error"> = [
      null,
      0,
      -1,
      1.5,
      "0",
      "12.5",
      "",
      "error",
    ];
    const wordpress = successWordpress();
    for (const canonicalListingId of invalidIds) {
      wordpress.calls.length = 0;
      const store = unclaimedStore({ canonicalListingId });
      installStore(store);
      await expectSyncError(
        () => sync(store, wordpress),
        "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
        409,
      );
      assert.equal(wordpress.calls.length, 0, String(canonicalListingId));
    }
  });

  it("blocks a non-GetOblic Prospect before unclaimed authorization", async () => {
    const prospects = [
      defaultProspect({
        source: "manual",
        raw_json: { origin: "getoblic_directory", wordpress_listing_id: 11111 },
      }),
      defaultProspect({
        source: "getoblic",
        raw_json: { origin: "manual", wordpress_listing_id: 11111 },
      }),
      defaultProspect({
        source: " getoblic",
        raw_json: unclaimedRawJson(),
      }),
      defaultProspect({ source: "getoblic", raw_json: null }),
    ];
    const wordpress = successWordpress();
    for (const prospect of prospects) {
      wordpress.calls.length = 0;
      const store = unclaimedStore({ prospects: [prospect], links: [] });
      const { ops } = installStore(store);
      await expectSyncError(
        () => sync(store, wordpress),
        "GETOBLIC_LINK_NOT_FOUND",
      );
      assert.equal(wordpress.calls.length, 0);
      assert.equal(rpcOps(ops).length, 0);
    }
  });

  it("does not fall through from claiming, remote_missing, or released", async () => {
    const wordpress = successWordpress();
    for (const relationship_status of ["claiming", "remote_missing", "released"] as const) {
      wordpress.calls.length = 0;
      const store = unclaimedStore({
        links: [
          defaultLinkedRow({
            relationship_status,
            released_at:
              relationship_status === "released"
                ? "2026-09-15T12:00:00.000Z"
                : null,
          }),
        ],
      });
      const { ops } = installStore(store);
      await expectSyncError(
        () => sync(store, wordpress),
        "GETOBLIC_RELATIONSHIP_NOT_LINKED",
      );
      assert.equal(wordpress.calls.length, 0, relationship_status);
      assert.equal(rpcOps(ops).length, 0, relationship_status);
      assert.equal(mutationOps(ops).length, 0, relationship_status);
    }
  });

  it("stops later unclaimed sends when authorization becomes false and leaves the Prospect", async () => {
    const store = unclaimedStore();
    const wordpress = successWordpress();
    installStore(store);
    const first = await sync(store, wordpress);
    assert.equal(first.listing_link_id, null);
    store.authorization = false;
    await expectSyncError(
      () => sync(store, wordpress),
      "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
    );
    assert.equal(wordpress.calls.length, 1);
    assert.equal(store.prospects.length, 1);
    assert.equal(store.links.length, 0);
  });

  it("ignores client organization and listing identity on the request", async () => {
    const prospect = unclaimedProspect();
    const store = unclaimedStore({ prospects: [prospect] });
    const wordpress = successWordpress();
    const { ops } = installStore(store);
    const result = await syncGetOblicListingDescription(
      {
        organizationId: ORG_A,
        prospectId: PROSPECT_A,
        wordpressListingId: 1,
        wordpress_listing_id: 2,
        organization_id: ORG_B,
        listingId: 3,
      } as SyncGetOblicListingDescriptionInput,
      wordpress,
    );
    const calls = rpcOps(ops);
    assert.equal(result.wordpress_listing_id, CANONICAL_LISTING_ID);
    assert.equal(wordpress.calls[0]?.listingId, CANONICAL_LISTING_ID);
    assert.deepEqual(calls[0]?.values, { p_organization_id: ORG_A });
    assert.deepEqual(calls[1]?.values, { p_raw: prospect.raw_json });
    const authorization = read(
      "services/getoblicDirectory/getoblicOutboundContentAuthorization.ts",
    );
    assert.match(authorization, /licensee_own_company_unclaimed_getoblic_authorized/);
    assert.match(authorization, /prospect_canonical_wordpress_listing_id/);
    assert.match(authorization, /p_organization_id:\s*organizationId/);
    assert.match(authorization, /p_raw:\s*rawJson/);
    assert.match(authorization, /UNCLAIMED_GETOBLIC_PROSPECT_SOURCE = "getoblic"/);
    assert.match(
      authorization,
      /UNCLAIMED_GETOBLIC_PROSPECT_ORIGIN = "getoblic_directory"/,
    );
    assert.match(authorization, /source !== UNCLAIMED_GETOBLIC_PROSPECT_SOURCE/);
    assert.doesNotMatch(
      authorization,
      /raw_json\.wordpress_listing_id|rawJson\.wordpress_listing_id|observed/,
    );
    assert.doesNotMatch(authorization, /\.insert\(|\.update\(/);
    assert.doesNotMatch(
      authorization,
      /claimKnownExistingListing|consumeGetOblicListingAllocation/,
    );
  });
});
