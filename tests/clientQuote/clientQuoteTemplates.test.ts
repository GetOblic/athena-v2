/**
 * EST-QUOTE-2B.2 — Licensee service-template catalog.
 * In-memory adapters only. No live database writes.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { clientQuoteFailure } from "../../services/clientQuote/clientQuoteHttp";
import { ClientQuoteOperationError } from "../../services/clientQuote/clientQuoteErrors";
import { copyClientQuoteTemplateToLine } from "../../services/clientQuote/clientQuoteTemplateCopy";
import type { ClientQuoteTemplateDeps } from "../../services/clientQuote/clientQuoteTemplateDeps";
import { toPublicClientQuoteTemplate } from "../../services/clientQuote/clientQuoteTemplatePublic";
import {
  createClientQuoteTemplateForMaster,
  listClientQuoteTemplatesForMaster,
  maskClientQuoteTemplateForMaster,
  updateClientQuoteTemplateForMaster,
} from "../../services/clientQuote/clientQuoteTemplateService";
import {
  toClientQuoteServiceTemplate,
  type AthenaClientQuoteTemplate,
  type ClientQuoteServiceTemplate,
} from "../../services/clientQuote/clientQuoteTemplateTypes";
import {
  parseClientQuoteTemplateBody,
  parseClientQuoteTemplatePatch,
} from "../../services/clientQuote/clientQuoteTemplateValidation";
import { normalizeClientQuoteDraft } from "../../services/clientQuote/clientQuoteValidation";
import {
  CLIENT_QUOTE_BILLING_FREQUENCIES,
  CLIENT_QUOTE_FIELD_LIMITS,
  ClientQuoteValidationError,
} from "../../services/clientQuote/clientQuoteTypes";
import { CLIENT_QUOTE_TEMPLATE_NAME_MAX } from "../../services/clientQuote/clientQuoteTemplateTypes";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261010000001_create_athena_client_quote_templates.sql";
const USER_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_B = "88888888-8888-4888-8888-888888888888";
const USER_NONE = "77777777-7777-4777-8777-777777777777";
const LICENSEE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LICENSEE_B = "99999999-9999-4999-8999-999999999999";
const T0 = "2026-10-10T09:00:00.000Z";
const T1 = "2026-10-10T10:00:00.000Z";
const T2 = "2026-10-10T11:00:00.000Z";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function licenseeAccess(message: string): Error {
  const error = new Error(message);
  error.name = "LicenseeAccessError";
  return error;
}

function expectValidation(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ClientQuoteValidationError);
    assert.match(error.message, pattern);
    return true;
  });
}

async function expectCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof ClientQuoteOperationError);
    assert.equal(error.code, code);
    return true;
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Managed hosting",
    description: "Monthly hosting and backups",
    quantity: { coefficient: 25, scale: 1 },
    unitPriceMinor: 4000,
    currencyCode: "usd",
    billingFrequency: "quarterly",
    ...overrides,
  };
}

type Harness = {
  deps: ClientQuoteTemplateDeps;
  templates: Map<string, AthenaClientQuoteTemplate>;
  setNow: (value: string) => void;
  get maskWrites(): number;
  get updateWrites(): number;
};

function createHarness(): Harness {
  const templates = new Map<string, AthenaClientQuoteTemplate>();
  const masters = new Map([
    [USER_A, LICENSEE_A],
    [USER_B, LICENSEE_B],
  ]);
  let now = T0;
  let idSequence = 1;
  let maskWrites = 0;
  let updateWrites = 0;

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  const deps: ClientQuoteTemplateDeps = {
    async requireMaster(masterUserId) {
      const licenseeAccountId = masters.get(masterUserId);
      if (!licenseeAccountId) {
        throw licenseeAccess(
          "Authenticated user is not a Business Licensee Master.",
        );
      }
      return { licenseeAccountId, masterUserId };
    },
    async insertTemplate(template) {
      const saved = clone(template);
      templates.set(saved.id, saved);
      return clone(saved);
    },
    async updateTemplate(template) {
      const current = templates.get(template.id);
      if (
        !current ||
        current.deleted_at ||
        current.licensee_account_id !== template.licensee_account_id
      ) {
        return null;
      }
      updateWrites += 1;
      const saved = clone(template);
      templates.set(saved.id, saved);
      return clone(saved);
    },
    async getTemplate(id, licenseeAccountId) {
      const template = templates.get(id);
      if (!template || template.licensee_account_id !== licenseeAccountId) {
        return null;
      }
      return clone(template);
    },
    async listTemplates(licenseeAccountId) {
      return [...templates.values()]
        .filter(
          (template) =>
            template.licensee_account_id === licenseeAccountId &&
            !template.deleted_at,
        )
        .map((template) => clone(template));
    },
    async maskTemplate(id, licenseeAccountId, deletedAt) {
      const current = templates.get(id);
      if (!current || current.licensee_account_id !== licenseeAccountId) {
        return null;
      }
      if (current.deleted_at) {
        return { template: clone(current), alreadyMasked: true };
      }
      maskWrites += 1;
      const saved = clone({
        ...current,
        deleted_at: deletedAt,
        updated_at: deletedAt,
      });
      templates.set(id, saved);
      return { template: clone(saved), alreadyMasked: false };
    },
    now() {
      return now;
    },
    newId() {
      const suffix = idSequence.toString(16).padStart(12, "0");
      idSequence += 1;
      return `11111111-1111-4111-8111-${suffix}`;
    },
  };

  return {
    deps,
    templates,
    setNow(value: string) {
      now = value;
    },
    get maskWrites() {
      return maskWrites;
    },
    get updateWrites() {
      return updateWrites;
    },
  };
}

function baseDraft(lineItems: unknown[]) {
  return {
    schemaVersion: "client_quote_draft_v1",
    issuer: { legalName: "Alpha Studio Ltd" },
    customer: { name: "Northwind" },
    projectTitle: "Portal rebuild",
    scopeSummary: "Rebuild the client portal.",
    lineItems,
    paymentTerms: { summary: "", scheduleNote: null },
    validity: { validForDays: null, validUntil: null, note: null },
    appendix: { enabled: false, sections: [] },
    discount: { kind: "none" },
    tax: { kind: "none" },
    totals: {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 1,
    },
  };
}

describe("client quote template migration", () => {
  const sql = read(MIGRATION);

  it("creates a service-role-only catalog without quotation or organization links", () => {
    assert.match(sql, /create table if not exists athena_client_quote_templates/i);
    assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/i);
    assert.match(sql, /licensee_account_id uuid not null/i);
    assert.match(sql, /references licensee_accounts\(id\) on delete cascade/i);
    assert.equal((sql.match(/\breferences\b/gi) ?? []).length, 1);
    assert.match(
      sql,
      new RegExp(`char_length\\(name\\) between 1 and ${CLIENT_QUOTE_TEMPLATE_NAME_MAX}`),
    );
    assert.match(
      sql,
      new RegExp(
        `char_length\\(description\\) between 1 and ${CLIENT_QUOTE_FIELD_LIMITS.lineDescription}`,
      ),
    );
    assert.match(sql, /name = btrim\(name\)/i);
    assert.match(sql, /description = btrim\(description\)/i);
    assert.match(
      sql,
      new RegExp(
        `quantity_coefficient between 1 and ${CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient}`,
      ),
    );
    assert.match(
      sql,
      new RegExp(`quantity_scale between 0 and ${CLIENT_QUOTE_FIELD_LIMITS.quantityScale}`),
    );
    assert.match(
      sql,
      new RegExp(`unit_price_minor between 0 and ${Number.MAX_SAFE_INTEGER}`),
    );
    assert.match(sql, /currency_code ~ '\^\[A-Z\]\{3\}\$'/);
    for (const frequency of CLIENT_QUOTE_BILLING_FREQUENCIES) {
      assert.match(sql, new RegExp(`'${frequency}'`));
    }
    assert.match(sql, /deleted_at timestamptz/i);
    assert.match(
      sql,
      /athena_client_quote_templates_licensee_active_created_idx[\s\S]*where deleted_at is null/i,
    );
    assert.equal((sql.match(/enable row level security/g) ?? []).length, 1);
    assert.match(
      sql,
      /revoke all on table athena_client_quote_templates from public/i,
    );
    assert.match(
      sql,
      /revoke all on table athena_client_quote_templates from anon/i,
    );
    assert.match(
      sql,
      /revoke all on table athena_client_quote_templates from authenticated/i,
    );
    assert.match(
      sql,
      /grant all on table athena_client_quote_templates to service_role/i,
    );
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(
      sql,
      /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+authenticated\b/i,
    );
    assert.doesNotMatch(
      sql,
      /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+anon\b/i,
    );
    assert.doesNotMatch(sql, /organization_id/i);
    assert.doesNotMatch(sql, /alter table athena_client_quotes/i);
    assert.doesNotMatch(sql, /references athena_client_quotes/i);
    assert.doesNotMatch(sql, /template_id/i);
    assert.doesNotMatch(sql, /\bdrop\b/i);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\bupdate\s+/i);
    assert.doesNotMatch(
      read("supabase/migrations/20261009000001_create_athena_client_quote_foundation.sql"),
      /athena_client_quote_templates/,
    );
    assert.doesNotMatch(
      read("supabase/migrations/20261009000002_add_athena_client_quotes_deleted_at.sql"),
      /athena_client_quote_templates/,
    );
  });
});

describe("client quote template validation", () => {
  it("trims text, normalizes currency, and accepts the quotation quantity contract", () => {
    const parsed = parseClientQuoteTemplateBody(
      validBody({
        name: "  Managed hosting  ",
        description: "  Monthly hosting and backups  ",
        currencyCode: " usd ",
        unitPriceMinor: Number.MAX_SAFE_INTEGER,
        quantity: {
          coefficient: CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient,
          scale: CLIENT_QUOTE_FIELD_LIMITS.quantityScale,
        },
      }),
    );
    assert.equal(parsed.name, "Managed hosting");
    assert.equal(parsed.description, "Monthly hosting and backups");
    assert.equal(parsed.currencyCode, "USD");
    assert.equal(parsed.unitPriceMinor, Number.MAX_SAFE_INTEGER);
    assert.equal(parsed.billingFrequency, "quarterly");
    assert.equal(
      parsed.quantity.coefficient,
      CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient,
    );
    for (const frequency of CLIENT_QUOTE_BILLING_FREQUENCIES) {
      assert.equal(
        parseClientQuoteTemplateBody(validBody({ billingFrequency: frequency }))
          .billingFrequency,
        frequency,
      );
    }
  });

  it("rejects empty text, overlong text, bad quantity, price, currency, and frequency", () => {
    expectValidation(() => parseClientQuoteTemplateBody(validBody({ name: "  " })), /name/);
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ description: "" })),
      /description/,
    );
    expectValidation(
      () =>
        parseClientQuoteTemplateBody(
          validBody({ name: "a".repeat(CLIENT_QUOTE_TEMPLATE_NAME_MAX + 1) }),
        ),
      /name exceeds/,
    );
    expectValidation(
      () =>
        parseClientQuoteTemplateBody(
          validBody({
            description: "a".repeat(CLIENT_QUOTE_FIELD_LIMITS.lineDescription + 1),
          }),
        ),
      /description exceeds/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ name: "bad\u0000name" })),
      /invalid character/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ quantity: { coefficient: 0, scale: 0 } })),
      /coefficient/,
    );
    expectValidation(
      () =>
        parseClientQuoteTemplateBody(
          validBody({
            quantity: {
              coefficient: CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient + 1,
              scale: 0,
            },
          }),
        ),
      /coefficient/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ quantity: { coefficient: 1, scale: 5 } })),
      /scale/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ unitPriceMinor: -1 })),
      /unitPriceMinor/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ unitPriceMinor: 1.5 })),
      /unitPriceMinor/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ unitPriceMinor: Number.MAX_SAFE_INTEGER + 1 })),
      /unitPriceMinor/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ currencyCode: "US" })),
      /3-letter/,
    );
    expectValidation(
      () => parseClientQuoteTemplateBody(validBody({ billingFrequency: "weekly" })),
      /billingFrequency/,
    );
    expectValidation(() => parseClientQuoteTemplateBody([]), /object/);
    expectValidation(() => parseClientQuoteTemplatePatch({}), /At least one template field/);
  });

  it("rejects client-supplied Licensee ownership fields", () => {
    for (const key of [
      "licenseeAccountId",
      "licensee_account_id",
      "organizationId",
      "organization_id",
    ]) {
      expectValidation(
        () => parseClientQuoteTemplateBody(validBody({ [key]: LICENSEE_B })),
        /ownership/,
      );
      expectValidation(
        () => parseClientQuoteTemplatePatch({ [key]: LICENSEE_B, name: "Care plan" }),
        /ownership/,
      );
    }
  });
});

describe("client quote template service", () => {
  it("requires a Licensee Master and stores only that Master's account", async () => {
    const harness = createHarness();
    await assert.rejects(
      () => listClientQuoteTemplatesForMaster(USER_NONE, harness.deps),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "LicenseeAccessError");
        return true;
      },
    );
    assert.equal(harness.templates.size, 0);
    const denied = clientQuoteFailure(
      licenseeAccess("Authenticated user is not a Business Licensee Master."),
    );
    assert.equal(denied.status, 403);
    assert.equal(denied.code, "LICENSEE_ACCESS_DENIED");

    await expectCode(
      () =>
        createClientQuoteTemplateForMaster({
          masterUserId: USER_A,
          body: validBody({ licenseeAccountId: LICENSEE_B }),
          deps: harness.deps,
        }),
      "INVALID_CLIENT_QUOTE",
    );
    assert.equal(harness.templates.size, 0);

    harness.setNow(T0);
    const created = await createClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      body: validBody({ name: "  Managed hosting  " }),
      deps: harness.deps,
    });
    assert.equal(created.licensee_account_id, LICENSEE_A);
    assert.equal(created.name, "Managed hosting");
    assert.equal(created.currency_code, "USD");
    assert.equal(created.unit_price_minor, 4000);
    assert.equal(created.quantity_coefficient, 25);
    assert.equal(created.quantity_scale, 1);
    assert.equal(created.billing_frequency, "quarterly");
    assert.equal(created.deleted_at, null);
    assert.equal("organization_id" in created, false);
    const http = clientQuoteFailure(
      new ClientQuoteOperationError("INVALID_CLIENT_QUOTE", 400, "name must be a non-empty string."),
    );
    assert.equal(http.status, 400);
  });

  it("lists, updates, and hides only the authenticated Licensee's active templates", async () => {
    const harness = createHarness();
    harness.setNow(T0);
    const older = await createClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      body: validBody({ name: "Older" }),
      deps: harness.deps,
    });
    harness.setNow(T1);
    const newer = await createClientQuoteTemplateForMaster({
      masterUserId: USER_B,
      body: validBody({ name: "Other licensee", currencyCode: "EUR" }),
      deps: harness.deps,
    });
    harness.setNow(T1);
    const latest = await createClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      body: validBody({ name: "Latest" }),
      deps: harness.deps,
    });

    const listed = await listClientQuoteTemplatesForMaster(USER_A, harness.deps);
    assert.deepEqual(
      listed.map((template) => template.id),
      [latest.id, older.id],
    );
    const other = await listClientQuoteTemplatesForMaster(USER_B, harness.deps);
    assert.deepEqual(
      other.map((template) => template.id),
      [newer.id],
    );

    harness.deps.listTemplates = async () => [...harness.templates.values()];
    const stillOwn = await listClientQuoteTemplatesForMaster(USER_A, harness.deps);
    assert.deepEqual(
      stillOwn.map((template) => template.licensee_account_id),
      [LICENSEE_A, LICENSEE_A],
    );

    harness.setNow(T2);
    const updated = await updateClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      templateId: older.id,
      body: { name: "Care plan", unitPriceMinor: 1999, billingFrequency: "monthly" },
      deps: harness.deps,
    });
    assert.equal(updated.id, older.id);
    assert.equal(updated.name, "Care plan");
    assert.equal(updated.unit_price_minor, 1999);
    assert.equal(updated.billing_frequency, "monthly");
    assert.equal(updated.description, older.description);
    assert.equal(updated.licensee_account_id, LICENSEE_A);
    assert.equal(updated.created_at, T0);
    assert.equal(updated.updated_at, T2);
    assert.equal(harness.updateWrites, 1);

    harness.deps.getTemplate = async () => harness.templates.get(older.id) ?? null;
    await expectCode(
      () =>
        updateClientQuoteTemplateForMaster({
          masterUserId: USER_B,
          templateId: older.id,
          body: { name: "Stolen" },
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal(harness.templates.get(older.id)?.name, "Care plan");
    assert.equal(harness.updateWrites, 1);
    const cross = await updateClientQuoteTemplateForMaster({
      masterUserId: USER_B,
      templateId: older.id,
      body: { name: "Stolen" },
      deps: harness.deps,
    }).catch((error: unknown) => error);
    assert.ok(cross instanceof ClientQuoteOperationError);
    const crossHttp = clientQuoteFailure(cross);
    assert.equal(crossHttp.status, 404);
    assert.equal(crossHttp.code, "NOT_FOUND");
    assert.doesNotMatch(crossHttp.message, new RegExp(LICENSEE_A));

    await expectCode(
      () =>
        maskClientQuoteTemplateForMaster({
          masterUserId: USER_B,
          templateId: older.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal(harness.templates.get(older.id)?.deleted_at, null);
    assert.equal(harness.maskWrites, 0);

    const masked = await maskClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      templateId: older.id,
      deps: harness.deps,
    });
    assert.equal(masked.alreadyMasked, false);
    assert.equal(harness.templates.get(older.id)?.deleted_at, T2);
    harness.setNow("2026-10-10T12:00:00.000Z");
    const repeated = await maskClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      templateId: older.id,
      deps: harness.deps,
    });
    assert.equal(repeated.alreadyMasked, true);
    assert.equal(harness.templates.get(older.id)?.deleted_at, T2);
    assert.equal(harness.templates.get(older.id)?.updated_at, T2);
    assert.equal(harness.maskWrites, 1);

    const afterMask = await listClientQuoteTemplatesForMaster(USER_A, harness.deps);
    assert.deepEqual(
      afterMask.map((template) => template.id),
      [latest.id],
    );
    await expectCode(
      () =>
        updateClientQuoteTemplateForMaster({
          masterUserId: USER_A,
          templateId: older.id,
          body: { name: "Revived" },
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal(harness.templates.get(older.id)?.name, "Care plan");
  });

  it("keeps authorization and masking in the service-role adapter", () => {
    const persistence = read(
      "services/clientQuote/clientQuoteTemplatePersistence.ts",
    );
    const service = read("services/clientQuote/clientQuoteTemplateService.ts");
    assert.match(persistence, /requireLicenseeMasterAccount/);
    assert.match(persistence, /supabaseAdmin/);
    assert.ok(
      (persistence.match(/\.eq\("licensee_account_id"/g) ?? []).length >= 4,
    );
    assert.match(persistence, /\.is\("deleted_at", null\)/);
    assert.doesNotMatch(persistence, /\.delete\(/);
    assert.doesNotMatch(persistence, /organization_id/);
    assert.doesNotMatch(persistence, /athena_client_quotes/);
    assert.match(service, /requireMaster/);
    assert.doesNotMatch(service, /supabase|openrouter|workers\//i);
    const collection = read("app/api/licensee/client-quote-templates/route.ts");
    const item = read("app/api/licensee/client-quote-templates/[id]/route.ts");
    for (const route of [collection, item]) {
      assert.match(route, /Cache-Control": "no-store"/);
      assert.match(route, /clientQuoteFailure/);
      assert.match(route, /auth\.getUser/);
      assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE|licensee_account_id|service_role/);
      assert.doesNotMatch(route, /openrouter|workers\//i);
    }
    assert.match(collection, /toPublicClientQuoteTemplate/);
    assert.match(item, /alreadyMasked: masked\.alreadyMasked/);
    assert.doesNotMatch(item, /template: masked/);
  });
});

describe("client quote template copy-on-insert", () => {
  it("copies minor units and frequency onto an independent line", async () => {
    const harness = createHarness();
    harness.setNow(T0);
    const created = await createClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      body: validBody({
        unitPriceMinor: 1999,
        billingFrequency: "monthly",
        quantity: { coefficient: 25, scale: 1 },
      }),
      deps: harness.deps,
    });
    const template = toClientQuoteServiceTemplate(created);
    const before = structuredClone(template);
    const stored = structuredClone(harness.templates.get(created.id));
    const dirty = {
      ...template,
      templateId: template.id,
    } as ClientQuoteServiceTemplate;
    const line = copyClientQuoteTemplateToLine({
      template: dirty,
      currencyCode: "USD",
      lineId: " hosting-1 ",
    });
    assert.equal(line.id, "hosting-1");
    assert.notEqual(line.id, template.id);
    assert.equal(line.description, "Monthly hosting and backups");
    assert.deepEqual(line.quantity, { coefficient: 25, scale: 1 });
    assert.notEqual(line.quantity, template.quantity);
    assert.equal(line.unitPriceMinor, 1999);
    assert.equal(line.billingFrequency, "monthly");
    assert.deepEqual(Object.keys(line).sort(), [
      "billingFrequency",
      "description",
      "id",
      "quantity",
      "unitPriceMinor",
    ]);
    assert.equal("templateId" in line, false);

    const draft = normalizeClientQuoteDraft(baseDraft([structuredClone(line)]), "USD");
    assert.equal(draft.lineItems[0]?.unitPriceMinor, 1999);
    assert.equal(draft.lineItems[0]?.billingFrequency, "monthly");
    assert.equal(draft.lineItems[0]?.quantity.coefficient, 25);
    assert.equal(draft.lineItems[0]?.lineTotalMinor, 4998);
    assert.equal(draft.frequencyTotals?.[0]?.billingFrequency, "monthly");
    assert.equal(JSON.stringify(draft).includes(template.id), false);
    assert.equal(JSON.stringify(draft).includes("templateId"), false);

    line.description = "Edited after insert";
    line.quantity.coefficient = 9;
    line.unitPriceMinor = 1;
    assert.deepEqual(template, before);
    assert.deepEqual(harness.templates.get(created.id), stored);
    assert.equal(template.quantity.coefficient, 25);
    assert.equal(template.unitPriceMinor, 1999);

    const exact = copyClientQuoteTemplateToLine({
      template: {
        ...template,
        quantity: { coefficient: 25, scale: 1 },
        unitPriceMinor: 4000,
        billingFrequency: "quarterly",
        currencyCode: "USD",
      },
      currencyCode: "usd",
      lineId: "line-q",
    });
    const priced = normalizeClientQuoteDraft(
      baseDraft([{ ...exact, lineTotalMinor: 1 }]),
      "USD",
    );
    assert.equal(priced.lineItems[0]?.unitPriceMinor, 4000);
    assert.equal(priced.lineItems[0]?.lineTotalMinor, 10_000);
    assert.equal(priced.lineItems[0]?.billingFrequency, "quarterly");
    assert.equal("templateId" in priced.lineItems[0], false);

    const maxMinor = copyClientQuoteTemplateToLine({
      template: {
        ...template,
        currencyCode: "JPY",
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: Number.MAX_SAFE_INTEGER,
        billingFrequency: "one_time",
      },
      currencyCode: "JPY",
      lineId: "line-max",
    });
    assert.equal(maxMinor.unitPriceMinor, Number.MAX_SAFE_INTEGER);
    expectValidation(
      () =>
        copyClientQuoteTemplateToLine({
          template,
          currencyCode: "EUR",
          lineId: "line-fx",
        }),
      /does not match/,
    );
    expectValidation(
      () =>
        copyClientQuoteTemplateToLine({
          template: { ...template, deletedAt: T2 },
          currencyCode: "USD",
          lineId: "line-masked",
        }),
      /not active/,
    );
    assert.deepEqual(template, before);
  });

  it("still rejects a 51st quotation line", () => {
    assert.equal(CLIENT_QUOTE_FIELD_LIMITS.lineItems, 50);
    const template: ClientQuoteServiceTemplate = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      licenseeAccountId: LICENSEE_A,
      name: "Managed hosting",
      description: "Monthly hosting and backups",
      quantity: { coefficient: 1, scale: 0 },
      unitPriceMinor: 100,
      currencyCode: "USD",
      billingFrequency: "annually",
      deletedAt: null,
      createdAt: T0,
      updatedAt: T0,
    };
    const lines = Array.from({ length: 50 }, (_, index) =>
      copyClientQuoteTemplateToLine({
        template,
        currencyCode: "USD",
        lineId: `line-${index}`,
      }),
    );
    const draft = normalizeClientQuoteDraft(baseDraft(lines), "USD");
    assert.equal(draft.lineItems.length, 50);
    assert.equal(draft.lineItems[0]?.billingFrequency, "annually");
    assert.equal(JSON.stringify(draft).includes(template.id), false);
    expectValidation(
      () =>
        normalizeClientQuoteDraft(
          baseDraft([
            ...lines,
            copyClientQuoteTemplateToLine({
              template,
              currencyCode: "USD",
              lineId: "line-50",
            }),
          ]),
          "USD",
        ),
      /Too many line items/,
    );
  });

  it("does not price, convert, or persist from the helper", () => {
    const source = read("services/clientQuote/clientQuoteTemplateCopy.ts");
    assert.doesNotMatch(source, /calculateClientQuote|majorAmountToMinorUnits/);
    assert.doesNotMatch(source, /supabase|workers\/|openrouter/i);
    assert.doesNotMatch(source, /templateId\s*:/);
    assert.doesNotMatch(
      read("services/clientQuote/clientQuoteTypes.ts"),
      /templateId|template_id/,
    );
  });
});

describe("client quote template boundaries", () => {
  const newFiles = [
    MIGRATION,
    "services/clientQuote/clientQuoteTemplateTypes.ts",
    "services/clientQuote/clientQuoteTemplateValidation.ts",
    "services/clientQuote/clientQuoteTemplateCopy.ts",
    "services/clientQuote/clientQuoteTemplateDeps.ts",
    "services/clientQuote/clientQuoteTemplateService.ts",
    "services/clientQuote/clientQuoteTemplatePersistence.ts",
    "services/clientQuote/clientQuoteTemplatePublic.ts",
    "app/api/licensee/client-quote-templates/route.ts",
    "app/api/licensee/client-quote-templates/[id]/route.ts",
  ];

  it("keeps the GetOblic fulfillment quote unchanged and does not call a model or worker", () => {
    const quotePage = read("app/licensee/quote/page.tsx");
    assert.match(quotePage, /AthenaQuoteFormEmbed/);
    assert.doesNotMatch(quotePage, /client-quote-templates|clientQuoteTemplate/);
    const editorSource = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
    );
    assert.match(editorSource, /\/api\/licensee\/client-quote-templates/);
    assert.doesNotMatch(editorSource, /client-quote-templates\/\$\{/);
    assert.doesNotMatch(
      editorSource,
      /client-quote-templates[\s\S]{0,180}method:\s*"(POST|PATCH|DELETE)"/,
    );
    assert.doesNotMatch(
      read("services/clientQuote/pdf/renderClientQuotePdf.ts"),
      /client-quote-templates|clientQuoteTemplate/,
    );
    const embed = read("components/quote/AthenaQuoteFormEmbed.tsx");
    assert.match(embed, /ghl-athena-quote-form-embed/);
    assert.match(embed, /go\.getoblic\.com\/widget\/form\//);
    assert.doesNotMatch(
      embed,
      /client-quote-templates|clientQuote|frequencyTotals|billingFrequency/,
    );
    for (const file of newFiles) {
      assert.doesNotMatch(
        read(file),
        /openrouter|openai|anthropic|workers\/|gohighlevel/i,
      );
    }
    const protectedDiff = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "--",
        "app/licensee/quote",
        "components/quote/AthenaQuoteFormEmbed.tsx",
        "workers",
        "app/licensee/client-quotes",
        "app/api/licensee/client-quotes/route.ts",
        "app/api/licensee/client-quotes/[id]/issue",
        "app/api/licensee/client-quotes/[id]/revise",
        "app/api/licensee/client-quotes/[id]/pdf",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(protectedDiff.trim(), "");
    const preserved = execFileSync(
      "git",
      [
        "diff",
        "--",
        "services/clientQuote/clientQuoteTypes.ts",
        "services/clientQuote/clientQuoteMoney.ts",
        "services/clientQuote/clientQuoteValidation.ts",
        "services/clientQuote/clientQuoteLifecycle.ts",
        "services/clientQuote/clientQuoteSeed.ts",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.doesNotMatch(preserved, /athena_client_quote_templates|clientQuoteTemplate/);
  });

  it("omits Licensee ownership from the public template", async () => {
    const harness = createHarness();
    const created = await createClientQuoteTemplateForMaster({
      masterUserId: USER_A,
      body: validBody(),
      deps: harness.deps,
    });
    const pub = toPublicClientQuoteTemplate(created);
    assert.deepEqual(Object.keys(pub).sort(), [
      "billingFrequency",
      "createdAt",
      "currencyCode",
      "description",
      "id",
      "name",
      "quantity",
      "unitPriceMinor",
      "updatedAt",
    ]);
    assert.equal(JSON.stringify(pub).includes(LICENSEE_A), false);
    assert.equal("deletedAt" in pub, false);
    assert.equal("licenseeAccountId" in pub, false);
  });
});
