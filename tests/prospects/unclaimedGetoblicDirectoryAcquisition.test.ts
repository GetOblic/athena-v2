/**
 * CO-UNCLAIMED-1 Gate 4C — unclaimed Directory acquisition.
 * Mocked database and WordPress. No live Supabase, WordPress, or Make calls.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  resolveUnclaimedDirectoryOpportunityCardPhase,
} from "../../components/prospects/GetOblicOpportunityResultCard";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import { claimKnownExistingListing } from "../../services/getoblicDirectory/getoblicDirectoryClaimService";
import {
  convertGetOblicDirectoryListing,
  isExactUnclaimedGetoblicDirectoryProspect,
  type GetOblicConvertDependencies,
} from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import {
  ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC,
  acquireUnclaimedGetoblicDirectoryProspect,
  findSameOrgDirectoryProspectIds,
  mapAcquireUnclaimedGetoblicProspectRpcError,
} from "../../services/getoblicDirectory/unclaimedGetoblicDirectoryAcquisition";
import {
  LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC,
  resolveUnclaimedGetoblicDirectoryMode,
} from "../../services/getoblicDirectory/unclaimedGetoblicDirectoryMode";
import type { GetOblicWordpressListing } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import { convertGoogleBusinessSelection } from "../../services/googleBusiness/googleBusinessConvertService";
import { GOOGLE_BUSINESS_ADD_ACTION } from "../../lib/googlePlaces/googlePlacesTypes";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const PROSPECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LISTING_ID = 4401;

const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceFn(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.ok(from >= 0, start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, end);
  return source.slice(from, to);
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
});

function listing(
  overrides: Partial<GetOblicWordpressListing> = {},
): GetOblicWordpressListing {
  return {
    wordpress_listing_id: LISTING_ID,
    status: "publish",
    title: "Acme Salon",
    author_id: 999,
    google_id: "places/acme",
    google_place_url: "https://maps.example/acme",
    knowledge_base: "do not import",
    phone: "214-555-0100",
    address: "100 Oak St",
    region: { term_id: 8, slug: "dallas", name: "Dallas" },
    website: "https://acme.example",
    email: "hi@acme.example",
    category: [{ term_id: 5, slug: "salon", name: "Hair Salon" }],
    ...overrides,
  };
}

function stamp(listingId = LISTING_ID): Record<string, unknown> {
  return {
    origin: "getoblic_directory",
    wordpress_listing_id: listingId,
    observed: { wordpress_listing_id: listingId },
  };
}

function asProspect(
  overrides: Partial<Prospect> & { raw_json: Record<string, unknown> },
): Prospect {
  return {
    id: PROSPECT,
    organization_id: ORG,
    source: "getoblic",
    status: "Saved",
    website: null,
    raw_json: overrides.raw_json,
    ...overrides,
  } as Prospect;
}

type ProspectRow = {
  id: string;
  organization_id: string;
  source: string;
  created_at: string;
  raw_json: Record<string, unknown>;
};

function installProspectRows(rows: ProspectRow[]) {
  const tables: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    tables.push(table);
    const filters: Record<string, unknown> = {};
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      filter: (column: string, _operator: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      then(
        resolve: (value: { data: ProspectRow[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        const matched =
          table === "prospects"
            ? rows.filter((row) =>
                Object.entries(filters).every(([column, expected]) => {
                  if (column === "raw_json->>origin") {
                    return row.raw_json.origin === expected;
                  }
                  if (column === "raw_json->>wordpress_listing_id") {
                    return String(expected).includes(
                      String(row.raw_json.wordpress_listing_id),
                    );
                  }
                  return row[column as keyof ProspectRow] === expected;
                }),
              )
            : [];
        return Promise.resolve({ data: matched, error: null }).then(
          resolve,
          reject,
        );
      },
    };
    return builder;
  };
  return tables;
}

function installRpc(
  handler: (
    fn: string,
    args: Record<string, unknown>,
  ) => { data: unknown; error: { message?: string; code?: string } | null },
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = async (
    fn: string,
    args: Record<string, unknown> = {},
  ) => {
    calls.push({ fn, args });
    return handler(fn, args);
  };
  return calls;
}

describe("unclaimed GetOblic directory mode", () => {
  it("returns unclaimed, ordinary, or refused from the database contract only", async () => {
    const calls = installRpc(() => ({ data: true, error: null }));
    assert.equal(await resolveUnclaimedGetoblicDirectoryMode(ORG), "unclaimed");
    assert.equal(calls[0]?.fn, LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC);
    assert.deepEqual(calls[0]?.args, { p_organization_id: ORG });

    installRpc(() => ({ data: false, error: null }));
    assert.equal(await resolveUnclaimedGetoblicDirectoryMode(ORG), "ordinary");

    installRpc(() => ({ data: "true", error: null }));
    assert.equal(await resolveUnclaimedGetoblicDirectoryMode(ORG), "refused");

    installRpc(() => ({ data: null, error: { message: "lookup failed" } }));
    assert.equal(await resolveUnclaimedGetoblicDirectoryMode(ORG), "refused");

    const untouched = installRpc(() => {
      throw new Error("rpc should not run");
    });
    assert.equal(await resolveUnclaimedGetoblicDirectoryMode("  "), "refused");
    assert.equal(untouched.length, 0);

    const mode = read(
      "services/getoblicDirectory/unclaimedGetoblicDirectoryMode.ts",
    );
    assert.doesNotMatch(mode, /licenseeOriginCookie|request\.cookies|LICENSEE_ORIGIN_COOKIE|searchParams/);
  });
});

describe("unclaimed GetOblic directory acquisition", () => {
  it("inserts through the existing RPC using factual listing fields", async () => {
    installProspectRows([]);
    const calls = installRpc((fn) => {
      if (fn === LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC) {
        return { data: true, error: null };
      }
      if (fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC) {
        return {
          data: [{ prospect_id: PROSPECT, inserted: true }],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    const reads: number[] = [];
    const result = await acquireUnclaimedGetoblicDirectoryProspect(
      {
        organizationId: ORG,
        actorUserId: USER,
        wordpressListingId: String(LISTING_ID),
      },
      {
        getListingById: async (id) => {
          reads.push(id);
          return listing();
        },
      },
    );

    assert.deepEqual(result, { prospectId: PROSPECT, inserted: true });
    assert.deepEqual(reads, [LISTING_ID]);
    const acquire = calls.find(
      (call) => call.fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC,
    );
    assert.deepEqual(acquire?.args, {
      p_organization_id: ORG,
      p_wordpress_listing_id: LISTING_ID,
      p_business_name: "Acme Salon",
      p_user_id: USER,
      p_website: "https://acme.example",
      p_email: "hi@acme.example",
      p_phone: "214-555-0100",
      p_address: "100 Oak St",
      p_city: "Dallas",
      p_state: null,
      p_country: null,
      p_category: "Hair Salon",
      p_google_business_url: "https://maps.example/acme",
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(acquire?.args ?? {}, "p_raw_json"),
      false,
    );
  });

  it("accepts every listing author and does not consult claim ownership", async () => {
    const tables = installProspectRows([]);
    installRpc((fn) => {
      if (fn === LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC) {
        return { data: true, error: null };
      }
      return {
        data: [{ prospect_id: PROSPECT, inserted: true }],
        error: null,
      };
    });
    await acquireUnclaimedGetoblicDirectoryProspect(
      {
        organizationId: ORG,
        actorUserId: USER,
        wordpressListingId: LISTING_ID,
      },
      {
        getListingById: async () => listing({ author_id: 424242 }),
      },
    );
    assert.deepEqual(tables, ["prospects"]);
  });

  it("reuses the same-organization canonical Prospect without a second insert", async () => {
    installProspectRows([
      {
        id: PROSPECT,
        organization_id: ORG,
        source: "getoblic",
        created_at: "2026-10-01T00:00:00.000Z",
        raw_json: stamp(),
      },
    ]);
    const calls = installRpc((fn) => {
      if (fn === LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC) {
        return { data: true, error: null };
      }
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    let reads = 0;
    const result = await acquireUnclaimedGetoblicDirectoryProspect(
      {
        organizationId: ORG,
        actorUserId: USER,
        wordpressListingId: LISTING_ID,
      },
      {
        getListingById: async () => {
          reads += 1;
          return listing();
        },
      },
    );
    assert.deepEqual(result, { prospectId: PROSPECT, inserted: false });
    assert.equal(reads, 0);
    assert.equal(
      calls.some((call) => call.fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC),
      false,
    );
  });

  it("keeps another organization's Prospect isolated", async () => {
    installProspectRows([
      {
        id: OTHER_PROSPECT,
        organization_id: OTHER_ORG,
        source: "getoblic",
        created_at: "2026-09-01T00:00:00.000Z",
        raw_json: stamp(),
      },
      {
        id: PROSPECT,
        organization_id: ORG,
        source: "getoblic",
        created_at: "2026-10-02T00:00:00.000Z",
        raw_json: stamp(),
      },
    ]);
    const matches = await findSameOrgDirectoryProspectIds(ORG, [LISTING_ID]);
    assert.equal(matches.get(LISTING_ID), PROSPECT);
    const other = await findSameOrgDirectoryProspectIds(OTHER_ORG, [LISTING_ID]);
    assert.equal(other.get(LISTING_ID), OTHER_PROSPECT);
  });

  it("maps the RPC exceptions into the existing response errors", () => {
    assert.throws(
      () =>
        mapAcquireUnclaimedGetoblicProspectRpcError({
          code: "P0001",
          message: "unclaimed_getoblic_prospecting_not_authorized",
        }),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_UNCLAIMED_PROSPECTING_NOT_AUTHORIZED" &&
        error.status === 403,
    );
    assert.throws(
      () =>
        mapAcquireUnclaimedGetoblicProspectRpcError({
          message: "unclaimed_getoblic_listing_id_invalid",
        }),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
    );
    assert.throws(
      () =>
        mapAcquireUnclaimedGetoblicProspectRpcError({
          message: "unclaimed_getoblic_business_name_required",
        }),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_NEEDS_BUSINESS_NAME",
    );
    assert.throws(
      () =>
        mapAcquireUnclaimedGetoblicProspectRpcError({
          code: "23505",
          message: "duplicate key value violates unique constraint",
        }),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_NAME_COLLISION",
    );
    assert.throws(
      () =>
        mapAcquireUnclaimedGetoblicProspectRpcError({
          code: "P0001",
          message: "prospect_capacity_exceeded",
        }),
      (error: unknown) =>
        error instanceof Error && error.name === "ProspectCapacityExceededError",
    );
  });

  it("does not claim, reserve, assign an author, call Make, or queue generation", () => {
    const service = read(
      "services/getoblicDirectory/unclaimedGetoblicDirectoryAcquisition.ts",
    );
    assert.match(service, /acquire_unclaimed_getoblic_prospect/);
    assert.doesNotMatch(service, /claimKnownExistingListing/);
    assert.doesNotMatch(service, /reserveGetOblicListingCapacity/);
    assert.doesNotMatch(service, /assignWordpressListingAuthor/);
    assert.doesNotMatch(service, /addGoogleBusinessListing/);
    assert.doesNotMatch(service, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(service, /athena_getoblic_listing_links/);
    assert.doesNotMatch(service, /isGetOblicInventoryPoolAuthor/);
  });
});

describe("unclaimed mode blocks claim and Google before mutation", () => {
  it("rejects a direct claim before listing capacity reservation", async () => {
    const calls = installRpc((fn) => {
      if (fn === LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC) {
        return { data: true, error: null };
      }
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    let fromCalls = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any).from = () => {
      fromCalls += 1;
      throw new Error("claim read the database");
    };

    await assert.rejects(
      () =>
        claimKnownExistingListing({
          organizationId: ORG,
          prospectId: PROSPECT,
          wordpressListingId: LISTING_ID,
          actorUserId: USER,
          actorLicenseeAccountId: null,
        }),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_UNCLAIMED_PROSPECTING_NOT_AUTHORIZED" &&
        error.status === 403,
    );
    assert.equal(fromCalls, 0);
    assert.deepEqual(
      calls.map((call) => call.fn),
      [LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC],
    );

    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.ok(
      claim.indexOf("resolveUnclaimedGetoblicDirectoryMode") <
        claim.indexOf("reserveGetOblicListingCapacity"),
    );
    assert.doesNotMatch(claim, /relationship_status:\s*"released"/);
  });

  it("stops Google acquisition before Make when unclaimed or refused", async () => {
    let makeCalls = 0;
    const input = {
      organizationId: ORG,
      payload: {
        action: GOOGLE_BUSINESS_ADD_ACTION,
        company_name: "Oak Street Salon",
        google_id: "ChIJexample",
      },
      actorUserId: USER,
      actorLicenseeAccountId: null,
    };
    for (const mode of ["unclaimed", "refused"] as const) {
      await assert.rejects(
        () =>
          convertGoogleBusinessSelection(input, {
            resolveDirectoryMode: async () => mode,
            addListing: async () => {
              makeCalls += 1;
              throw new Error("make");
            },
            getSettings: async () => {
              throw new Error("settings");
            },
          }),
        (error: unknown) =>
          error instanceof GetOblicDirectoryError &&
          error.code === "GETOBLIC_UNCLAIMED_PROSPECTING_NOT_AUTHORIZED",
      );
    }
    assert.equal(makeCalls, 0);
    const convert = read(
      "services/googleBusiness/googleBusinessConvertService.ts",
    );
    assert.ok(
      convert.indexOf("resolveDirectoryMode") <
        convert.indexOf("const make = await addListing"),
    );
  });
});

describe("permission off preserves ordinary add and never claims an unclaimed row", () => {
  function deps(
    overrides: Partial<GetOblicConvertDependencies>,
  ): GetOblicConvertDependencies {
    return {
      getSettings: async () => ({
        configured: false,
        code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
      }),
      getAllocationUsage: async () => {
        throw new Error("allocation");
      },
      hasAlreadyConsumedListing: async () => {
        throw new Error("consumed");
      },
      getActiveListingClaim: async () => ({ found: false }),
      getListingById: async () => {
        throw new Error("wordpress");
      },
      getProspectById: async () => null,
      findProspectByNameAndCity: async () => null,
      findProspectByWebsite: async () => null,
      findOriginProspectByListingId: async () => null,
      findReleasedLinkForListing: async () => null,
      findReusableWebsiteIntelligence: async () => null,
      createProspect: async () => {
        throw new Error("create");
      },
      updateProspect: async () => {
        throw new Error("update");
      },
      deleteProspect: async () => {
        throw new Error("delete");
      },
      claimKnownExistingListing: async () => {
        throw new Error("claim");
      },
      ensureProspectGenerationQueued: async () => {
        throw new Error("queue");
      },
      ...overrides,
    };
  }

  it("returns an existing unclaimed Prospect without claiming, even if another organization holds the listing", async () => {
    let claims = 0;
    const existing = asProspect({ raw_json: stamp() });
    const result = await convertGetOblicDirectoryListing(
      {
        organizationId: ORG,
        wordpressListingId: LISTING_ID,
        actorUserId: USER,
        actorLicenseeAccountId: null,
      },
      deps({
        findOriginProspectByListingId: async () => existing,
        getActiveListingClaim: async () => {
          throw new Error("other-org claim lookup");
        },
        claimKnownExistingListing: async () => {
          claims += 1;
          throw new Error("claim");
        },
      }),
    );
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, PROSPECT);
    assert.equal(result.generation_queued, false);
    assert.equal(claims, 0);
    assert.equal(
      isExactUnclaimedGetoblicDirectoryProspect(existing, LISTING_ID),
      true,
    );
  });

  it("still claims an ordinary directory Prospect", async () => {
    let claims = 0;
    const existing = asProspect({
      raw_json: {
        origin: "getoblic_directory",
        wordpress_listing_id: LISTING_ID,
        observed: { wordpress_listing_id: LISTING_ID, title: "Acme Salon" },
        attribution: { business_name: "getoblic_listing_detail" },
      },
    });
    await assert.rejects(
      () =>
        convertGetOblicDirectoryListing(
          {
            organizationId: ORG,
            wordpressListingId: LISTING_ID,
            actorUserId: USER,
            actorLicenseeAccountId: null,
          },
          deps({
            findOriginProspectByListingId: async () => existing,
            claimKnownExistingListing: async () => {
              claims += 1;
              throw new Error("claim");
            },
          }),
        ),
      /claim/,
    );
    assert.equal(claims, 1);
  });

  it("does not return another organization's unclaimed Prospect", async () => {
    let claims = 0;
    const foreign = asProspect({
      id: OTHER_PROSPECT,
      organization_id: OTHER_ORG,
      raw_json: stamp(),
    });
    const result = await convertGetOblicDirectoryListing(
      {
        organizationId: ORG,
        wordpressListingId: LISTING_ID,
        actorUserId: USER,
        actorLicenseeAccountId: null,
      },
      deps({
        findOriginProspectByListingId: async () => foreign,
        getActiveListingClaim: async () => ({
          found: true,
          organization_id: OTHER_ORG,
          prospect_id: OTHER_PROSPECT,
          relationship_status: "linked",
        }),
        claimKnownExistingListing: async () => {
          claims += 1;
          throw new Error("claim");
        },
      }),
    );
    assert.equal(result.outcome, "unavailable");
    assert.equal(result.prospect_id, null);
    assert.equal(claims, 0);
  });
});

describe("unclaimed directory cards, copy, and ordinary limits", () => {
  it("keeps linked ownership and marks a same-org unclaimed Prospect as already added", () => {
    assert.equal(
      resolveUnclaimedDirectoryOpportunityCardPhase({
        claimStatus: "OWNED_BY_THIS_ORG",
        sameOrgUnclaimedProspectId: PROSPECT,
        inFlight: false,
        failed: false,
      }),
      "owned",
    );
    assert.equal(
      resolveUnclaimedDirectoryOpportunityCardPhase({
        claimStatus: "UNAVAILABLE",
        inFlight: false,
        failed: false,
      }),
      "available",
    );
    assert.equal(
      resolveUnclaimedDirectoryOpportunityCardPhase({
        claimStatus: "INCOMPLETE_FOR_THIS_ORG",
        inFlight: false,
        failed: false,
      }),
      "available",
    );
    assert.equal(
      resolveUnclaimedDirectoryOpportunityCardPhase({
        claimStatus: "AVAILABLE",
        sameOrgUnclaimedProspectId: PROSPECT,
        inFlight: false,
        failed: false,
      }),
      "already_added",
    );
    assert.notEqual(
      resolveUnclaimedDirectoryOpportunityCardPhase({
        claimStatus: "UNAVAILABLE",
        sameOrgUnclaimedProspectId: PROSPECT,
        inFlight: false,
        failed: false,
      }),
      "owned",
    );

    const card = read("components/prospects/GetOblicOpportunityResultCard.tsx");
    const discovery = read(
      "components/prospects/GetOblicOpportunityDiscovery.tsx",
    );
    assert.match(card, /addToOpportunities/);
    assert.match(card, /addAsProspect/);
    assert.match(card, /alreadyAdded/);
    assert.match(card, /alreadyInMyOpportunities/);
    assert.match(discovery, /prospectCapacityReached &&/);
    assert.match(discovery, /directoryMode !== "unclaimed"/);
    assert.match(discovery, /router\.push\(`\/prospects\/\$\{existingProspectId\}`\)/);
    assert.equal(en.prospects.find.addToOpportunities, "Add to opportunities");
    assert.equal(en.prospects.find.alreadyInMyOpportunities, "Already in my opportunities");
    assert.equal(en.prospects.find.addAsProspect, "Add as Prospect");
    assert.equal(en.prospects.find.alreadyAdded, "Already added");

    for (const messages of [en, fr, es, itMessages, de, pt]) {
      assert.ok(messages.prospects.find.addAsProspect.trim());
      assert.ok(messages.prospects.find.alreadyAdded.trim());
      assert.notEqual(
        messages.prospects.find.addAsProspect,
        messages.prospects.find.addToOpportunities,
      );
      assert.notEqual(
        messages.prospects.find.alreadyAdded,
        messages.prospects.find.alreadyInMyOpportunities,
      );
    }
  });

  it("removes the 300-prospect add restriction only for unclaimed mode", () => {
    const discovery = read(
      "components/prospects/GetOblicOpportunityDiscovery.tsx",
    );
    const capacity = read("services/prospects/prospectCapacity.ts");
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    assert.match(capacity, /MAX_PROSPECTS_PER_ORGANIZATION = 300;/);
    assert.match(
      discovery,
      /directoryMode !== "unclaimed" &&\s*prospectCapacityReached &&/,
    );
    assert.match(methods, /googleOffered && directoryMode === "ordinary"/);
    assert.match(methods, /googleAvailable && !directoryAvailable/);
  });
});

describe("Gate 4C route contract and earlier gates", () => {
  it("denies Free Convert before unclaimed acquisition and keeps ordinary conversion", () => {
    const route = read("app/api/prospects/from-getoblic/route.ts");
    const post = sliceFn(route, "export async function POST", "catch (error)");
    const freeAt = post.indexOf("assertCurrentFreeConvertGeneration");
    const acquireAt = post.indexOf("acquireUnclaimedGetoblicDirectoryProspect");
    const convertAt = post.indexOf("convertGetOblicDirectoryListing");
    const cookieAt = post.indexOf("parseLicenseeOriginCookieValue");
    assert.ok(freeAt >= 0 && acquireAt > freeAt && convertAt > acquireAt);
    assert.ok(cookieAt > acquireAt);
    assert.match(post, /directoryMode === "refused"/);
    assert.match(post, /directoryMode === "unclaimed"/);
    assert.match(post, /prospect_id: acquired\.prospectId/);
    assert.doesNotMatch(post, /body\.organizationId|body\.organization_id/);
    assert.doesNotMatch(post, /claimKnownExistingListing|addGoogleBusinessListing/);
    assert.doesNotMatch(post, /ensureProspectGenerationQueued/);
  });

  it("leaves Gate 4A outbound and Gate 4B Super Admin behavior in place", () => {
    const outbound = read(
      "services/getoblicDirectory/getoblicOutboundContentAuthorization.ts",
    );
    const description = read(
      "services/getoblicDirectory/getoblicDirectoryDescriptionService.ts",
    );
    const knowledge = read(
      "services/getoblicDirectory/getoblicDirectoryKnowledgeBaseService.ts",
    );
    const admin = read(
      "services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspecting.ts",
    );
    assert.match(outbound, /licensee_own_company_unclaimed_getoblic_authorized/);
    assert.match(outbound, /prospect_canonical_wordpress_listing_id/);
    assert.doesNotMatch(outbound, /acquire_unclaimed_getoblic_prospect/);
    assert.match(description, /resolveGetOblicOutboundContentTarget/);
    assert.match(knowledge, /resolveGetOblicOutboundContentTarget/);
    assert.match(admin, /allow_unclaimed_getoblic_prospecting/);
    assert.doesNotMatch(admin, /acquire_unclaimed_getoblic_prospect/);
    assert.doesNotMatch(
      read("services/getoblicDirectory/unclaimedGetoblicDirectoryMode.ts"),
      /update\(|\.delete\(/,
    );
  });
});
