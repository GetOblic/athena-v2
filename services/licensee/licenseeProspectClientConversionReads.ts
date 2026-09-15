/**
 * Organization-scoped and targeted reads for Prospect ↔ client conversions.
 * Does not provision, reverse, or mutate Prospects / GetOblic / lifecycle_status.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LicenseeProspectClientConversionStatus = "active" | "reversed";

export type ProspectClientConversionState =
  | {
      status: "none";
      clientOrganizationId: null;
      conversionManaged: false;
    }
  | {
      status: "active";
      clientOrganizationId: string;
      conversionManaged: true;
    }
  | {
      status: "reversed";
      clientOrganizationId: string;
      conversionManaged: true;
    };

export type ActiveLicenseeProspectClientConversionRef = {
  prospectId: string;
  sourceOrganizationId: string;
  clientOrganizationId: string;
  licenseeAccountId: string;
  licenseeSubAccountId: string | null;
  status: "active";
};

export class LicenseeConversionManagedRemoveError extends Error {
  readonly code = "CONVERSION_MANAGED_ACTIVE";

  constructor(
    message = "This Licensee client is managed by an active Prospect conversion and cannot be removed with ordinary Remove.",
  ) {
    super(message);
    this.name = "LicenseeConversionManagedRemoveError";
  }
}

const ACTIVE_CONVERSION_REF_SELECT =
  "prospect_id, source_organization_id, client_organization_id, licensee_account_id, licensee_sub_account_id, status";

type ConversionStateRow = {
  prospect_id: string;
  client_organization_id: string;
  status: string;
};

type ActiveConversionRefRow = {
  prospect_id: string;
  source_organization_id: string;
  client_organization_id: string;
  licensee_account_id: string;
  licensee_sub_account_id: string | null;
  status: string;
};

function noneState(): ProspectClientConversionState {
  return {
    status: "none",
    clientOrganizationId: null,
    conversionManaged: false,
  };
}

function mapActiveRef(
  row: ActiveConversionRefRow,
): ActiveLicenseeProspectClientConversionRef | null {
  if (row.status !== "active") {
    return null;
  }
  return {
    prospectId: row.prospect_id,
    sourceOrganizationId: row.source_organization_id,
    clientOrganizationId: row.client_organization_id,
    licenseeAccountId: row.licensee_account_id,
    licenseeSubAccountId: row.licensee_sub_account_id,
    status: "active",
  };
}

export function excludeActivelyConvertedProspects<T extends { id: string }>(
  prospects: readonly T[],
  activeConvertedProspectIds: ReadonlySet<string>,
): T[] {
  if (activeConvertedProspectIds.size === 0) {
    return [...prospects];
  }
  return prospects.filter(
    (prospect) => !activeConvertedProspectIds.has(prospect.id),
  );
}

/**
 * One organization-scoped lookup. Callers filter in memory — do not query
 * conversions per Prospect.
 */
