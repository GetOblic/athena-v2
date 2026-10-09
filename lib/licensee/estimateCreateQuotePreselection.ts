/**
 * Estimate form preselection from Create Quote.
 * URL values are hints only. They never authorize a tenant or create an Estimate.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstimatePreselectionNotice = "organization" | "prospect" | null;

export type EstimateCreateQuotePreselection = {
  organizationId: string;
  requestedProspectId: string | null;
  notice: EstimatePreselectionNotice;
};

function queryText(value: string | null | undefined): {
  present: boolean;
  text: string;
} {
  if (typeof value !== "string") return { present: false, text: "" };
  const text = value.trim();
  return { present: text.length > 0, text };
}

function uuidOrNull(text: string): string | null {
  return UUID_RE.test(text) ? text : null;
}

export function readEstimateQueryValue(
  value: string | string[] | undefined | null,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = queryText(raw);
  return text.present ? text.text : null;
}

/**
 * Choose the organization shown in the Estimate form.
 * A requested organization is used only when it is already in the Master's
 * sub-account list. An invalid organization drops any requested Prospect,
 * so a foreign organization cannot select a Prospect on the fallback client.
 */
export function resolveEstimateCreateQuotePreselection(input: {
  requestedOrganizationId?: string | null;
  requestedProspectId?: string | null;
  subAccounts: readonly { organizationId: string }[];
}): EstimateCreateQuotePreselection {
  const fallback =
    input.subAccounts.find((item) => item.organizationId.trim())?.organizationId ??
    "";
  const organization = queryText(input.requestedOrganizationId);
  const prospect = queryText(input.requestedProspectId);
  if (!organization.present && !prospect.present) {
    return {
      organizationId: fallback,
      requestedProspectId: null,
      notice: null,
    };
  }

  const organizationId = organization.present ? uuidOrNull(organization.text) : null;
  const owned =
    organizationId != null &&
    input.subAccounts.some((item) => item.organizationId === organizationId);
  if (!owned || !organizationId) {
    return {
      organizationId: fallback,
      requestedProspectId: null,
      notice: "organization",
    };
  }

  if (!prospect.present) {
    return {
      organizationId,
      requestedProspectId: null,
      notice: null,
    };
  }
  const prospectId = uuidOrNull(prospect.text);
  if (!prospectId) {
    return {
      organizationId,
      requestedProspectId: null,
      notice: "prospect",
    };
  }
  return {
    organizationId,
    requestedProspectId: prospectId,
    notice: null,
  };
}

/**
 * Apply a requested Prospect only after the authorized selector list loads.
 * A missing id leaves the form on "no prospect".
 */
export function resolveRequestedProspectSelection(input: {
  requestedProspectId: string | null;
  selectableProspectIds: readonly string[];
}): { prospectId: string | null; available: boolean } {
  if (!input.requestedProspectId) {
    return { prospectId: null, available: true };
  }
  const available = input.selectableProspectIds.includes(input.requestedProspectId);
  return {
    prospectId: available ? input.requestedProspectId : null,
    available,
  };
}
