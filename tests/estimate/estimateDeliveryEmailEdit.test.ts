/**
 * EST-EMAIL-1D — Licensee Master delivery-email edit.
 * In-memory persistence only. Does not apply SQL or call a model.
 */
import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapAthenaEstimateRow } from "../../services/estimate/athenaEstimateMappers";
import { updateAthenaEstimateDeliveryEmailForMaster } from "../../services/estimate/athenaEstimateOrchestration";
import { toPublicAthenaEstimateDetail } from "../../services/estimate/athenaEstimatePublic";
import {
  persistEditedEstimateDeliveryEmail,
  persistGeneratedEstimateDeliveryEmailIfAbsent,
} from "../../services/estimate/athenaEstimateService";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  type AthenaEstimate,
  type AthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateTypes";
import {
  applyLicenseeEstimateDeliveryEmailEdit,
  buildGeneratedEstimateDeliveryEmailRecord,
  estimateDeliveryEmailEditHttpStatus,
  EstimateDeliveryEmailEditError,
  EstimateDeliveryEmailValidationError,
  parseEstimateDeliveryEmailRecord,
  validateEstimateDeliveryEmail,
  validateLicenseeEstimateDeliveryEmailEdit,
  type EstimateDeliveryEmailRecordV1,
  type EstimateDeliveryEmailV1,
} from "../../services/estimate/estimateDeliveryEmail";
import { LicenseeAccessError } from "../../services/licensee/licenseeIdentity";

const ROOT = process.cwd();
const LICENSEE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_LICENSEE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ESTIMATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MASTER_USER = "master-user-1";
const GENERATED_SUBJECT = "Proposition de refonte pour Northwind";
const GENERATED_BODY = "L'investissement recommandé est de 18,000 USD.";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function samplePackage(): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 18000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 14000, currencyCode: "USD" },
      high: { amount: 24000, currencyCode: "USD" },
    },
    scopeInterpretation:
      "Full marketing site rebuild with CMS migration and analytics setup.",
    pricingRationale:
      "Effort aligns with mid-market delivery and review cycles.",
    keyPriceDrivers: ["CMS migration volume", "Design system complexity"],
    suggestedClientPositioning:
      "Frame as a fixed-scope launch with clear acceptance criteria.",
    risksAndAssumptions: ["Assumes brand assets are available"],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer:
      "Guidance only — not a formal quote or competitive market research.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: null,
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

function generatedEmail(): EstimateDeliveryEmailV1 {
  return {
    schemaVersion: "estimate_delivery_email_v1",
    language: "fr",
    subject: GENERATED_SUBJECT,
    body: GENERATED_BODY,
  };
}

function generatedRecord(): EstimateDeliveryEmailRecordV1 {
  return buildGeneratedEstimateDeliveryEmailRecord(generatedEmail());
}

type MemoryRow = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
  status: string;
  hidden_at: string | null;
  package_json: unknown;
  request_json: unknown;
  prospect_generation_context_json: unknown;
  delivery_email_json: unknown;
};

function memoryRow(
  overrides: Partial<MemoryRow> = {},
): MemoryRow {
  return {
    id: ESTIMATE_ID,
    licensee_account_id: LICENSEE,
    organization_id: ORG,
    status: "Ready",
    hidden_at: null,
    package_json: samplePackage(),
    request_json: { projectNeed: "Rebuild the marketing site" },
    prospect_generation_context_json: { frozen: "prospect-context" },
    delivery_email_json: generatedRecord(),
    ...overrides,
  };
}

