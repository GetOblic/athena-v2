/**
 * CQ-INV-1C — Invoice persistence foundation.
 * Source contract only. Does not apply the migration.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CLIENT_QUOTE_ISSUED_SCHEMA_VERSION } from "../../services/clientQuote/clientQuoteTypes";
import {
  CLIENT_INVOICE_DRAFT_SCHEMA_VERSION,
  CLIENT_INVOICE_FIELD_LIMITS,
  CLIENT_INVOICE_ISSUED_SCHEMA_VERSION,
  CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION,
  CLIENT_INVOICE_STATUSES,
} from "../../services/clientInvoice/clientInvoiceTypes";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261010000003_create_athena_client_invoices.sql";
const ACCEPTED_DOMAIN_FILES = [
  "services/clientInvoice/clientInvoiceDomain.ts",
  "services/clientInvoice/clientInvoiceNumber.ts",
  "services/clientInvoice/clientInvoiceTypes.ts",
  "tests/clientInvoice/clientInvoiceDomain.test.ts",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function statement(sql: string, start: RegExp): string {
  const match = sql.match(start);
  assert.ok(match?.index !== undefined, `missing ${start}`);
  const rest = sql.slice(match.index);
  const end = rest.indexOf(";");
  assert.ok(end >= 0, `unterminated ${start}`);
  return rest.slice(0, end + 1);
}

describe("client invoice persistence migration", () => {
  const sql = read(MIGRATION);
  const table = statement(
    sql,
    /create table if not exists athena_client_invoices\b/i,
  );

  function columnLine(name: string): string {
    const match = table.match(new RegExp(`^\\s*${name}\\b[^\\n]*`, "im"));
    assert.ok(match, `missing column ${name}`);
    return match[0];
  }

  it("uses the unused timestamp and only creates athena_client_invoices", () => {
    const names = readdirSync(join(ROOT, "supabase/migrations")).filter((name) =>
      name.startsWith("20261010000003"),
    );
    assert.deepEqual(names, ["20261010000003_create_athena_client_invoices.sql"]);
    assert.equal((sql.match(/create table/gi) ?? []).length, 1);
    assert.match(sql, /create table if not exists athena_client_invoices/i);
    assert.match(table, /id uuid primary key default gen_random_uuid\(\)/i);
    assert.doesNotMatch(sql, /alter table athena_client_quotes/i);
    assert.doesNotMatch(sql, /alter table athena_estimates/i);
    assert.doesNotMatch(sql, /alter table athena_client_quote_templates/i);
    assert.doesNotMatch(sql, /alter table organizations/i);
    assert.doesNotMatch(sql, /alter table licensee_accounts/i);
    assert.doesNotMatch(
      read("supabase/migrations/20261009000001_create_athena_client_quote_foundation.sql"),
      /athena_client_invoices/,
    );
    assert.doesNotMatch(
      read("supabase/migrations/20261009000002_add_athena_client_quotes_deleted_at.sql"),
      /athena_client_invoices/,
    );
    assert.doesNotMatch(
      read("supabase/migrations/20261010000001_create_athena_client_quote_templates.sql"),
      /athena_client_invoices/,
    );
  });

  it("declares the required columns and draft/issued nullability", () => {
    assert.match(columnLine("licensee_account_id"), /uuid not null/i);
    assert.match(columnLine("organization_id"), /uuid not null/i);
    assert.match(columnLine("requested_by"), /uuid\s*$/i);
    assert.doesNotMatch(columnLine("requested_by"), /not null/i);
    assert.match(columnLine("source_quote_id"), /uuid not null/i);
    assert.match(columnLine("source_quote_snapshot"), /jsonb not null/i);
    assert.match(columnLine("status"), /text not null/i);
    assert.match(columnLine("content_language"), /text not null/i);
    assert.match(columnLine("currency_code"), /text not null/i);
    assert.match(columnLine("draft_json"), /jsonb not null/i);
    assert.match(columnLine("issued_snapshot_json"), /jsonb,?$/i);
    assert.doesNotMatch(columnLine("issued_snapshot_json"), /not null/i);
    assert.match(columnLine("invoice_number"), /text,?$/i);
    assert.doesNotMatch(columnLine("invoice_number"), /not null/i);
    assert.match(columnLine("issued_at"), /timestamptz,?$/i);
    assert.doesNotMatch(columnLine("issued_at"), /not null/i);
    assert.match(columnLine("deleted_at"), /timestamptz,?$/i);
    assert.doesNotMatch(columnLine("deleted_at"), /not null/i);
    assert.match(columnLine("created_at"), /timestamptz not null default now\(\)/i);
    assert.match(columnLine("updated_at"), /timestamptz not null default now\(\)/i);
    assert.doesNotMatch(table, /\bissue_date\b/i);
    assert.doesNotMatch(sql, /\bcreate\s+trigger\b/i);

    assert.deepEqual([...CLIENT_INVOICE_STATUSES], ["draft", "issued"]);
    assert.match(sql, /status in \('draft', 'issued'\)/);
    const languages = sql.match(/content_language in \(([^)]+)\)/i);
    assert.ok(languages);
    assert.deepEqual(
      languages[1].split(",").map((part) => part.trim().replaceAll("'", "")),
      [...ORGANIZATION_LANGUAGES],
    );
    assert.match(sql, /currency_code ~ '\^\[A-Z\]\{3\}\$'/);
    assert.match(
      sql,
      new RegExp(
        `char_length\\(invoice_number\\) between 1 and ${CLIENT_INVOICE_FIELD_LIMITS.invoiceNumber}`,
      ),
    );
    assert.match(sql, /invoice_number = btrim\(invoice_number\)/i);
    assert.match(
      sql,
      /status <> 'draft'[\s\S]*issued_snapshot_json is null[\s\S]*issued_at is null[\s\S]*invoice_number is null/i,
    );
    assert.match(
      sql,
      /status <> 'issued'[\s\S]*issued_snapshot_json is not null[\s\S]*issued_at is not null[\s\S]*invoice_number is not null/i,
    );
    assert.match(
      sql,
      new RegExp(
        `draft_json->>'schemaVersion' = '${CLIENT_INVOICE_DRAFT_SCHEMA_VERSION}'`,
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `issued_snapshot_json->>'schemaVersion' = '${CLIENT_INVOICE_ISSUED_SCHEMA_VERSION}'`,
      ),
    );
    assert.match(sql, /issued_snapshot_json->'issueDate'/);
    assert.match(sql, /issued_snapshot_json->>'invoiceNumber' = invoice_number/);
  });

  it("keeps licensee ownership and one active invoice per source quote", () => {
    assert.equal((sql.match(/\breferences\b/gi) ?? []).length, 4);
    assert.match(sql, /references licensee_accounts\(id\) on delete cascade/i);
    assert.match(sql, /references organizations\(id\) on delete restrict/i);
    assert.match(sql, /references auth\.users\(id\) on delete set null/i);
    assert.match(
      sql,
      /references athena_client_quotes\(id\) on delete restrict/i,
    );
    assert.match(
      sql,
      new RegExp(
        `source_quote_snapshot->>'schemaVersion' = '${CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION}'`,
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `source_quote_snapshot->>'quoteSchemaVersion' = '${CLIENT_QUOTE_ISSUED_SCHEMA_VERSION}'`,
      ),
    );
    assert.match(sql, /source_quote_snapshot->>'quoteId' = source_quote_id::text/);
    assert.match(
      sql,
      /draft_json->'sourceQuote'->>'quoteId' = source_quote_id::text/,
    );
    assert.match(
      sql,
      /issued_snapshot_json->'sourceQuote'->>'quoteId' = source_quote_id::text/,
    );
    assert.match(sql, /source_quote_snapshot->'sourceEstimateId'/);

    const activeCreated = statement(
      sql,
      /create index if not exists athena_client_invoices_licensee_active_created_idx\b/i,
    );
    assert.match(
      activeCreated,
      /on athena_client_invoices \(licensee_account_id, created_at desc\)/i,
    );
    assert.match(activeCreated, /where deleted_at is null/i);

    const activeOrg = statement(
      sql,
      /create index if not exists athena_client_invoices_licensee_org_active_created_idx\b/i,
    );
    assert.match(
      activeOrg,
      /on athena_client_invoices \(licensee_account_id, organization_id, created_at desc\)/i,
    );
    assert.match(activeOrg, /where deleted_at is null/i);

    const activeStatus = statement(
      sql,
      /create index if not exists athena_client_invoices_licensee_active_status_idx\b/i,
    );
    assert.match(
      activeStatus,
      /on athena_client_invoices \(licensee_account_id, status\)/i,
    );
    assert.match(activeStatus, /where deleted_at is null/i);

    const numberIndex = statement(
      sql,
      /create unique index if not exists athena_client_invoices_licensee_invoice_number_uidx\b/i,
    );
    assert.match(
      numberIndex,
      /on athena_client_invoices \(licensee_account_id, invoice_number\)/i,
    );
    assert.match(numberIndex, /where invoice_number is not null/i);
    assert.doesNotMatch(numberIndex, /deleted_at/i);

    const sourceIndex = statement(
      sql,
      /create unique index if not exists athena_client_invoices_active_source_quote_uidx\b/i,
    );
    assert.match(sourceIndex, /on athena_client_invoices \(source_quote_id\)/i);
    assert.match(sourceIndex, /where deleted_at is null/i);
    assert.doesNotMatch(sourceIndex, /status/i);
  });

  it("locks the table to service_role and adds no numbering or payment infrastructure", () => {
    assert.equal((sql.match(/enable row level security/g) ?? []).length, 1);
    assert.match(sql, /revoke all on table athena_client_invoices from public/i);
    assert.match(sql, /revoke all on table athena_client_invoices from anon/i);
    assert.match(
      sql,
      /revoke all on table athena_client_invoices from authenticated/i,
    );
    assert.match(sql, /grant all on table athena_client_invoices to service_role/i);
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(
      sql,
      /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+authenticated\b/i,
    );
    assert.doesNotMatch(
      sql,
      /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+anon\b/i,
    );
    assert.doesNotMatch(sql, /create\s+(?:or\s+replace\s+)?function/i);
    assert.doesNotMatch(sql, /\bdrop\b/i);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\binsert\s+into\b/i);
    assert.doesNotMatch(sql, /\bupdate\s+/i);
    assert.match(sql, /I-YYYY-####/);
    assert.match(sql, /later service gate/);
    assert.doesNotMatch(sql, /create table if not exists athena_\w*(payment|billing|ledger)/i);
  });

  it("matches the accepted invoice domain without rewriting it", () => {
    const types = read("services/clientInvoice/clientInvoiceTypes.ts");
    const domain = read("services/clientInvoice/clientInvoiceDomain.ts");
    const numbers = read("services/clientInvoice/clientInvoiceNumber.ts");
    for (const file of ACCEPTED_DOMAIN_FILES.slice(0, 3)) {
      const source = read(file);
      assert.doesNotMatch(source, /supabase|athena_client_invoices/);
    }
    const domainTest = read(ACCEPTED_DOMAIN_FILES[3]);
    assert.doesNotMatch(domainTest, /athena_client_invoices/);
    assert.match(
      domainTest,
      /doesNotMatch\(\s*domain,\s*\/clientQuoteLifecycle\|clientQuotePdf\|supabase\|athenaEstimate\|pdfkit\//,
    );
    assert.match(types, /This is not a database row/);
    assert.match(types, /issueDate: string;/);
    assert.match(types, /issueDate: string \| null;/);
    assert.match(domain, /issuedSnapshot: null/);
    assert.match(domain, /invoiceNumber: null/);
    assert.match(domain, /issueDate: null/);
    assert.match(domain, /issuedAt: null/);
    assert.match(domain, /issueDate,/);
    assert.match(numbers, /I-YYYY-####/);
    assert.match(numbers, /later persistence concern/);
    assert.match(domain, /Database uniqueness is not enforced here/);
    assert.match(sql, /civil issueDate/);
    assert.doesNotMatch(table, /\bissue_date\b/i);
  });
});