export async function listActiveConvertedProspectIdsForOrganization(
  organizationId: string,
): Promise<Set<string>> {
  const sourceOrganizationId = organizationId.trim();
  if (!sourceOrganizationId) {
    return new Set();
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select("prospect_id")
    .eq("source_organization_id", sourceOrganizationId)
    .eq("status", "active");

  if (error) {
    throw new Error(
      error.message || "Failed to load active Prospect conversions.",
    );
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const prospectId = (row as { prospect_id?: unknown }).prospect_id;
    if (typeof prospectId === "string" && prospectId.length > 0) {
      ids.add(prospectId);
    }
  }
  return ids;
}

/**
 * One batched lookup for dashboard cards. Callers filter in memory —
 * do not query conversions per sub-account.
 */
export async function listActiveConvertedClientOrganizationIds(
  clientOrganizationIds: readonly string[],
): Promise<Set<string>> {
  const ids = [
    ...new Set(
      clientOrganizationIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) {
    return new Set();
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select("client_organization_id")
    .in("client_organization_id", ids)
    .eq("status", "active");

  if (error) {
    throw new Error(
      error.message || "Failed to load active client conversions.",
    );
  }

  const converted = new Set<string>();
  for (const row of data ?? []) {
    const clientOrganizationId = (row as { client_organization_id?: unknown })
      .client_organization_id;
    if (
      typeof clientOrganizationId === "string" &&
      clientOrganizationId.length > 0
    ) {
      converted.add(clientOrganizationId);
    }
  }
  return converted;
}

export async function getProspectClientConversionState(
  prospectId: string,
): Promise<ProspectClientConversionState> {
  const id = prospectId.trim();
  if (!id) {
    return noneState();
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select("prospect_id, client_organization_id, status")
    .eq("prospect_id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message || "Failed to load Prospect conversion state.",
    );
  }

  if (!data) {
    return noneState();
  }

  const row = data as ConversionStateRow;
  if (row.status === "active") {
    return {
      status: "active",
      clientOrganizationId: row.client_organization_id,
      conversionManaged: true,
    };
  }
  if (row.status === "reversed") {
    return {
      status: "reversed",
      clientOrganizationId: row.client_organization_id,
      conversionManaged: true,
    };
  }
  return noneState();
}

export async function prospectHasActiveClientConversion(
  prospectId: string,
): Promise<boolean> {
  const state = await getProspectClientConversionState(prospectId);
  return state.status === "active";
}

export async function getActiveClientOrganizationForProspect(
  prospectId: string,
): Promise<string | null> {
  const state = await getProspectClientConversionState(prospectId);
  return state.status === "active" ? state.clientOrganizationId : null;
}

export async function getActiveConversionForClientOrganization(
  clientOrganizationId: string,
): Promise<ActiveLicenseeProspectClientConversionRef | null> {
  const id = clientOrganizationId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select(ACTIVE_CONVERSION_REF_SELECT)
    .eq("client_organization_id", id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message || "Failed to load conversion for client organization.",
    );
  }

  return data ? mapActiveRef(data as ActiveConversionRefRow) : null;
}

export async function isLicenseeClientOrganizationConversionManaged(
  clientOrganizationId: string,
): Promise<boolean> {
  const conversion =
    await getActiveConversionForClientOrganization(clientOrganizationId);
  return conversion != null;
}

export async function getActiveConversionForRelationshipId(
  relationshipId: string,
): Promise<ActiveLicenseeProspectClientConversionRef | null> {
  const id = relationshipId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select(ACTIVE_CONVERSION_REF_SELECT)
    .eq("licensee_sub_account_id", id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message || "Failed to load conversion for Licensee relationship.",
    );
  }

  if (data) {
    return mapActiveRef(data as ActiveConversionRefRow);
  }

  const { data: relationship, error: relationshipError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();

  if (relationshipError) {
    throw new Error(
      relationshipError.message ||
        "Failed to resolve Licensee relationship for conversion lookup.",
    );
  }

  const organizationId = relationship?.organization_id;
  if (typeof organizationId !== "string" || !organizationId) {
    return null;
  }

  return getActiveConversionForClientOrganization(organizationId);
}

export function httpStatusForLicenseeProspectClientConversionCode(
  code: string,
): number {
  switch (code) {
    case "INVALID_INPUT":
    case "INVALID_PROVISIONING_IDENTITY":
    case "INVALID_BODY":
    case "INVALID_JSON":
      return 400;
    case "PROSPECT_NOT_FOUND":
    case "CONVERSION_NOT_FOUND":
      return 404;
    case "PLAIN_TENANT":
    case "SOURCE_NOT_OWN_COMPANY":
    case "MISSING_LICENSEE_RELATIONSHIP":
    case "WRONG_LICENSEE":
    case "WRONG_SOURCE_ORGANIZATION":
    case "OTHER_LICENSEE":
      return 403;
    case "AMBIGUOUS_OWN_COMPANY_LICENSEE":
    case "AMBIGUOUS_LICENSEE_RELATIONSHIP":
    case "ACTIVE_CONVERSION_ELSEWHERE":
    case "EMAIL_COLLISION":
    case "UNSAFE_MEMBERSHIP":
    case "UNSAFE_PARTIAL_PROVISION":
    case "OWN_COMPANY_CANNOT_ATTACH":
    case "OWN_COMPANY_CANNOT_DETACH":
    case "CONFLICTING_CONVERSION":
    case "CONFLICTING_PROVISIONING_INTENT":
    case "CLIENT_ORGANIZATION_MISMATCH":
    case "CONVERSION_MANAGED_ACTIVE":
    case "GETOBLIC_OWNERSHIP_REQUIRED":
      return 409;
    default:
      return 500;
  }
}