function memoryDb(row: MemoryRow, options?: { fail?: boolean }) {
  const payloads: Array<Record<string, unknown>> = [];

  function apply(
    payload: Record<string, unknown>,
    filters: Array<(current: MemoryRow) => boolean>,
  ) {
    payloads.push(payload);
    if (options?.fail) {
      return { data: null, error: { message: "db down" } };
    }
    const keys = Object.keys(payload);
    if (keys.length !== 1 || keys[0] !== "delivery_email_json") {
      return {
        data: null,
        error: { message: `unexpected update keys: ${keys.join(",")}` },
      };
    }
    if (!filters.every((filter) => filter(row))) {
      return { data: null, error: null };
    }
    row.delivery_email_json = payload.delivery_email_json;
    return { data: { id: row.id }, error: null };
  }

  return {
    payloads,
    from(table: string) {
      if (table !== "athena_estimates") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        update(payload: Record<string, unknown>) {
          const filters: Array<(current: MemoryRow) => boolean> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push(
                (current) =>
                  (current as unknown as Record<string, unknown>)[column] ===
                  value,
              );
              return builder;
            },
            is(column: string, value: unknown) {
              filters.push((current) => {
                const actual = (current as unknown as Record<string, unknown>)[
                  column
                ];
                return value == null ? actual == null : actual === value;
              });
              return builder;
            },
            not(column: string, operator: string, value: unknown) {
              filters.push((current) => {
                const actual = (current as unknown as Record<string, unknown>)[
                  column
                ];
                if (operator === "is" && value == null) return actual != null;
                return false;
              });
              return builder;
            },
            select() {
              return {
                maybeSingle() {
                  return Promise.resolve(apply(payload, filters));
                },
              };
            },
            then(
              resolve: (value: {
                error: { message: string } | null;
              }) => void,
              reject?: (reason: unknown) => void,
            ) {
              try {
                resolve({ error: apply(payload, filters).error });
              } catch (error) {
                if (reject) reject(error);
                else throw error;
              }
            },
          };
          return builder;
        },
      };
    },
  };
}

function estimateFromRow(row: MemoryRow): AthenaEstimate {
  const mapped = mapAthenaEstimateRow({
    id: row.id,
    licensee_account_id: row.licensee_account_id,
    organization_id: row.organization_id,
    requested_by: MASTER_USER,
    organization_name_snapshot: "Northwind",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
    request_json: row.request_json,
    status: row.status,
    generation_stage: "completed",
    package_json: row.package_json,
    delivery_email_json: row.delivery_email_json,
    error_code: null,
    error_message: null,
    currency_code: "USD",
    geography_label: "United States",
    currency_resolution: "derived",
    instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
    instruction_revision_id: null,
    instruction_configured: true,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
  });
  mapped.prospect_generation_context_json = null;
  return mapped;
}

function owns(organizationId: string) {
  return {
    licenseeAccountId: LICENSEE,
    organizationId,
    relationshipId: "rel-1",
  };
}

function edit(input: {
  row: MemoryRow;
  body: unknown;
  db?: ReturnType<typeof memoryDb>;
  requireMaster?: (userId: string) => Promise<{ id: string }>;
  getEstimate?: (
    id: string,
    licenseeAccountId: string,
  ) => Promise<AthenaEstimate | null>;
  assertOwns?: (value: {
    masterUserId: string;
    organizationId: string;
  }) => Promise<{ licenseeAccountId: string; organizationId: string }>;
  persistEdit?: (value: {
    estimateId: string;
    licenseeAccountId: string;
    record: EstimateDeliveryEmailRecordV1;
  }) => Promise<boolean>;
  now?: () => string;
}) {
  const db = input.db ?? memoryDb(input.row);
  return {
    db,
    result: updateAthenaEstimateDeliveryEmailForMaster(
      {
        masterUserId: MASTER_USER,
        estimateId: input.row.id,
        body: input.body,
      },
      {
        requireMaster:
          input.requireMaster ?? (async () => ({ id: LICENSEE })),
        getEstimate:
          input.getEstimate ??
          (async (id, licenseeAccountId) => {
            if (id !== input.row.id) return null;
            if (licenseeAccountId !== input.row.licensee_account_id) return null;
            if (input.row.hidden_at) return null;
            return estimateFromRow(input.row);
          }),
        assertOwnsSubAccount:
          input.assertOwns ??
          (async (value) => owns(value.organizationId)),
        persistEdit:
          input.persistEdit ??
          ((value) => persistEditedEstimateDeliveryEmail(value, { db })),
        now: input.now ?? (() => "2026-10-09T20:00:00.000Z"),
      },
    ),
  };
}

