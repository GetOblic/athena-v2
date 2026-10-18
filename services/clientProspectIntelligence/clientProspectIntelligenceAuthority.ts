/**
 * Fail-closed authority for reading a Licensee Own Company Prospect from a
 * converted Client organization.
 *
 * The only bridge is one active licensee_prospect_client_conversions row for
 * the authenticated client organization. Browser-supplied Prospect, source
 * organization, and Licensee ids are not accepted.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getActiveConversionForClientOrganization,
  type ActiveLicenseeProspectClientConversionRef,
} from "@/services/licensee/licenseeProspectClientConversionReads";

export const CLIENT_PROSPECT_INTELLIGENCE_CONVERSION_SELECT =
  "prospect_id, source_organization_id, client_organization_id, licensee_account_id, licensee_sub_account_id, status";

export type ClientProspectIntelligenceDenial =
  | "missing_client_organization"
  | "no_active_conversion"
  | "ambiguous_conversion"
  | "incomplete_conversion"
  | "client_mismatch"
  | "source_mismatch"
  | "lookup_failed";

export type ClientProspectIntelligenceAuthority =
  | {
      ok: true;
      conversion: ActiveLicenseeProspectClientConversionRef;
    }
  | {
      ok: false;
      reason: ClientProspectIntelligenceDenial;
    };

export type ClientProspectConversionAuthorityRow = {
  prospect_id?: unknown;
  source_organization_id?: unknown;
  client_organization_id?: unknown;
  licensee_account_id?: unknown;
  licensee_sub_account_id?: unknown;
  status?: unknown;
};

function readId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function authorizeClientProspectConversionRows(input: {
  clientOrganizationId: string;
  rows: readonly ClientProspectConversionAuthorityRow[];
}): ClientProspectIntelligenceAuthority {
  const clientOrganizationId = input.clientOrganizationId.trim();
  if (!clientOrganizationId) {
    return { ok: false, reason: "missing_client_organization" };
  }
  if (input.rows.length === 0) {
    return { ok: false, reason: "no_active_conversion" };
  }
  if (input.rows.length !== 1) {
    return { ok: false, reason: "ambiguous_conversion" };
  }

  const row = input.rows[0];
  if (row.status !== "active") {
    return { ok: false, reason: "no_active_conversion" };
  }

  const prospectId = readId(row.prospect_id);
  const sourceOrganizationId = readId(row.source_organization_id);
  const rowClientOrganizationId = readId(row.client_organization_id);
  const licenseeAccountId = readId(row.licensee_account_id);
  if (
    !prospectId ||
    !sourceOrganizationId ||
    !rowClientOrganizationId ||
    !licenseeAccountId
  ) {
    return { ok: false, reason: "incomplete_conversion" };
  }
  if (rowClientOrganizationId !== clientOrganizationId) {
    return { ok: false, reason: "client_mismatch" };
  }

  const subAccount = readId(row.licensee_sub_account_id);
  return {
    ok: true,
    conversion: {
      prospectId,
      sourceOrganizationId,
      clientOrganizationId,
      licenseeAccountId,
      licenseeSubAccountId: subAccount,
      status: "active",
    },
  };
}

function sameConversion(
  left: ActiveLicenseeProspectClientConversionRef,
  right: ActiveLicenseeProspectClientConversionRef,
): boolean {
  return (
    left.prospectId === right.prospectId &&
    left.sourceOrganizationId === right.sourceOrganizationId &&
    left.clientOrganizationId === right.clientOrganizationId &&
    left.licenseeAccountId === right.licenseeAccountId &&
    left.status === "active" &&
    right.status === "active"
  );
}

/**
 * Session client organization only. Exactly one active conversion is required.
 * A second active row, a reversed row, or a foreign client id denies access.
 */
export async function resolveClientProspectIntelligenceAuthority(
  clientOrganizationId: string,
): Promise<ClientProspectIntelligenceAuthority> {
  const id = clientOrganizationId.trim();
  if (!id) {
    return { ok: false, reason: "missing_client_organization" };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("licensee_prospect_client_conversions")
      .select(CLIENT_PROSPECT_INTELLIGENCE_CONVERSION_SELECT)
      .eq("client_organization_id", id)
      .eq("status", "active")
      .limit(2);

    if (error) {
      return { ok: false, reason: "lookup_failed" };
    }

    const decision = authorizeClientProspectConversionRows({
      clientOrganizationId: id,
      rows: (data ?? []) as ClientProspectConversionAuthorityRow[],
    });
    if (!decision.ok) {
      return decision;
    }

    const established = await getActiveConversionForClientOrganization(id);
    if (!established || !sameConversion(decision.conversion, established)) {
      return { ok: false, reason: "lookup_failed" };
    }

    return { ok: true, conversion: established };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}
