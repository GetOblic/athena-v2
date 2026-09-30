/**
 * Diagnostic-only coverage for Make responses rejected as
 * GOOGLE_BUSINESS_INVALID_RESPONSE. No live Make, Google, or WordPress.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GOOGLE_BUSINESS_ADD_ACTION } from "../../lib/googlePlaces/googlePlacesTypes";
import type { GetOblicDirectorySettingsResult } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { convertGoogleBusinessSelection } from "../../services/googleBusiness/googleBusinessConvertService";
import { addGoogleBusinessListing } from "../../services/googleBusiness/googleBusinessMakeService";
import {
  GoogleBusinessMakeError,
  googleBusinessMakeErrorMessage,
  googleBusinessMakeErrorStatus,
  type GoogleBusinessMakeErrorCode,
} from "../../services/googleBusiness/googleBusinessMakeTypes";

const ORG = "11111111-1111-1111-1111-111111111111";
const WEBHOOK = "https://hook.example.test/google-business";
const AUTHOR_ID = 424242;
const REQUEST_COMPANY = "REQUEST_ONLY_COMPANY_SENTINEL";
const REQUEST_GOOGLE_ID = "ChIJrequestPlaceSentinel";
const REQUEST_ADDRESS = "100 Secret Request Ave";
const REQUEST_PHONE = "+1-555-0199-SECRET";
const REQUEST_HOURS = "REQUEST_HOURS_SECRET";
const REQUEST_WEBSITE = "https://request-secret.example";
const RESPONSE_GOOGLE_ID = "ChIJresponseGoogleSecret";
const EVENT = "[GOOGLE_BUSINESS_MAKE_INVALID_RESPONSE]";

const DIAGNOSTIC_FIELDS = [
  "diagnostic_id",
  "rejection_reason",
  "make_http_status",
  "content_type",
  "body_bytes",
  "json_parsed",
  "top_level_type",
  "top_level_keys",
  "listing_id_present",
  "listing_id_type",
  "listing_id_digit_string",
  "listing_id_positive_integer",
  "google_id_present",
  "google_id_type",
  "google_id_blank_after_trim",
  "success_present",
  "success_type",
] as const;

const ALWAYS_FORBIDDEN = [
  WEBHOOK,
  "hook.example",
  REQUEST_COMPANY,
  REQUEST_GOOGLE_ID,
  REQUEST_ADDRESS,
  REQUEST_PHONE,
  REQUEST_HOURS,
  REQUEST_WEBSITE,
  String(AUTHOR_ID),
  ORG,
  "business_add_listing_google",
  "athena_EN",
  "ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL",
  "user-sentinel",
  "licensee-sentinel",
];

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

type ConsoleCall = unknown[];

function requestPayload() {
  return {
    action: GOOGLE_BUSINESS_ADD_ACTION,
    company_name: REQUEST_COMPANY,
    google_id: REQUEST_GOOGLE_ID,
    address: REQUEST_ADDRESS,
    business_phone: REQUEST_PHONE,
    opening_hours: REQUEST_HOURS,
    website: REQUEST_WEBSITE,
  };
}

function settingsResult(
  wordpressAuthorId: number | null,
): GetOblicDirectorySettingsResult {
  return {
    configured: true,
    settings: {
      organization_id: ORG,
      monthly_allowance: 4,
      wordpress_author_id: wordpressAuthorId,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
      updated_by_user_id: null,
    },
  };
}

function installOrganizationLanguage(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => {
        if (table !== "organizations") {
          return { data: null, error: null };
        }
        return { data: { id: ORG, language: "en" }, error: null };
      },
    };
    return builder;
  };
}

function restoreSupabaseAdmin(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

function captureConsoleError(): {
  calls: ConsoleCall[];
  restore: () => void;
} {
  const calls: ConsoleCall[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore() {
      console.error = original;
    },
  };
}

function jsonResponse(
  body: string,
  init?: {
    status?: number;
    contentType?: string | null;
    headers?: Record<string, string>;
  },
): Response {
  const headers = new Headers(init?.headers);
  if (init?.contentType) {
    headers.set("content-type", init.contentType);
  }
  return new Response(body, {
    status: init?.status ?? 200,
    headers,
  });
}

function makeDeps(
  fetchImpl: typeof fetch,
  timeoutMs?: number,
): {
  getSettings: () => Promise<GetOblicDirectorySettingsResult>;
  readWebhookUrl: () => string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
} {
  return {
    getSettings: async () => settingsResult(AUTHOR_ID),
    readWebhookUrl: () => WEBHOOK,
    fetchImpl,
    timeoutMs,
  };
}

function assertNoLeak(value: unknown, extra: string[] = []): void {
  const serialized = JSON.stringify(value);
  for (const secret of [...ALWAYS_FORBIDDEN, ...extra]) {
    assert.equal(serialized.includes(secret), false);
  }
}

function assertKeyList(keys: unknown): string[] {
  assert.ok(Array.isArray(keys));
  const list = keys as string[];
  assert.ok(list.length <= 16);
  assert.deepEqual(list, [...list].sort());
  for (const key of list) {
    assert.equal(typeof key, "string");
    assert.ok(key.length > 0);
    assert.ok(key.length <= 64);
  }
  return list;
}

function asDiagnostic(
  calls: ConsoleCall[],
  reason: string,
): Record<string, unknown> {
  assert.equal(calls.length, 1);
  const args = calls[0] ?? [];
  assert.equal(args.length, 2);
  assert.equal(args[0], EVENT);
  const event = args[1];
  assert.equal(typeof event, "object");
  assert.ok(event);
  assert.equal(Array.isArray(event), false);
  const record = event as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(record).sort(),
    [...DIAGNOSTIC_FIELDS].sort(),
  );
  assert.equal(record.rejection_reason, reason);
  assert.match(
    String(record.diagnostic_id),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assertKeyList(record.top_level_keys);
  return record;
}

function assertUnparsed(
  event: Record<string, unknown>,
  bodyBytes: number | null,
): void {
  assert.equal(event.json_parsed, false);
  assert.equal(event.top_level_type, null);
  assert.deepEqual(event.top_level_keys, []);
  assert.equal(event.body_bytes, bodyBytes);
  assert.equal(event.listing_id_present, false);
  assert.equal(event.listing_id_type, null);
  assert.equal(event.listing_id_digit_string, false);
  assert.equal(event.listing_id_positive_integer, false);
  assert.equal(event.google_id_present, false);
  assert.equal(event.google_id_type, null);
  assert.equal(event.google_id_blank_after_trim, false);
  assert.equal(event.success_present, false);
  assert.equal(event.success_type, null);
}

function assertPublicInvalidResponse(error: GoogleBusinessMakeError): void {
  assert.equal(error.code, "GOOGLE_BUSINESS_INVALID_RESPONSE");
  assert.equal(error.status, 502);
  assert.equal(
    error.message,
    googleBusinessMakeErrorMessage("GOOGLE_BUSINESS_INVALID_RESPONSE"),
  );
  assert.equal(
    error.message,
    googleBusinessMakeErrorMessage("GOOGLE_BUSINESS_REMOTE_FAILED"),
  );
  assert.doesNotMatch(
    error.message,
    /BODY_READ_FAILED|EMPTY_BODY|NON_JSON|NON_OBJECT|INVALID_LISTING_ID|MISSING_GOOGLE_ID/,
  );
}

async function expectInvalid(options: {
  reason: string;
  response: Response | Record<string, unknown>;
  extraSecrets?: string[];
}): Promise<Record<string, unknown>> {
  const capture = captureConsoleError();
  const found: { error: GoogleBusinessMakeError | null } = { error: null };
  try {
    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG, payload: requestPayload() },
          makeDeps((async () => options.response) as typeof fetch),
        ),
      (caught: unknown) => {
        assert.ok(caught instanceof GoogleBusinessMakeError);
        found.error = caught;
        return true;
      },
    );
  } finally {
    capture.restore();
  }
  assert.ok(found.error);
  assertPublicInvalidResponse(found.error);
  const event = asDiagnostic(capture.calls, options.reason);
  assertNoLeak(event, options.extraSecrets);
  return event;
}

async function expectOtherFailure(options: {
  code: GoogleBusinessMakeErrorCode;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  secrets?: string[];
}): Promise<void> {
  const capture = captureConsoleError();
  const found: { error: GoogleBusinessMakeError | null } = { error: null };
  try {
    await assert.rejects(
      () =>
        addGoogleBusinessListing(
          { organizationId: ORG, payload: requestPayload() },
          makeDeps(options.fetchImpl, options.timeoutMs),
        ),
      (caught: unknown) => {
        assert.ok(caught instanceof GoogleBusinessMakeError);
        found.error = caught;
        return true;
      },
    );
  } finally {
    capture.restore();
  }
  assert.ok(found.error);
  assert.equal(found.error.code, options.code);
  assert.equal(found.error.status, googleBusinessMakeErrorStatus(options.code));
  assert.equal(
    found.error.message,
    googleBusinessMakeErrorMessage(options.code),
  );
  assert.equal(capture.calls.length, 0);
  assertNoLeak(capture.calls, options.secrets);
}

async function expectAccepted(
  body: unknown,
): Promise<{ wordpress_listing_id: number; google_id: string }> {
  const capture = captureConsoleError();
  try {
    const result = await addGoogleBusinessListing(
      { organizationId: ORG, payload: requestPayload() },
      makeDeps(
        (async () =>
          jsonResponse(JSON.stringify(body), {
            contentType: "application/json",
          })) as typeof fetch,
      ),
    );
    assert.equal(capture.calls.length, 0);
    assertNoLeak(capture.calls);
    return result;
  } finally {
    capture.restore();
  }
}

describe("Google business Make invalid-response diagnostic", { concurrency: false }, () => {
  beforeEach(() => {
    installOrganizationLanguage();
  });

  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("body read rejects as BODY_READ_FAILED and the same public error", async () => {
    const event = await expectInvalid({
      reason: "BODY_READ_FAILED",
      response: {
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "x-api-key": "RESPONSE_HEADER_SECRET",
          authorization: "Bearer REQUEST_HEADER_SECRET",
        }),
        text: async () => {
          throw new Error("BODY_STREAM_SENTINEL_SHOULD_NOT_LOG");
        },
      },
      extraSecrets: [
        "BODY_STREAM_SENTINEL_SHOULD_NOT_LOG",
        "RESPONSE_HEADER_SECRET",
        "REQUEST_HEADER_SECRET",
        "Bearer",
      ],
    });

    assert.equal(event.make_http_status, 200);
    assert.equal(event.content_type, "application/json");
    assertUnparsed(event, null);
  });

  it("empty body is EMPTY_BODY", async () => {
    const event = await expectInvalid({
      reason: "EMPTY_BODY",
      response: jsonResponse("", {
        status: 201,
        contentType: "text/plain",
      }),
    });

    assert.equal(event.make_http_status, 201);
    assert.equal(event.content_type, "text/plain");
    assertUnparsed(event, 0);
  });

  it("whitespace body is EMPTY_BODY and is not previewed", async () => {
    const body = " \n\t ";
    const event = await expectInvalid({
      reason: "EMPTY_BODY",
      response: jsonResponse(body, {
        contentType: "text/plain; charset=utf-8",
      }),
    });

    assert.equal(event.make_http_status, 200);
    assert.equal(event.content_type, "text/plain; charset=utf-8");
    assertUnparsed(event, Buffer.byteLength(body, "utf8"));
    assert.equal(JSON.stringify(event).includes("\\n"), false);
    assert.equal(JSON.stringify(event).includes("\\t"), false);
  });

  it("malformed JSON is NON_JSON without a body preview", async () => {
    const body = '{"listing_id": BODY_PREVIEW_SECRET';
    const event = await expectInvalid({
      reason: "NON_JSON",
      response: jsonResponse(body, {
        contentType: `text/plain; profile=${WEBHOOK}?token=QUERY_SECRET`,
      }),
      extraSecrets: ["BODY_PREVIEW_SECRET", "QUERY_SECRET", body],
    });

    assert.equal(event.make_http_status, 200);
    assert.equal(event.content_type, null);
    assertUnparsed(event, Buffer.byteLength(body, "utf8"));
  });

  it("a JSON array is NON_OBJECT", async () => {
    const body = JSON.stringify([
      { listing_id: 88018801, google_id: "ARRAY_GOOGLE_SECRET" },
    ]);
    const event = await expectInvalid({
      reason: "NON_OBJECT",
      response: jsonResponse(body, { contentType: "application/json" }),
      extraSecrets: ["ARRAY_GOOGLE_SECRET", "88018801", body],
    });

    assert.equal(event.json_parsed, true);
    assert.equal(event.top_level_type, "array");
    assert.deepEqual(event.top_level_keys, []);
    assert.equal(event.listing_id_present, false);
    assert.equal(event.google_id_present, false);
    assert.equal(event.body_bytes, Buffer.byteLength(body, "utf8"));
  });

  it("a JSON string is NON_OBJECT", async () => {
    const body = JSON.stringify("STRING_GOOGLE_SECRET");
    const event = await expectInvalid({
      reason: "NON_OBJECT",
      response: jsonResponse(body, { contentType: "application/json" }),
      extraSecrets: ["STRING_GOOGLE_SECRET", body],
    });

    assert.equal(event.json_parsed, true);
    assert.equal(event.top_level_type, "string");
    assert.deepEqual(event.top_level_keys, []);
    assert.equal(event.listing_id_present, false);
    assert.equal(event.google_id_present, false);
  });

  it("JSON null is NON_OBJECT", async () => {
    const body = "null";
    const event = await expectInvalid({
      reason: "NON_OBJECT",
      response: jsonResponse(body, { contentType: "application/json" }),
    });

    assert.equal(event.json_parsed, true);
    assert.equal(event.top_level_type, "null");
    assert.deepEqual(event.top_level_keys, []);
    assert.equal(event.body_bytes, Buffer.byteLength(body, "utf8"));
    assert.equal(event.listing_id_present, false);
    assert.equal(event.google_id_present, false);
  });

  it("an object missing listing_id is INVALID_LISTING_ID and logs keys only", async () => {
    const longKey = `000_${"S".repeat(80)}`;
    const bodyObject: Record<string, unknown> = {
      google_id: RESPONSE_GOOGLE_ID,
      success: "SUCCESS_VALUE_SECRET",
      company_name: "RESPONSE_COMPANY_VALUE_SECRET",
      phone: "RESPONSE_PHONE_SECRET",
      address: "RESPONSE_ADDRESS_SECRET",
      hours: "RESPONSE_HOURS_SECRET",
      [longKey]: "LONG_KEY_VALUE_SECRET",
    };
    const generatedKeys = Array.from({ length: 20 }, (_, index) => {
      return `a${String(index + 1).padStart(2, "0")}`;
    });
    for (const key of generatedKeys) {
      bodyObject[key] = `VALUE_SECRET_${key}`;
    }
    const body = JSON.stringify(bodyObject);
    const event = await expectInvalid({
      reason: "INVALID_LISTING_ID",
      response: jsonResponse(body, {
        contentType: "application/json; charset=utf-8",
        headers: { "x-api-key": "RESPONSE_HEADER_SECRET" },
      }),
      extraSecrets: [
        RESPONSE_GOOGLE_ID,
        "SUCCESS_VALUE_SECRET",
        "RESPONSE_COMPANY_VALUE_SECRET",
        "RESPONSE_PHONE_SECRET",
        "RESPONSE_ADDRESS_SECRET",
        "RESPONSE_HOURS_SECRET",
        "LONG_KEY_VALUE_SECRET",
        longKey,
        "S".repeat(40),
        "VALUE_SECRET_",
        "RESPONSE_HEADER_SECRET",
        body,
      ],
    });

    assert.equal(event.make_http_status, 200);
    assert.equal(event.content_type, "application/json; charset=utf-8");
    assert.equal(event.json_parsed, true);
    assert.equal(event.top_level_type, "object");
    assert.equal(event.body_bytes, Buffer.byteLength(body, "utf8"));
    assert.deepEqual(
      event.top_level_keys,
      [...generatedKeys].sort().slice(0, 16),
    );
    assert.equal((event.top_level_keys as string[]).includes("google_id"), false);
    assert.equal((event.top_level_keys as string[]).includes(longKey), false);
    assert.equal(event.listing_id_present, false);
    assert.equal(event.listing_id_type, null);
    assert.equal(event.listing_id_digit_string, false);
    assert.equal(event.listing_id_positive_integer, false);
    assert.equal(event.google_id_present, true);
    assert.equal(event.google_id_type, "string");
    assert.equal(event.google_id_blank_after_trim, false);
    assert.equal(event.success_present, true);
    assert.equal(event.success_type, "string");
  });

  it("a listing_id of the wrong type is INVALID_LISTING_ID", async () => {
    const body = JSON.stringify({
      listing_id: true,
      google_id: RESPONSE_GOOGLE_ID,
      success: 1,
    });
    const event = await expectInvalid({
      reason: "INVALID_LISTING_ID",
      response: jsonResponse(body, { contentType: "application/json" }),
      extraSecrets: [RESPONSE_GOOGLE_ID, body],
    });

    assert.deepEqual(event.top_level_keys, ["google_id", "listing_id", "success"]);
    assert.equal(event.listing_id_present, true);
    assert.equal(event.listing_id_type, "boolean");
    assert.equal(event.listing_id_digit_string, false);
    assert.equal(event.listing_id_positive_integer, false);
    assert.equal(event.google_id_present, true);
    assert.equal(event.google_id_type, "string");
    assert.equal(event.google_id_blank_after_trim, false);
    assert.equal(event.success_present, true);
    assert.equal(event.success_type, "number");
  });

  it("listing_id 0 is INVALID_LISTING_ID", async () => {
    const body = JSON.stringify({
      listing_id: 0,
      google_id: RESPONSE_GOOGLE_ID,
    });
    const event = await expectInvalid({
      reason: "INVALID_LISTING_ID",
      response: jsonResponse(body, { contentType: "application/json" }),
      extraSecrets: [RESPONSE_GOOGLE_ID, body],
    });

    assert.equal(event.listing_id_present, true);
    assert.equal(event.listing_id_type, "number");
    assert.equal(event.listing_id_digit_string, false);
    assert.equal(event.listing_id_positive_integer, false);
    assert.equal(event.google_id_present, true);
  });

  it("a missing google_id is MISSING_GOOGLE_ID", async () => {
    const body = JSON.stringify({ listing_id: 88018801, success: false });
    const event = await expectInvalid({
      reason: "MISSING_GOOGLE_ID",
      response: jsonResponse(body, { contentType: "application/json" }),
      extraSecrets: ["88018801", body],
    });

    assert.deepEqual(event.top_level_keys, ["listing_id", "success"]);
    assert.equal(event.listing_id_present, true);
    assert.equal(event.listing_id_type, "number");
    assert.equal(event.listing_id_digit_string, false);
    assert.equal(event.listing_id_positive_integer, true);
    assert.equal(event.google_id_present, false);
    assert.equal(event.google_id_type, null);
    assert.equal(event.google_id_blank_after_trim, false);
    assert.equal(event.success_present, true);
    assert.equal(event.success_type, "boolean");
  });

  it("a blank google_id is MISSING_GOOGLE_ID", async () => {
    const body = JSON.stringify({
      listing_id: "88018801",
      google_id: " \t ",
    });
    const event = await expectInvalid({
      reason: "MISSING_GOOGLE_ID",
      response: jsonResponse(body, { contentType: "application/json" }),
      extraSecrets: ["88018801", body],
    });

    assert.equal(event.listing_id_present, true);
    assert.equal(event.listing_id_type, "string");
    assert.equal(event.listing_id_digit_string, true);
    assert.equal(event.listing_id_positive_integer, true);
    assert.equal(event.google_id_present, true);
    assert.equal(event.google_id_type, "string");
    assert.equal(event.google_id_blank_after_trim, true);
    assert.equal(JSON.stringify(event).includes("\\t"), false);
  });

  it("accepts a numeric listing_id and google_id without a diagnostic", async () => {
    const result = await expectAccepted({
      listing_id: 8801,
      google_id: REQUEST_GOOGLE_ID,
    });
    assert.equal(result.wordpress_listing_id, 8801);
    assert.equal(result.google_id, REQUEST_GOOGLE_ID);
  });

  it("accepts a digit-string listing_id and google_id without a diagnostic", async () => {
    const exact = await expectAccepted({
      listing_id: "8801",
      google_id: REQUEST_GOOGLE_ID,
    });
    assert.equal(exact.wordpress_listing_id, 8801);
    assert.equal(exact.google_id, REQUEST_GOOGLE_ID);

    const trimmed = await expectAccepted({
      listing_id: " 8801 ",
      google_id: `  ${REQUEST_GOOGLE_ID}  `,
    });
    assert.equal(trimmed.wordpress_listing_id, 8801);
    assert.equal(trimmed.google_id, REQUEST_GOOGLE_ID);
  });

  it("accepts extra fields without a diagnostic or alias override", async () => {
    const result = await expectAccepted({
      listing_id: 8801,
      google_id: REQUEST_GOOGLE_ID,
      success: true,
      company_name: "RESPONSE_COMPANY_VALUE_SECRET",
      phone: "RESPONSE_PHONE_SECRET",
      address: "RESPONSE_ADDRESS_SECRET",
      hours: "RESPONSE_HOURS_SECRET",
      wordpress_listing_id: 999001,
    });
    assert.equal(result.wordpress_listing_id, 8801);
    assert.notEqual(result.wordpress_listing_id, 999001);
    assert.equal(result.google_id, REQUEST_GOOGLE_ID);
  });

  it("keeps a mismatched Google ID out of the invalid-response diagnostic", async () => {
    const accepted = await expectAccepted({
      listing_id: 8801,
      google_id: RESPONSE_GOOGLE_ID,
    });
    assert.equal(accepted.wordpress_listing_id, 8801);
    assert.equal(accepted.google_id, RESPONSE_GOOGLE_ID);

    const capture = captureConsoleError();
    let wordpressReads = 0;
    const found: { error: GoogleBusinessMakeError | null } = { error: null };
    try {
      await assert.rejects(
        () =>
          convertGoogleBusinessSelection(
            {
              organizationId: ORG,
              payload: requestPayload(),
              actorUserId: "user-sentinel",
              actorLicenseeAccountId: "licensee-sentinel",
            },
            {
              getSettings: async () => settingsResult(AUTHOR_ID),
              addListing: (listingInput) =>
                addGoogleBusinessListing(listingInput, {
                  getSettings: async () => settingsResult(AUTHOR_ID),
                  readWebhookUrl: () => WEBHOOK,
                  fetchImpl: (async () =>
                    jsonResponse(
                      JSON.stringify({
                        listing_id: 8801,
                        google_id: RESPONSE_GOOGLE_ID,
                      }),
                      { contentType: "application/json" },
                    )) as typeof fetch,
                }),
              getListingById: async () => {
                wordpressReads += 1;
                throw new Error("wordpress should not be called");
              },
              convertListing: async () => {
                throw new Error("convert should not be called");
              },
            },
          ),
        (caught: unknown) => {
          assert.ok(caught instanceof GoogleBusinessMakeError);
          found.error = caught;
          return true;
        },
      );
    } finally {
      capture.restore();
    }

    assert.ok(found.error);
    assert.equal(found.error.code, "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH");
    assert.equal(found.error.status, 409);
    assert.equal(
      found.error.message,
      googleBusinessMakeErrorMessage("GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH"),
    );
    assert.equal(wordpressReads, 0);
    assert.equal(capture.calls.length, 0);
    assertNoLeak(capture.calls, [RESPONSE_GOOGLE_ID]);
  });

  it("does not use the invalid-response diagnostic for HTTP non-2xx", async () => {
    const body = JSON.stringify({
      listing_id: 8801,
      google_id: "REMOTE_BODY_SECRET",
      error: "REMOTE_STACK_SECRET",
    });
    await expectOtherFailure({
      code: "GOOGLE_BUSINESS_REMOTE_FAILED",
      fetchImpl: (async () =>
        jsonResponse(body, {
          status: 500,
          contentType: "application/json",
          headers: {
            "x-api-key": "RESPONSE_HEADER_SECRET",
            authorization: "Bearer REQUEST_HEADER_SECRET",
          },
        })) as typeof fetch,
      secrets: [
        "REMOTE_BODY_SECRET",
        "REMOTE_STACK_SECRET",
        "RESPONSE_HEADER_SECRET",
        "REQUEST_HEADER_SECRET",
        body,
        EVENT,
      ],
    });
  });

  it("does not use the invalid-response diagnostic for a Make timeout", async () => {
    await expectOtherFailure({
      code: "GOOGLE_BUSINESS_TIMEOUT",
      timeoutMs: 20,
      fetchImpl: ((_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        })) as typeof fetch,
      secrets: ["Aborted", EVENT, WEBHOOK],
    });
  });

  it("does not accept wordpress_listing_id or nested listing aliases", async () => {
    const aliasBody = JSON.stringify({
      wordpress_listing_id: 88018801,
      google_id: "ALIAS_GOOGLE_SECRET",
    });
    const alias = await expectInvalid({
      reason: "INVALID_LISTING_ID",
      response: jsonResponse(aliasBody, { contentType: "application/json" }),
      extraSecrets: ["88018801", "ALIAS_GOOGLE_SECRET", aliasBody],
    });
    assert.deepEqual(alias.top_level_keys, ["google_id", "wordpress_listing_id"]);
    assert.equal(alias.listing_id_present, false);
    assert.equal(alias.google_id_present, true);
    assert.equal(alias.google_id_type, "string");

    const nestedBody = JSON.stringify({
      data: { listing_id: 88018801, google_id: "NESTED_GOOGLE_SECRET" },
      result: { listing_id: "NESTED_LISTING_SECRET" },
    });
    const nested = await expectInvalid({
      reason: "INVALID_LISTING_ID",
      response: jsonResponse(nestedBody, { contentType: "application/json" }),
      extraSecrets: [
        "88018801",
        "NESTED_GOOGLE_SECRET",
        "NESTED_LISTING_SECRET",
        nestedBody,
      ],
    });
    assert.deepEqual(nested.top_level_keys, ["data", "result"]);
    assert.equal(nested.listing_id_present, false);
    assert.equal(nested.google_id_present, false);
  });

  it("keeps diagnostic reasons out of the public Make error contract", () => {
    const types = readFileSync(
      join(
        process.cwd(),
        "services/googleBusiness/googleBusinessMakeTypes.ts",
      ),
      "utf8",
    );
    const service = readFileSync(
      join(
        process.cwd(),
        "services/googleBusiness/googleBusinessMakeService.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(
      types,
      /BODY_READ_FAILED|EMPTY_BODY|NON_JSON|NON_OBJECT|INVALID_LISTING_ID|MISSING_GOOGLE_ID/,
    );
    assert.match(service, /\[GOOGLE_BUSINESS_MAKE_INVALID_RESPONSE\]/);
    assert.doesNotMatch(service, /response\.text\(\)\.catch/);
    assert.doesNotMatch(
      service,
      /console\.(log|info|error|warn)\([^)]*(requestUrl|webhookUrl)/,
    );
  });
});