const validBody = {
  subject: "  Sujet revu pour le client  ",
  body: "\nCorps revu.\r\nDeuxième ligne.\n",
};

describe("delivery email edit validation", () => {
  it("trims subject and body and keeps Licensee commercial wording", () => {
    const text = validateLicenseeEstimateDeliveryEmailEdit({
      subject: "  As we discussed, Re: the proposal   ",
      body: "\nAthena internal reasoning. The price is 1 USD. Guarantee included.\n",
    });
    assert.deepEqual(text, {
      subject: "As we discussed, Re: the proposal",
      body: "Athena internal reasoning. The price is 1 USD. Guarantee included.",
    });

    assert.throws(
      () =>
        validateEstimateDeliveryEmail({
          raw: {
            schemaVersion: "estimate_delivery_email_v1",
            language: "en",
            subject: "As we discussed, Re: the proposal",
            body: "The recommended investment is 18,000 USD.",
          },
          language: "en",
          recommendedClientPriceAmount: 18000,
          currencyCode: "USD",
        }),
      (error: unknown) => error instanceof EstimateDeliveryEmailValidationError,
    );
  });

  it("accepts the maximum lengths and rejects empty, multiline, html, and oversize text", () => {
    const maxSubject = "S".repeat(120);
    const maxBody = "B".repeat(2000);
    assert.deepEqual(
      validateLicenseeEstimateDeliveryEmailEdit({
        subject: maxSubject,
        body: maxBody,
      }),
      { subject: maxSubject, body: maxBody },
    );

    const cases: unknown[] = [
      null,
      [],
      "hello",
      {},
      { subject: "Hello", body: "Body", note: "extra" },
      { subject: 12, body: "Body" },
      { subject: "Hello", body: null },
      { subject: "   ", body: "Body" },
      { subject: "Hello", body: "  \n  " },
      { subject: "Hello\nthere", body: "Body" },
      { subject: "<b>Hello</b>", body: "Body" },
      { subject: "Hello", body: "See <a href=\"x\">this</a>" },
      { subject: "Hello\u0000", body: "Body" },
      { subject: `${maxSubject}x`, body: "Body" },
      { subject: "Hello", body: `${maxBody}x` },
    ];
    for (const body of cases) {
      assert.throws(
        () => validateLicenseeEstimateDeliveryEmailEdit(body),
        (error: unknown) =>
          error instanceof EstimateDeliveryEmailValidationError &&
          error.code === "INVALID_DELIVERY_EMAIL",
      );
    }
  });

  it("rejects ownership fields and generated-record fields", () => {
    const fields = [
      "licenseeAccountId",
      "licensee_account_id",
      "organizationId",
      "organization_id",
      "estimateId",
      "generated",
      "schemaVersion",
      "language",
      "editedAt",
      "edited_at",
      "package_json",
      "request_json",
      "prospect_generation_context_json",
    ];
    for (const field of fields) {
      assert.throws(
        () =>
          validateLicenseeEstimateDeliveryEmailEdit({
            subject: "Hello",
            body: "Body for the client.",
            [field]: "client-supplied",
          }),
        (error: unknown) =>
          error instanceof EstimateDeliveryEmailValidationError &&
          error.details.includes(
            "Delivery email edit must not include ownership or generated fields.",
          ),
      );
    }
  });
});

