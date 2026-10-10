/**
 * Service-role persistence for athena_client_invoices.
 * licensee_account_id is always the argument from the authenticated Master.
 * Quotation rows are read only. This module does not apply migrations.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ClientQuoteOperationError } from "@/services/clientQuote/clientQuoteErrors";
import { mapAthenaClientQuoteRow } from "@/services/clientQuote/clientQuotePersistence";
import type { ClientInvoiceDeps } from "@/services/clientInvoice/clientInvoiceDeps";
import { clientInvoicePersistenceFailed } from "@/services/clientInvoice/clientInvoiceErrors";
import {
  mapClientInvoiceRow,
  maskStoredClientInvoice,
  toClientInvoiceDraftUpdate,
  toClientInvoiceInsertRow,
  toClientInvoiceIssueUpdate,
} from "@/services/clientInvoice/clientInvoiceRow";
import { requireLicenseeMasterAccount } from "@/services/licensee/licenseeSubAccounts";

type PostgresError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null;

function uniqueViolationTarget(
  error: PostgresError,
): "source_quote" | "invoice_number" | "other" | null {
  if (!error) return null;
  const unique =
    error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "");
  if (!unique) return null;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (/source_quote/i.test(text)) return "source_quote";
  if (/invoice_number/i.test(text)) return "invoice_number";
  return "other";
}

async function loadOwnedQuote(id: string, licenseeAccountId: string) {
  const { data, error } = await supabaseAdmin
    .from("athena_client_quotes")
    .select("*")
    .eq("id", id)
    .eq("licensee_account_id", licenseeAccountId)
    .maybeSingle();
  if (error) {
    console.error("[CLIENT_INVOICE] quote_read_failed", error);
    throw clientInvoicePersistenceFailed("Could not load the quotation.");
  }
  if (!data) return null;
  try {
    return mapAthenaClientQuoteRow(data as Record<string, unknown>);
  } catch (caught) {
    if (caught instanceof ClientQuoteOperationError) {
      throw clientInvoicePersistenceFailed("Could not load the quotation.");
    }
    throw caught;
  }
}

async function loadOwnedInvoice(id: string, licenseeAccountId: string) {
  const { data, error } = await supabaseAdmin
    .from("athena_client_invoices")
    .select("*")
    .eq("id", id)
    .eq("licensee_account_id", licenseeAccountId)
    .maybeSingle();
  if (error) {
    console.error("[CLIENT_INVOICE] get_failed", error);
    throw clientInvoicePersistenceFailed("Could not load the invoice.");
  }
  if (!data) return null;
  return mapClientInvoiceRow(data as Record<string, unknown>);
}

export function createDefaultClientInvoiceDeps(): ClientInvoiceDeps {
  return {
    async requireMaster(masterUserId) {
      const account = await requireLicenseeMasterAccount(masterUserId);
      return {
        licenseeAccountId: account.id,
        masterUserId,
      };
    },
    async getQuote(id, licenseeAccountId) {
      return loadOwnedQuote(id, licenseeAccountId);
    },
    async insertInvoice(invoice, requestedBy) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_invoices")
        .insert(toClientInvoiceInsertRow(invoice, requestedBy))
        .select("*")
        .single();
      if (uniqueViolationTarget(error)) {
        return { ok: false, reason: "source_occupied" };
      }
      if (error || !data) {
        console.error("[CLIENT_INVOICE] insert_failed", error);
        throw clientInvoicePersistenceFailed("Could not create the invoice.");
      }
      return {
        ok: true,
        invoice: mapClientInvoiceRow(data as Record<string, unknown>),
      };
    },
    async updateDraftInvoice(invoice) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_invoices")
        .update(toClientInvoiceDraftUpdate(invoice))
        .eq("id", invoice.id)
        .eq("licensee_account_id", invoice.licenseeAccountId)
        .eq("status", "draft")
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_INVOICE] update_failed", error);
        throw clientInvoicePersistenceFailed("Could not save the invoice.");
      }
      if (!data) return null;
      return mapClientInvoiceRow(data as Record<string, unknown>);
    },
    async issueInvoice(invoice) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_invoices")
        .update(toClientInvoiceIssueUpdate(invoice))
        .eq("id", invoice.id)
        .eq("licensee_account_id", invoice.licenseeAccountId)
        .eq("status", "draft")
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (uniqueViolationTarget(error)) {
        return { ok: false, reason: "conflict" };
      }
      if (error) {
        console.error("[CLIENT_INVOICE] issue_failed", error);
        throw clientInvoicePersistenceFailed("Could not issue the invoice.");
      }
      if (!data) return { ok: false, reason: "not_draft" };
      return {
        ok: true,
        invoice: mapClientInvoiceRow(data as Record<string, unknown>),
      };
    },
    async getInvoice(id, licenseeAccountId) {
      return loadOwnedInvoice(id, licenseeAccountId);
    },
    async listInvoices(licenseeAccountId) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_invoices")
        .select("*")
        .eq("licensee_account_id", licenseeAccountId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[CLIENT_INVOICE] list_failed", error);
        throw clientInvoicePersistenceFailed("Could not list invoices.");
      }
      return (data ?? [])
        .map((row) => mapClientInvoiceRow(row as Record<string, unknown>))
        .filter((invoice) => !invoice.deletedAt);
    },
    async findActiveInvoiceBySourceQuote(sourceQuoteId, licenseeAccountId) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_invoices")
        .select("*")
        .eq("source_quote_id", sourceQuoteId)
        .eq("licensee_account_id", licenseeAccountId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_INVOICE] source_lookup_failed", error);
        throw clientInvoicePersistenceFailed("Could not load the invoice.");
      }
      if (!data) return null;
      const invoice = mapClientInvoiceRow(data as Record<string, unknown>);
      if (invoice.deletedAt || invoice.licenseeAccountId !== licenseeAccountId) {
        return null;
      }
      return invoice;
    },
    async maskInvoice(id, licenseeAccountId, deletedAt) {
      const current = await loadOwnedInvoice(id, licenseeAccountId);
      if (!current) return null;
      const decision = maskStoredClientInvoice(current, deletedAt);
      if (decision.alreadyMasked) {
        return { invoice: decision.invoice, alreadyMasked: true };
      }
      const { data, error } = await supabaseAdmin
        .from("athena_client_invoices")
        .update({
          deleted_at: decision.invoice.deletedAt,
          updated_at: decision.invoice.updatedAt,
        })
        .eq("id", current.id)
        .eq("licensee_account_id", licenseeAccountId)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_INVOICE] mask_failed", error);
        throw clientInvoicePersistenceFailed(
          "Could not remove the invoice from the library.",
        );
      }
      if (!data) {
        const again = await loadOwnedInvoice(id, licenseeAccountId);
        if (again?.deletedAt) {
          return { invoice: again, alreadyMasked: true };
        }
        return null;
      }
      return {
        invoice: mapClientInvoiceRow(data as Record<string, unknown>),
        alreadyMasked: false,
      };
    },
    async listInvoiceNumbers(licenseeAccountId) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_invoices")
        .select("invoice_number")
        .eq("licensee_account_id", licenseeAccountId)
        .not("invoice_number", "is", null);
      if (error) {
        console.error("[CLIENT_INVOICE] numbers_failed", error);
        throw clientInvoicePersistenceFailed("Could not assign an invoice number.");
      }
      return (data ?? [])
        .map((row) => row.invoice_number)
        .filter((value): value is string => typeof value === "string");
    },
    now() {
      return new Date().toISOString();
    },
    newId() {
      return randomUUID();
    },
  };
}
