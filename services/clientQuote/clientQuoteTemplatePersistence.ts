/**
 * Service-role persistence for athena_client_quote_templates.
 * licensee_account_id is always the argument from the authenticated Master.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ClientQuoteTemplateDeps } from "@/services/clientQuote/clientQuoteTemplateDeps";
import { clientQuotePersistenceFailed } from "@/services/clientQuote/clientQuoteErrors";
import {
  CLIENT_QUOTE_TEMPLATE_NAME_MAX,
  type AthenaClientQuoteTemplate,
} from "@/services/clientQuote/clientQuoteTemplateTypes";
import {
  CLIENT_QUOTE_FIELD_LIMITS,
  isClientQuoteBillingFrequency,
  type ClientQuoteBillingFrequency,
} from "@/services/clientQuote/clientQuoteTypes";
import { requireLicenseeMasterAccount } from "@/services/licensee/licenseeSubAccounts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw clientQuotePersistenceFailed();
  }
  return value.trim().toLowerCase();
}

function asTimestamp(value: unknown): string {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw clientQuotePersistenceFailed();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw clientQuotePersistenceFailed();
  return date.toISOString();
}

function asOptionalTimestamp(value: unknown): string | null {
  if (value == null) return null;
  return asTimestamp(value);
}

function asStoredText(value: unknown, max: number): string {
  if (typeof value !== "string") throw clientQuotePersistenceFailed();
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || trimmed.length > max || trimmed.includes("\u0000")) {
    throw clientQuotePersistenceFailed();
  }
  return trimmed;
}

function asBoundedInteger(
  value: unknown,
  bounds: { min: number; max: number },
): number {
  const numeric =
    typeof value === "bigint"
      ? Number(value)
      : typeof value === "string" && /^-?\d+$/.test(value.trim())
        ? Number(value.trim())
        : value;
  if (
    typeof numeric !== "number" ||
    !Number.isSafeInteger(numeric) ||
    numeric < bounds.min ||
    numeric > bounds.max
  ) {
    throw clientQuotePersistenceFailed();
  }
  return numeric;
}

export function mapAthenaClientQuoteTemplateRow(
  row: Record<string, unknown>,
): AthenaClientQuoteTemplate {
  const billing = row.billing_frequency;
  if (!isClientQuoteBillingFrequency(billing)) {
    throw clientQuotePersistenceFailed();
  }
  const currency = row.currency_code;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
    throw clientQuotePersistenceFailed();
  }
  const frequency: ClientQuoteBillingFrequency = billing;
  return {
    id: asUuid(row.id),
    licensee_account_id: asUuid(row.licensee_account_id),
    name: asStoredText(row.name, CLIENT_QUOTE_TEMPLATE_NAME_MAX),
    description: asStoredText(
      row.description,
      CLIENT_QUOTE_FIELD_LIMITS.lineDescription,
    ),
    quantity_coefficient: asBoundedInteger(row.quantity_coefficient, {
      min: 1,
      max: CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient,
    }),
    quantity_scale: asBoundedInteger(row.quantity_scale, {
      min: 0,
      max: CLIENT_QUOTE_FIELD_LIMITS.quantityScale,
    }),
    unit_price_minor: asBoundedInteger(row.unit_price_minor, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    }),
    currency_code: currency,
    billing_frequency: frequency,
    deleted_at: asOptionalTimestamp(row.deleted_at),
    created_at: asTimestamp(row.created_at),
    updated_at: asTimestamp(row.updated_at),
  };
}

function toInsertRow(
  template: AthenaClientQuoteTemplate,
): Record<string, unknown> {
  return {
    id: template.id,
    licensee_account_id: template.licensee_account_id,
    name: template.name,
    description: template.description,
    quantity_coefficient: template.quantity_coefficient,
    quantity_scale: template.quantity_scale,
    unit_price_minor: template.unit_price_minor,
    currency_code: template.currency_code,
    billing_frequency: template.billing_frequency,
    deleted_at: template.deleted_at,
    created_at: template.created_at,
    updated_at: template.updated_at,
  };
}

async function loadOwnedTemplate(
  id: string,
  licenseeAccountId: string,
): Promise<AthenaClientQuoteTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_client_quote_templates")
    .select("*")
    .eq("id", id)
    .eq("licensee_account_id", licenseeAccountId)
    .maybeSingle();
  if (error) {
    console.error("[CLIENT_QUOTE_TEMPLATE] get_failed", error);
    throw clientQuotePersistenceFailed("Could not load the template.");
  }
  if (!data) return null;
  return mapAthenaClientQuoteTemplateRow(data as Record<string, unknown>);
}

export function createDefaultClientQuoteTemplateDeps(): ClientQuoteTemplateDeps {
  return {
    async requireMaster(masterUserId) {
      const account = await requireLicenseeMasterAccount(masterUserId);
      return {
        licenseeAccountId: account.id,
        masterUserId,
      };
    },
    async insertTemplate(template) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quote_templates")
        .insert(toInsertRow(template))
        .select("*")
        .single();
      if (error || !data) {
        console.error("[CLIENT_QUOTE_TEMPLATE] insert_failed", error);
        throw clientQuotePersistenceFailed("Could not save the template.");
      }
      return mapAthenaClientQuoteTemplateRow(data as Record<string, unknown>);
    },
    async updateTemplate(template) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quote_templates")
        .update({
          name: template.name,
          description: template.description,
          quantity_coefficient: template.quantity_coefficient,
          quantity_scale: template.quantity_scale,
          unit_price_minor: template.unit_price_minor,
          currency_code: template.currency_code,
          billing_frequency: template.billing_frequency,
          updated_at: template.updated_at,
        })
        .eq("id", template.id)
        .eq("licensee_account_id", template.licensee_account_id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_QUOTE_TEMPLATE] update_failed", error);
        throw clientQuotePersistenceFailed("Could not save the template.");
      }
      if (!data) return null;
      return mapAthenaClientQuoteTemplateRow(data as Record<string, unknown>);
    },
    async getTemplate(id, licenseeAccountId) {
      return loadOwnedTemplate(id, licenseeAccountId);
    },
    async listTemplates(licenseeAccountId) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quote_templates")
        .select("*")
        .eq("licensee_account_id", licenseeAccountId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[CLIENT_QUOTE_TEMPLATE] list_failed", error);
        throw clientQuotePersistenceFailed("Could not list templates.");
      }
      return (data ?? [])
        .map((row) => mapAthenaClientQuoteTemplateRow(row as Record<string, unknown>))
        .filter(
          (template) =>
            template.licensee_account_id === licenseeAccountId &&
            !template.deleted_at,
        );
    },
    async maskTemplate(id, licenseeAccountId, deletedAt) {
      const current = await loadOwnedTemplate(id, licenseeAccountId);
      if (!current) return null;
      if (current.deleted_at) {
        return { template: current, alreadyMasked: true };
      }
      const { data, error } = await supabaseAdmin
        .from("athena_client_quote_templates")
        .update({
          deleted_at: deletedAt,
          updated_at: deletedAt,
        })
        .eq("id", current.id)
        .eq("licensee_account_id", licenseeAccountId)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_QUOTE_TEMPLATE] mask_failed", error);
        throw clientQuotePersistenceFailed(
          "Could not remove the template from the catalog.",
        );
      }
      if (!data) {
        const again = await loadOwnedTemplate(id, licenseeAccountId);
        if (again?.deleted_at) {
          return { template: again, alreadyMasked: true };
        }
        return null;
      }
      return {
        template: mapAthenaClientQuoteTemplateRow(data as Record<string, unknown>),
        alreadyMasked: false,
      };
    },
    now() {
      return new Date().toISOString();
    },
    newId() {
      return randomUUID();
    },
  };
}