describe("delivery email edit authorization and persistence", () => {
  it("requires an active Master and edits only that Licensee's Ready email", async () => {
    let masterCalls = 0;
    const denied = memoryRow();
    await assert.rejects(
      () =>
        edit({
          row: denied,
          body: validBody,
          requireMaster: async (userId) => {
            masterCalls += 1;
            assert.equal(userId, MASTER_USER);
            throw new LicenseeAccessError(
              "Authenticated user is not a Business Licensee Master.",
            );
          },
        }).result,
      (error: unknown) => error instanceof LicenseeAccessError,
    );
    assert.equal(masterCalls, 1);
    assert.deepEqual(denied.delivery_email_json, generatedRecord());

    const row = memoryRow();
    const packageBefore = row.package_json;
    const requestBefore = row.request_json;
    const prospectBefore = row.prospect_generation_context_json;
    let seenOrg = "";
    const { result } = edit({
      row,
      body: validBody,
      assertOwns: async (value) => {
        seenOrg = value.organizationId;
        assert.equal(value.masterUserId, MASTER_USER);
        return owns(value.organizationId);
      },
    });
    const deliveryEmail = await result;
    assert.equal(seenOrg, ORG);
    assert.deepEqual(deliveryEmail, {
      subject: "Sujet revu pour le client",
      body: "Corps revu.\nDeuxième ligne.",
      language: "fr",
      edited: true,
    });
    assert.deepEqual(Object.keys(deliveryEmail).sort(), [
      "body",
      "edited",
      "language",
      "subject",
    ]);

    const stored = row.delivery_email_json as EstimateDeliveryEmailRecordV1;
    assert.equal(stored.schemaVersion, "estimate_delivery_email_v1");
    assert.equal(stored.language, "fr");
    assert.deepEqual(stored.generated, {
      subject: GENERATED_SUBJECT,
      body: GENERATED_BODY,
    });
    assert.equal(stored.edited?.subject, "Sujet revu pour le client");
    assert.equal(stored.editedAt, "2026-10-09T20:00:00.000Z");
    assert.equal(row.package_json, packageBefore);
    assert.equal(row.request_json, requestBefore);
    assert.equal(row.prospect_generation_context_json, prospectBefore);
    assert.equal(row.status, "Ready");

    const detail = toPublicAthenaEstimateDetail(estimateFromRow(row), true);
    assert.deepEqual(detail.deliveryEmail, deliveryEmail);
    assert.equal(detail.package?.schemaVersion, "estimate_v1");
    assert.equal(detail.status, "Ready");
  });

  it("returns NOT_FOUND for another Licensee and does not use client ownership ids", async () => {
    const row = memoryRow({ licensee_account_id: OTHER_LICENSEE });
    const stored = structuredClone(row.delivery_email_json);
    let ownsCalls = 0;
    let persistCalls = 0;
    await assert.rejects(
      () =>
        edit({
          row,
          body: {
            subject: "Hijack",
            body: "Should not save.",
            licenseeAccountId: LICENSEE,
            organizationId: ORG,
          },
          assertOwns: async () => {
            ownsCalls += 1;
            return owns(ORG);
          },
          persistEdit: async () => {
            persistCalls += 1;
            return true;
          },
        }).result,
      (error: unknown) =>
        error instanceof EstimateDeliveryEmailEditError &&
        error.code === "NOT_FOUND",
    );
    assert.equal(ownsCalls, 0);
    assert.equal(persistCalls, 0);
    assert.deepEqual(row.delivery_email_json, stored);
    assert.equal(
      estimateDeliveryEmailEditHttpStatus("NOT_FOUND"),
      404,
    );
  });

  it("denies a Master that no longer owns the Estimate organization", async () => {
    const row = memoryRow();
    const stored = structuredClone(row.delivery_email_json);
    let persistCalls = 0;
    await assert.rejects(
      () =>
        edit({
          row,
          body: { subject: "Hello", body: "A client-ready note." },
          assertOwns: async (value) => {
            assert.equal(value.organizationId, ORG);
            throw new LicenseeAccessError(
              "Master does not own this sub-account relationship.",
            );
          },
          persistEdit: async () => {
            persistCalls += 1;
            return true;
          },
        }).result,
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message ===
          "Master does not own this sub-account relationship.",
    );
    assert.equal(persistCalls, 0);
    assert.deepEqual(row.delivery_email_json, stored);
    assert.equal(
      estimateDeliveryEmailEditHttpStatus("LICENSEE_ACCESS_DENIED"),
      403,
    );
  });

  it("rejects a client organization id before writing", async () => {
    const row = memoryRow();
    const stored = structuredClone(row.delivery_email_json);
    let seenOrg = "";
    let persistCalls = 0;
    await assert.rejects(
      () =>
        edit({
          row,
          body: {
            subject: "Hello",
            body: "A client-ready note.",
            organizationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            generated: { subject: "Forged", body: "Forged body" },
            schemaVersion: "estimate_delivery_email_v1",
            language: "en",
            editedAt: "2000-01-01T00:00:00.000Z",
          },
          assertOwns: async (value) => {
            seenOrg = value.organizationId;
            return owns(value.organizationId);
          },
          persistEdit: async () => {
            persistCalls += 1;
            return true;
          },
        }).result,
      (error: unknown) =>
        error instanceof EstimateDeliveryEmailValidationError &&
        error.code === "INVALID_DELIVERY_EMAIL",
    );
    assert.equal(seenOrg, ORG);
    assert.equal(persistCalls, 0);
    assert.deepEqual(row.delivery_email_json, stored);
    assert.equal(
      estimateDeliveryEmailEditHttpStatus("INVALID_DELIVERY_EMAIL"),
      400,
    );
  });

  it("edits only Ready Estimates and reports a missing email without fabricating one", async () => {
    for (const status of ["Queued", "Processing", "Processing Failed"] as const) {
      const row = memoryRow({ status, delivery_email_json: generatedRecord() });
      const stored = structuredClone(row.delivery_email_json);
      let persistCalls = 0;
      await assert.rejects(
        () =>
          edit({
            row,
            body: { subject: "Hello", body: "A client-ready note." },
            persistEdit: async () => {
              persistCalls += 1;
              return true;
            },
          }).result,
        (error: unknown) =>
          error instanceof EstimateDeliveryEmailEditError &&
          error.code === "ESTIMATE_NOT_READY",
      );
      assert.equal(persistCalls, 0);
      assert.deepEqual(row.delivery_email_json, stored);
      assert.equal(row.status, status);
    }
    assert.equal(
      estimateDeliveryEmailEditHttpStatus("ESTIMATE_NOT_READY"),
      409,
    );

    const missing = memoryRow({ delivery_email_json: null });
    let missingWrites = 0;
    await assert.rejects(
      () =>
        edit({
          row: missing,
          body: { subject: "Hello", body: "A client-ready note." },
          persistEdit: async () => {
            missingWrites += 1;
            return true;
          },
        }).result,
      (error: unknown) =>
        error instanceof EstimateDeliveryEmailEditError &&
        error.code === "EMAIL_NOT_AVAILABLE",
    );
    assert.equal(missingWrites, 0);
    assert.equal(missing.delivery_email_json, null);
    assert.equal(
      estimateDeliveryEmailEditHttpStatus("EMAIL_NOT_AVAILABLE"),
      409,
    );

    const malformed = memoryRow({
      delivery_email_json: { schemaVersion: "estimate_delivery_email_v1" },
    });
    assert.equal(
      estimateFromRow(malformed).delivery_email_json,
      null,
    );
    await assert.rejects(
      () =>
        edit({
          row: malformed,
          body: { subject: "Hello", body: "A client-ready note." },
        }).result,
      (error: unknown) =>
        error instanceof EstimateDeliveryEmailEditError &&
        error.code === "EMAIL_NOT_AVAILABLE",
    );
    assert.deepEqual(malformed.delivery_email_json, {
      schemaVersion: "estimate_delivery_email_v1",
    });
  });

  it("replaces the overlay on a repeated edit and keeps the generated text", async () => {
    const row = memoryRow();
    let tick = 0;
    const first = await edit({
      row,
      body: { subject: "Premier sujet", body: "Premier corps." },
      now: () => `2026-10-09T20:00:0${tick++}.000Z`,
    }).result;
    const second = await edit({
      row,
      body: { subject: "Second sujet", body: "Second corps." },
      now: () => `2026-10-09T20:00:0${tick++}.000Z`,
    }).result;

    assert.equal(first.subject, "Premier sujet");
    assert.equal(first.edited, true);
    assert.deepEqual(second, {
      subject: "Second sujet",
      body: "Second corps.",
      language: "fr",
      edited: true,
    });
    const stored = row.delivery_email_json as EstimateDeliveryEmailRecordV1;
    assert.deepEqual(stored.generated, {
      subject: GENERATED_SUBJECT,
      body: GENERATED_BODY,
    });
    assert.deepEqual(stored.edited, {
      subject: "Second sujet",
      body: "Second corps.",
    });
    assert.equal(stored.editedAt, "2026-10-09T20:00:01.000Z");
    assert.equal(stored.language, "fr");
    assert.deepEqual(row.package_json, samplePackage());
    assert.deepEqual(row.request_json, {
      projectNeed: "Rebuild the marketing site",
    });
    assert.deepEqual(row.prospect_generation_context_json, {
      frozen: "prospect-context",
    });
    assert.equal(row.status, "Ready");
  });

  it("keeps generated text when two edits read the same record", async () => {
    const row = memoryRow();
    const packageBefore = row.package_json;
    const db = memoryDb(row);
    let readers = 0;
    let release: () => void = () => {};
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = (subject: string) =>
      edit({
        row,
        db,
        body: { subject, body: "Corps concurrent." },
        getEstimate: async (id, licenseeAccountId) => {
          assert.equal(id, ESTIMATE_ID);
          assert.equal(licenseeAccountId, LICENSEE);
          const snap = estimateFromRow(row);
          readers += 1;
          if (readers === 2) release();
          else await bothRead;
          return snap;
        },
        now: () => "2026-10-09T20:05:00.000Z",
      }).result;

    const [first, second] = await Promise.all([
      run("Sujet A"),
      run("Sujet B"),
    ]);
    assert.equal(first.edited, true);
    assert.equal(second.edited, true);
    assert.equal(first.language, "fr");
    assert.equal(second.language, "fr");
    const stored = parseEstimateDeliveryEmailRecord(row.delivery_email_json);
    assert.ok(stored);
    assert.deepEqual(stored.generated, {
      subject: GENERATED_SUBJECT,
      body: GENERATED_BODY,
    });
    assert.ok(
      stored.edited?.subject === "Sujet A" ||
        stored.edited?.subject === "Sujet B",
    );
    assert.equal(stored.edited?.body, "Corps concurrent.");
    assert.equal(
      stored.edited?.subject,
      (db.payloads.at(-1)?.delivery_email_json as EstimateDeliveryEmailRecordV1)
        .edited?.subject,
    );
    assert.equal(row.package_json, packageBefore);
    assert.equal(row.status, "Ready");
    assert.deepEqual(row.request_json, {
      projectNeed: "Rebuild the marketing site",
    });
    assert.deepEqual(row.prospect_generation_context_json, {
      frozen: "prospect-context",
    });
  });

  it("reports a failed write and a guard miss without changing other columns", async () => {
    const failed = memoryRow();
    const failedBefore = structuredClone(failed);
    const failedDb = memoryDb(failed, { fail: true });
    await assert.rejects(
      () =>
        edit({
          row: failed,
          db: failedDb,
          body: { subject: "Hello", body: "A client-ready note." },
        }).result,
      (error: unknown) =>
        error instanceof EstimateDeliveryEmailEditError &&
        error.code === "PERSISTENCE_FAILED",
    );
    assert.deepEqual(failed, failedBefore);
    assert.equal(
      estimateDeliveryEmailEditHttpStatus("PERSISTENCE_FAILED"),
      500,
    );
    assert.equal(estimateDeliveryEmailEditHttpStatus("UNAUTHORIZED"), 401);

    const raced = memoryRow();
    const racedEmail = structuredClone(raced.delivery_email_json);
    await assert.rejects(
      () =>
        edit({
          row: raced,
          body: { subject: "Hello", body: "A client-ready note." },
          persistEdit: async (value) => {
            raced.status = "Processing";
            return persistEditedEstimateDeliveryEmail(value, {
              db: memoryDb(raced),
            });
          },
        }).result,
      (error: unknown) =>
        error instanceof EstimateDeliveryEmailEditError &&
        error.code === "ESTIMATE_NOT_READY",
    );
    assert.equal(raced.status, "Processing");
    assert.deepEqual(raced.delivery_email_json, racedEmail);
    assert.deepEqual(raced.package_json, samplePackage());
  });

  it("writes only a visible Ready row that already has an email", async () => {
    const record = applyLicenseeEstimateDeliveryEmailEdit(
      generatedRecord(),
      { subject: "Sujet", body: "Corps." },
      "2026-10-09T20:00:00.000Z",
    );
    assert.deepEqual(record.generated, generatedRecord().generated);
    assert.equal(record.language, "fr");

    const ready = memoryRow();
    const db = memoryDb(ready);
    const saved = await persistEditedEstimateDeliveryEmail(
      {
        estimateId: ready.id,
        licenseeAccountId: LICENSEE,
        record,
      },
      { db },
    );
    assert.equal(saved, true);
    assert.deepEqual(ready.delivery_email_json, record);
    assert.deepEqual(Object.keys(db.payloads[0] ?? {}), ["delivery_email_json"]);

    const blocked: Array<Partial<MemoryRow>> = [
      { licensee_account_id: OTHER_LICENSEE },
      { status: "Processing" },
      { hidden_at: "2026-10-09T20:00:00.000Z" },
      { delivery_email_json: null },
      { id: "99999999-9999-4999-8999-999999999999" },
    ];
    for (const override of blocked) {
      const row = memoryRow(override);
      const before = structuredClone(row);
      const scoped = memoryDb(row);
      const wrote = await persistEditedEstimateDeliveryEmail(
        {
          estimateId: ESTIMATE_ID,
          licenseeAccountId: LICENSEE,
          record,
        },
        { db: scoped },
      );
      assert.equal(wrote, false);
      assert.deepEqual(row, before);
      assert.equal(scoped.payloads.length, 1);
    }

    const edited = memoryRow({ delivery_email_json: record });
    await persistGeneratedEstimateDeliveryEmailIfAbsent(
      {
        estimateId: edited.id,
        licenseeAccountId: LICENSEE,
        deliveryEmail: generatedEmail(),
      },
      { db: memoryDb(edited) },
    );
    assert.deepEqual(edited.delivery_email_json, record);
  });
});

