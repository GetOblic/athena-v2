/**
 * CO-5 Google conversion diagnostic trace.
 * Proves instrumentation does not change conversion semantics and
 * emits a consistent request-scoped trace. No live remotes.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GOOGLE_BUSINESS_ADD_ACTION } from "../../lib/googlePlaces/googlePlacesTypes";
import type { GetOblicConvertDependencies } from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import { GETOBLIC_PROSPECT_SOURCE } from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import type { GetOblicListingLink } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import {
  CO5_GOOGLE_TRACE_PREFIX,
  createCo5GoogleTrace,
  logCo5GoogleTraceCaughtError,
} from "../../services/googleBusiness/googleBusinessConversionTrace";
import { convertGoogleBusinessSelection } from "../../services/googleBusiness/googleBusinessConvertService";
import { GoogleBusinessMakeError } from "../../services/googleBusiness/googleBusinessMakeTypes";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const ORG_A = "11111111-1111-1111-1111-111111111111";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LISTING_ID = 8801;
const GOOGLE_ID = "ChIJexamplePlace";
const SECRET_WEBHOOK = "https://hook.make.com/secret-google-webhook";
const SECRET_API_KEY = "sk-live-directory-key";

const SUCCESS_STAGES = [
  "author_mapping_lookup_start",
  "author_mapping_lookup_done",
  "make_start",
  "make_done",
  "wordpress_verify_start",
  "wordpress_verify_done",
  "directory_convert_start",
  "active_claim_lookup_start",
  "active_claim_lookup_done",
  "settings_lookup_start",
  "settings_lookup_done",
  "capacity_preflight_start",
  "origin_lookup_start",
  "capacity_preflight_done",
  "origin_lookup_done",
  "name_collision_lookup_start",
  "name_collision_lookup_done",
  "prospect_create_start",
  "prospect_create_done",
  "capacity_reserve_start",
  "capacity_reserve_done",
  "link_finalize_start",
  "link_finalize_done",
  "factual_import_start",
  "factual_import_done",
  "directory_convert_done",
  "google_convert_done",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: GOOGLE_BUSINESS_ADD_ACTION,
    company_name: "Japanese House",
    google_id: GOOGLE_ID,
    google_url: "https://maps.google.com/?cid=1",
    address: "100 Oak St, Dallas, TX 75201, USA",
    city: "Dallas",
    business_phone: "+1 214-555-0100",
    website: "https://oak.example",
    category: "hair_care",
    opening_hours: "Mon-Fri 9-5",
    ...overrides,
  };
}

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: PROSPECT_A,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    organization_id: ORG_A,
    user_id: "user-1",
    community_id: null,
    linked_discussion_id: null,
    business_name: "Japanese House",
    website: null,
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: null,
    category: null,
    country: null,
    state: null,
    city: null,
    address: null,
    company_size: null,
    revenue: null,
    employee_count: null,
    technologies: null,
    pain_points: null,
    decision_maker: null,
    first_name: null,
    last_name: null,
    external_contact_id: null,
    timezone: null,
    job_title: null,
    email: null,
    phone: null,
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: null,
    notes: null,
    additional_context: null,
    source: GETOBLIC_PROSPECT_SOURCE,
    status: "Saved",
    lifecycle_status: "New",
    ads_content: null,
    opportunity_score: null,
    priority: 0,
    website_intelligence: null,
    raw_json: {
      origin: "getoblic_directory",
      wordpress_listing_id: LISTING_ID,
    },
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

function link(overrides: Partial<GetOblicListingLink> = {}): GetOblicListingLink {
  return {
    id: "link-1",
    organization_id: ORG_A,
    prospect_id: PROSPECT_A,
    wordpress_listing_id: LISTING_ID,
    google_id_snapshot: GOOGLE_ID,
    google_id_is_matchable: true,
    relationship_origin: "linked_existing",
    relationship_status: "linked",
    wordpress_author_id: 42,
    allocated_at: "2026-09-01T00:00:00.000Z",
    last_verified_at: "2026-09-01T00:00:00.000Z",
    last_remote_error: null,
    last_remote_error_at: null,
    kb_push_status: "never",
    kb_last_pushed_executive_version_id: null,
    kb_last_pushed_at: null,
    kb_last_content_sha256: null,
    kb_last_push_error: null,
    kb_last_push_error_at: null,
    created_by_user_id: "user-1",
    created_via_licensee_account_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    released_at: null,
    ...overrides,
  };
}

function convertDeps(
  overrides: Partial<GetOblicConvertDependencies> = {},
): GetOblicConvertDependencies & {
  created: Prospect[];
  claimed: unknown[];
} {
  const created: Prospect[] = [];
  const claimed: unknown[] = [];
  return {
    created,
    claimed,
    getSettings: async () => ({
      configured: true,
      settings: {
        organization_id: ORG_A,
        monthly_allowance: 5,
        wordpress_author_id: 42,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
        updated_by_user_id: null,
      },
    }),
    getAllocationUsage: async () => ({
      configured: true,
      listingCapacity: 5,
      currentlyHeld: 1,
      available: 4,
    }),
    hasAlreadyConsumedListing: async () => false,
    getActiveListingClaim: async () => ({ found: false }),
    getListingById: async (id) => ({
      wordpress_listing_id: id,
      status: "publish",
      title: "Japanese House",
      author_id: 42,
      google_id: GOOGLE_ID,
      google_place_url: "https://maps.google.com/?cid=1",
      knowledge_base: "do-not-copy",
      website: "https://oak.example",
      phone: "+1 214-555-0100",
    }),
    getProspectById: async (id) =>
      created.find((row) => row.id === id) ?? prospect({ id }),
    findProspectByNameAndCity: async () => null,
    findProspectByWebsite: async () => null,
    findOriginProspectByListingId: async () => null,
    createProspect: async (input) => {
      const row = prospect({
        business_name: input.business_name,
        website: input.website ?? null,
        category: input.category ?? null,
        source: input.source ?? GETOBLIC_PROSPECT_SOURCE,
        status: input.status ?? "Saved",
        google_business_url: input.google_business_url ?? null,
        raw_json: input.raw_json ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
      });
      created.push(row);
      return row;
    },
    updateProspect: async (id, _organizationId, input) => {
      const current = created.find((row) => row.id === id) ?? prospect({ id });
      const next = prospect({ ...current, ...input, id });
      const index = created.findIndex((row) => row.id === id);
      if (index >= 0) created[index] = next;
      return next;
    },
    deleteProspect: async () => true,
    claimKnownExistingListing: async (input) => {
      claimed.push(input);
      input.diagnosticTrace?.log({
        stage: "capacity_reserve_start",
        organization_id: input.organizationId,
        wordpress_listing_id: Number(input.wordpressListingId),
        prospect_id: input.prospectId,
      });
      input.diagnosticTrace?.log({
        stage: "capacity_reserve_done",
        organization_id: input.organizationId,
        wordpress_listing_id: Number(input.wordpressListingId),
        prospect_id: input.prospectId,
        relationship_status: "claiming",
      });
      input.diagnosticTrace?.log({
        stage: "link_finalize_start",
        organization_id: input.organizationId,
        wordpress_listing_id: Number(input.wordpressListingId),
        prospect_id: input.prospectId,
        relationship_status: "claiming",
      });
      input.diagnosticTrace?.log({
        stage: "link_finalize_done",
        organization_id: input.organizationId,
        wordpress_listing_id: Number(input.wordpressListingId),
        prospect_id: input.prospectId,
        relationship_status: "linked",
        outcome: "linked",
      });
      return {
        outcome: "linked" as const,
        allocated: true,
        link: link({
          prospect_id: input.prospectId,
          wordpress_listing_id: Number(input.wordpressListingId),
        }),
      };
    },
    ensureProspectGenerationQueued: async (row) => ({
      prospect: { ...row, status: "Queued" },
      queued: true,
    }),
    ...overrides,
  };
}

type CapturedTrace = {
  level: "log" | "error";
  payload: Record<string, unknown>;
  raw: string;
};

async function captureTrace(
  run: () => Promise<void>,
): Promise<CapturedTrace[]> {
  const captured: CapturedTrace[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const take = (level: "log" | "error", args: unknown[]) => {
    if (args[0] !== CO5_GOOGLE_TRACE_PREFIX || typeof args[1] !== "string") {
      return;
    }
    captured.push({
      level,
      payload: JSON.parse(args[1]) as Record<string, unknown>,
      raw: args[1],
    });
  };
  console.log = ((...args: unknown[]) => {
    take("log", args);
  }) as typeof console.log;
  console.error = ((...args: unknown[]) => {
    take("error", args);
  }) as typeof console.error;
  try {
    await run();
    return captured;
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function convertInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_A,
    payload: validPayload(),
    actorUserId: "user-1",
    actorLicenseeAccountId: null,
    ...overrides,
  };
}

async function convertWithTrace(
  diagnosticTrace = createCo5GoogleTrace(),
  port = convertDeps(),
  deps: Parameters<typeof convertGoogleBusinessSelection>[1] = {},
) {
  return convertGoogleBusinessSelection(
    { ...convertInput(), diagnosticTrace },
    {
      getSettings: port.getSettings,
      addListing: async () => ({
        wordpress_listing_id: LISTING_ID,
        google_id: GOOGLE_ID,
      }),
      getListingById: async (id) => port.getListingById(id),
      ...deps,
    },
    port,
  );
}

describe("CO-5 Google conversion trace", () => {
  it("does not alter a successful mocked conversion", async () => {
    const withTrace = createCo5GoogleTrace();
    const portWith = convertDeps();
    const portWithout = convertDeps();
    let traced;
    const logs = await captureTrace(async () => {
      traced = await convertWithTrace(withTrace, portWith);
    });
    const plain = await convertGoogleBusinessSelection(
      convertInput(),
      {
        getSettings: portWithout.getSettings,
        addListing: async () => ({
          wordpress_listing_id: LISTING_ID,
          google_id: GOOGLE_ID,
        }),
        getListingById: async (id) => portWithout.getListingById(id),
      },
      portWithout,
    );

    assert.deepEqual(traced, plain);
    assert.equal(traced?.conversion.outcome, "created");
    assert.equal(traced?.conversion.prospect_id, PROSPECT_A);
    assert.equal(traced?.conversion.generation_queued, false);
    assert.equal(portWith.created.length, 1);
    assert.equal(portWithout.created.length, 1);
    assert.ok(logs.length > 0);
  });

  it("does not alter typed Make / author mismatch failures", async () => {
    const port = convertDeps();
    const trace = createCo5GoogleTrace();
    const logs = await captureTrace(async () => {
      await assert.rejects(
        () =>
          convertGoogleBusinessSelection(
            { ...convertInput(), diagnosticTrace: trace },
            {
              getSettings: port.getSettings,
              addListing: async () => ({
                wordpress_listing_id: LISTING_ID,
                google_id: GOOGLE_ID,
              }),
              getListingById: async (id) => ({
                wordpress_listing_id: id,
                status: "publish",
                title: "Japanese House",
                author_id: 99,
                google_id: GOOGLE_ID,
                google_place_url: null,
                knowledge_base: null,
              }),
            },
            port,
          ),
        (error: unknown) => {
          assert.ok(error instanceof GoogleBusinessMakeError);
          assert.equal(error.code, "GOOGLE_BUSINESS_AUTHOR_MISMATCH");
          assert.equal(error.status, 409);
          assert.equal(
            error.message,
            "This business is already being pursued.",
          );
          return true;
        },
      );
    });
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
    const verifyDone = logs.find(
      (row) => row.payload.stage === "wordpress_verify_done",
    );
    assert.equal(verifyDone?.payload.author_match, false);
    assert.equal(verifyDone?.payload.google_id_match, true);
    assert.equal(trace.currentStage, "wordpress_verify_done");
  });

  it("emits one trace ID and major stages in order for a successful conversion", async () => {
    const trace = createCo5GoogleTrace();
    const logs = await captureTrace(async () => {
      await convertWithTrace(trace);
    });

    assert.ok(logs.length > 0);
    assert.ok(logs.every((row) => row.payload.trace_id === trace.traceId));
    assert.ok(logs.every((row) => row.level === "log"));
    const stages = logs.map((row) => row.payload.stage);
    let cursor = -1;
    for (const expected of SUCCESS_STAGES) {
      const index = stages.indexOf(expected, cursor + 1);
      assert.ok(index > cursor, `missing stage ${expected}`);
      cursor = index;
    }
    for (let i = 1; i < logs.length; i += 1) {
      assert.ok(
        Number(logs[i]?.payload.elapsed_ms) >=
          Number(logs[i - 1]?.payload.elapsed_ms),
      );
    }
    assert.equal(logs.at(-1)?.payload.stage, "google_convert_done");
    assert.equal(logs.at(-1)?.payload.outcome, "created");
    assert.equal(logs.at(-1)?.payload.prospect_id, PROSPECT_A);
    assert.equal(logs.at(-1)?.payload.wordpress_listing_id, LISTING_ID);
  });

  it("logs a caught untyped failure at the current stage", async () => {
    const port = convertDeps({
      createProspect: async () => {
        throw new Error("unexpected persist failure");
      },
    });
    const trace = createCo5GoogleTrace();
    const logs = await captureTrace(async () => {
      await assert.rejects(
        () => convertWithTrace(trace, port),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "unexpected persist failure");
          logCo5GoogleTraceCaughtError(
            trace,
            error,
            502,
            "GOOGLE_BUSINESS_REMOTE_FAILED",
          );
          return true;
        },
      );
    });
    const failure = logs.find((row) => row.level === "error");
    assert.ok(failure);
    assert.equal(failure.payload.trace_id, trace.traceId);
    assert.equal(failure.payload.stage, "prospect_create_start");
    assert.equal(failure.payload.error_name, "Error");
    assert.equal(failure.payload.error_code, "GOOGLE_BUSINESS_REMOTE_FAILED");
    assert.equal(failure.payload.http_status, 502);
    assert.equal(trace.currentStage, "prospect_create_start");
    assert.doesNotMatch(failure.raw, /unexpected persist failure/);
  });

  it("does not log secrets, payloads, names, or Google IDs", async () => {
    const trace = createCo5GoogleTrace();
    const logs = await captureTrace(async () => {
      await convertWithTrace(trace);
      trace.log({
        stage: "security_probe",
        organization_id: ORG_A,
        ...({
          webhook_url: SECRET_WEBHOOK,
          api_key: SECRET_API_KEY,
          cookie: "session=abc",
          authorization: "Bearer secret",
          opening_hours_json: "Mon-Fri 9-5",
          raw_json: { secret: true },
          company_name: "Japanese House",
          google_id: GOOGLE_ID,
          stack: "Error: secret",
        } as Record<string, unknown>),
      } as Parameters<typeof trace.log>[0]);
    });
    const dumped = logs.map((row) => row.raw).join("\n");
    assert.doesNotMatch(dumped, new RegExp(SECRET_WEBHOOK));
    assert.doesNotMatch(dumped, new RegExp(SECRET_API_KEY));
    assert.doesNotMatch(dumped, /session=abc/);
    assert.doesNotMatch(dumped, /Bearer secret/);
    assert.doesNotMatch(dumped, /opening_hours/);
    assert.doesNotMatch(dumped, /raw_json/);
    assert.doesNotMatch(dumped, /Japanese House/);
    assert.doesNotMatch(dumped, new RegExp(GOOGLE_ID));
    assert.doesNotMatch(dumped, /do-not-copy/);
    assert.doesNotMatch(dumped, /knowledge_base/);
    assert.doesNotMatch(dumped, /authorization/i);
    assert.doesNotMatch(dumped, /webhook/i);
    const probe = logs.find((row) => row.payload.stage === "security_probe");
    assert.ok(probe);
    assert.equal(probe.payload.organization_id, ORG_A);
    assert.equal(probe.payload.webhook_url, undefined);
    assert.equal(probe.payload.api_key, undefined);
    assert.equal(probe.payload.google_id, undefined);
    assert.equal(probe.payload.company_name, undefined);
  });
});

describe("CO-5 Google conversion trace contracts", () => {
  it("keeps the route HTTP status, code, and message contracts", () => {
    const route = read("app/api/prospects/from-google-business/route.ts");
    assert.match(route, /createCo5GoogleTrace/);
    assert.match(route, /logCo5GoogleTraceCaughtError/);
    assert.match(route, /stage: "route_received"/);
    assert.match(route, /stage: "route_response_ready"/);
    assert.match(
      route,
      /error: \{ code: "UNAUTHORIZED", message: "Authentication required" \}/,
    );
    assert.match(route, /code: error\.code,\s*message: error\.message,/);
    assert.match(
      route,
      /code: "GOOGLE_BUSINESS_REMOTE_FAILED",\s*message: "Athena couldn’t add this Google business\. Try again\."/,
    );
    assert.match(
      route,
      /code: "GOOGLE_BUSINESS_INVALID_PAYLOAD",\s*message:\s*"Athena couldn’t add this Google business because the selection is incomplete\."/,
    );
    assert.match(route, /convertOutcomeErrorCode\(conversion\.outcome\)/);
    assert.match(route, /convertOutcomeErrorMessage\(conversion\.outcome\)/);
    assert.match(route, /convertOutcomeHttpStatus\(conversion\.outcome\)/);
    assert.doesNotMatch(route, /trace_id/);
    assert.doesNotMatch(route, /diagnosticTrace:/);
    assert.doesNotMatch(route, /ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL/);
    assert.doesNotMatch(route, /OpenRouter|openrouter/i);
  });

  it("places claim reserve and finalize checkpoints on the real claim path", () => {
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(claim, /stage: "capacity_reserve_start"/);
    assert.match(claim, /stage: "capacity_reserve_done"/);
    assert.match(claim, /stage: "link_finalize_start"/);
    assert.match(claim, /stage: "link_finalize_done"/);
    assert.match(claim, /diagnosticTrace/);
  });
});