describe("delivery email edit API surface", () => {
  it("exposes PATCH with the Master auth and error contract and no send path", () => {
    const route = read("app/api/licensee/estimate/[id]/delivery-email/route.ts");
    assert.match(route, /export async function PATCH/);
    assert.doesNotMatch(route, /export async function (GET|POST|PUT|DELETE)/);
    assert.match(route, /auth\.getUser/);
    assert.match(route, /Cache-Control": "no-store"/);
    assert.match(route, /updateAthenaEstimateDeliveryEmailForMaster/);
    assert.match(route, /masterUserId: user\.id/);
    assert.match(route, /estimateId: id\.trim\(\)/);
    for (const code of [
      "UNAUTHORIZED",
      "LICENSEE_ACCESS_DENIED",
      "NOT_FOUND",
      "INVALID_DELIVERY_EMAIL",
      "PERSISTENCE_FAILED",
    ]) {
      assert.match(route, new RegExp(code));
    }
    assert.match(route, /error\.code/);
    const emailModule = read("services/estimate/estimateDeliveryEmail.ts");
    for (const code of [
      "ESTIMATE_NOT_READY",
      "EMAIL_NOT_AVAILABLE",
      "INVALID_DELIVERY_EMAIL",
      "PERSISTENCE_FAILED",
    ]) {
      assert.match(emailModule, new RegExp(code));
    }
    assert.doesNotMatch(
      route,
      /mailto|sendEmail|resend|openrouter|workers\/|clientQuoteSeed|renderClientQuotePdf|ghl/i,
    );
    assert.doesNotMatch(route, /licenseeAccountId|organizationId/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const start = orchestration.indexOf(
      "export async function updateAthenaEstimateDeliveryEmailForMaster",
    );
    assert.ok(start > 0);
    const fn = orchestration.slice(start);
    assert.match(fn, /requireLicenseeMasterAccount/);
    assert.match(fn, /getAthenaEstimateByIdForLicensee/);
    assert.match(fn, /assertLicenseeOwnsSubAccount/);
    assert.match(fn, /organizationId: estimate\.organization_id/);
    assert.match(fn, /licenseeAccountId: masterAccount\.id/);
    assert.match(fn, /persistEditedEstimateDeliveryEmail/);
    assert.doesNotMatch(
      fn,
      /runEstimateGenerationPipeline|executeClaimedEstimateGenerationJob|openrouter|clientQuoteSeed|renderClientQuotePdf|enqueueAthenaEstimateGenerationJob|package_json|request_json|prospect_generation_context_json/,
    );

    const master = read("services/licensee/licenseeSubAccounts.ts");
    assert.match(
      master,
      /export async function requireLicenseeMasterAccount[\s\S]*?assertAccountAccessActive/,
    );

    const service = read("services/estimate/athenaEstimateService.ts");
    const persistStart = service.indexOf(
      "export async function persistEditedEstimateDeliveryEmail",
    );
    const persistFn = service.slice(persistStart);
    assert.match(persistFn, /\.eq\("id", input\.estimateId\)/);
    assert.match(
      persistFn,
      /\.eq\("licensee_account_id", input\.licenseeAccountId\)/,
    );
    assert.match(persistFn, /\.eq\("status", "Ready"\)/);
    assert.match(persistFn, /\.is\("hidden_at", null\)/);
    assert.match(persistFn, /\.not\("delivery_email_json", "is", null\)/);
    assert.match(persistFn, /delivery_email_json: input\.record/);
    assert.doesNotMatch(persistFn, /\.is\("delivery_email_json", null\)/);
    assert.match(
      service,
      /persistGeneratedEstimateDeliveryEmailIfAbsent[\s\S]*?\.is\("delivery_email_json", null\)/,
    );

    const quotePage = read("app/licensee/quote/page.tsx");
    assert.match(quotePage, /AthenaQuoteFormEmbed/);
    for (const file of [
      "app/licensee/quote/page.tsx",
      "services/clientQuote/clientQuoteSeed.ts",
      "services/clientQuote/pdf/renderClientQuotePdf.ts",
      "services/clientQuote/pdf/clientQuotePdfFormat.ts",
      "workers/athenaWorker.ts",
      "services/estimate/estimateGenerationPipeline.ts",
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    ]) {
      assert.doesNotMatch(
        read(file),
        /persistEditedEstimateDeliveryEmail|updateAthenaEstimateDeliveryEmailForMaster|\/delivery-email/,
      );
    }
  });
});
