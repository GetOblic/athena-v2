/**
 * Pure mapper from an authorized Organization commercial identity
 * into a quotation issuer snapshot.
 *
 * Reads organizations columns plus the caller-supplied athena_identity.website.
 * business_email is the commercial contact email. The account login email
 * is not an input. Brand palette and logo are not copied here.
 * This module does not persist a parallel business registry.
 */

import {
  CLIENT_QUOTE_FIELD_LIMITS,
  ClientQuoteValidationError,
  emptyClientQuotePostalAddress,
  type ClientQuoteIssuerSnapshot,
  type ClientQuotePostalAddress,
} from "@/services/clientQuote/clientQuoteTypes";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Column names match organizations. website is supplied separately
 * because it remains athena_identity.website.
 */
export type OrganizationCommercialIdentity = {
  name: string;
  legal_name?: string | null;
  address?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  business_email?: string | null;
  decision_maker?: string | null;
  job_title?: string | null;
  registration_number?: string | null;
  tax_identifier?: string | null;
  tax_identifier_label?: string | null;
};

function fail(message: string): never {
  throw new ClientQuoteValidationError([message]);
}

function readText(
  value: unknown,
  label: string,
  max: number,
  mode: "text" | "email" | "website",
): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    fail(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\u0000") || trimmed.length > max) {
    fail(
      trimmed.includes("\u0000")
        ? `${label} contains an invalid character.`
        : `${label} exceeds maximum length of ${max} characters.`,
    );
  }
  if (mode === "email" && !EMAIL_PATTERN.test(trimmed)) {
    fail(`${label} must be an email address.`);
  }
  if (mode === "website" && /\s/.test(trimmed)) {
    fail(`${label} must not contain whitespace.`);
  }
  return trimmed;
}

/**
 * Copy canonical organization commercial identity into issuer text.
 * Requires organizations.legal_name. organizations.name becomes tradingName.
 * identityWebsite is athena_identity.website. Later organization edits do
 * not rewrite a snapshot already returned.
 */
export function mapOrganizationCommercialIdentityToIssuerSnapshot(
  organization: OrganizationCommercialIdentity,
  identityWebsite?: unknown,
): ClientQuoteIssuerSnapshot {
  if (!organization || typeof organization !== "object") {
    fail("organization must be an object.");
  }
  const legalName = readText(
    organization.legal_name,
    "legal_name",
    CLIENT_QUOTE_FIELD_LIMITS.legalName,
    "text",
  );
  if (!legalName) {
    fail("issuer.legalName must be a non-empty string.");
  }
  const postalAddress: ClientQuotePostalAddress = {
    ...emptyClientQuotePostalAddress(),
    line1: readText(
      organization.address,
      "address",
      CLIENT_QUOTE_FIELD_LIMITS.addressLine,
      "text",
    ),
    line2: readText(
      organization.address_line2,
      "address_line2",
      CLIENT_QUOTE_FIELD_LIMITS.addressLine,
      "text",
    ),
    city: readText(organization.city, "city", CLIENT_QUOTE_FIELD_LIMITS.city, "text"),
    region: readText(
      organization.state,
      "state",
      CLIENT_QUOTE_FIELD_LIMITS.region,
      "text",
    ),
    postalCode: readText(
      organization.postal_code,
      "postal_code",
      CLIENT_QUOTE_FIELD_LIMITS.postalCode,
      "text",
    ),
    country: readText(
      organization.country,
      "country",
      CLIENT_QUOTE_FIELD_LIMITS.country,
      "text",
    ),
  };
  return {
    legalName,
    tradingName: readText(
      organization.name,
      "name",
      CLIENT_QUOTE_FIELD_LIMITS.tradingName,
      "text",
    ),
    postalAddress,
    phone: readText(
      organization.phone,
      "phone",
      CLIENT_QUOTE_FIELD_LIMITS.phone,
      "text",
    ),
    email: readText(
      organization.business_email,
      "business_email",
      CLIENT_QUOTE_FIELD_LIMITS.email,
      "email",
    ),
    website: readText(
      identityWebsite,
      "website",
      CLIENT_QUOTE_FIELD_LIMITS.website,
      "website",
    ),
    registrationNumber: readText(
      organization.registration_number,
      "registration_number",
      CLIENT_QUOTE_FIELD_LIMITS.registrationNumber,
      "text",
    ),
    taxIdentifier: readText(
      organization.tax_identifier,
      "tax_identifier",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier,
      "text",
    ),
    taxIdentifierLabel: readText(
      organization.tax_identifier_label,
      "tax_identifier_label",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel,
      "text",
    ),
    contactName: readText(
      organization.decision_maker,
      "decision_maker",
      CLIENT_QUOTE_FIELD_LIMITS.contactName,
      "text",
    ),
    jobTitle: readText(
      organization.job_title,
      "job_title",
      CLIENT_QUOTE_FIELD_LIMITS.jobTitle,
      "text",
    ),
    additionalNote: null,
  };
}

function optionalIdentityText(
  value: unknown,
  label: string,
  max: number,
  mode: "text" | "email" | "website",
): string | null {
  try {
    return readText(value, label, max, mode);
  } catch (error) {
    if (error instanceof ClientQuoteValidationError) return null;
    throw error;
  }
}

/**
 * Issuer text for a new draft.
 * A missing or invalid legal name stays blank so the draft can be saved.
 * Issue still requires issuer.legalName. business_email is the only email
 * read. A login or provisional address on the object is ignored.
 */
export function mapOrganizationCommercialIdentityToDraftIssuerSnapshot(
  organization: OrganizationCommercialIdentity,
  identityWebsite?: unknown,
): ClientQuoteIssuerSnapshot {
  try {
    return mapOrganizationCommercialIdentityToIssuerSnapshot(
      organization,
      identityWebsite,
    );
  } catch (error) {
    if (!(error instanceof ClientQuoteValidationError)) throw error;
  }
  if (!organization || typeof organization !== "object") {
    return {
      legalName: "",
      tradingName: null,
      postalAddress: emptyClientQuotePostalAddress(),
      phone: null,
      email: null,
      website: null,
      registrationNumber: null,
      taxIdentifier: null,
      taxIdentifierLabel: null,
      contactName: null,
      jobTitle: null,
      additionalNote: null,
    };
  }
  return {
    legalName:
      optionalIdentityText(
        organization.legal_name,
        "legal_name",
        CLIENT_QUOTE_FIELD_LIMITS.legalName,
        "text",
      ) ?? "",
    tradingName: optionalIdentityText(
      organization.name,
      "name",
      CLIENT_QUOTE_FIELD_LIMITS.tradingName,
      "text",
    ),
    postalAddress: {
      line1: optionalIdentityText(
        organization.address,
        "address",
        CLIENT_QUOTE_FIELD_LIMITS.addressLine,
        "text",
      ),
      line2: optionalIdentityText(
        organization.address_line2,
        "address_line2",
        CLIENT_QUOTE_FIELD_LIMITS.addressLine,
        "text",
      ),
      city: optionalIdentityText(
        organization.city,
        "city",
        CLIENT_QUOTE_FIELD_LIMITS.city,
        "text",
      ),
      region: optionalIdentityText(
        organization.state,
        "state",
        CLIENT_QUOTE_FIELD_LIMITS.region,
        "text",
      ),
      postalCode: optionalIdentityText(
        organization.postal_code,
        "postal_code",
        CLIENT_QUOTE_FIELD_LIMITS.postalCode,
        "text",
      ),
      country: optionalIdentityText(
        organization.country,
        "country",
        CLIENT_QUOTE_FIELD_LIMITS.country,
        "text",
      ),
    },
    phone: optionalIdentityText(
      organization.phone,
      "phone",
      CLIENT_QUOTE_FIELD_LIMITS.phone,
      "text",
    ),
    email: optionalIdentityText(
      organization.business_email,
      "business_email",
      CLIENT_QUOTE_FIELD_LIMITS.email,
      "email",
    ),
    website: optionalIdentityText(
      identityWebsite,
      "website",
      CLIENT_QUOTE_FIELD_LIMITS.website,
      "website",
    ),
    registrationNumber: optionalIdentityText(
      organization.registration_number,
      "registration_number",
      CLIENT_QUOTE_FIELD_LIMITS.registrationNumber,
      "text",
    ),
    taxIdentifier: optionalIdentityText(
      organization.tax_identifier,
      "tax_identifier",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier,
      "text",
    ),
    taxIdentifierLabel: optionalIdentityText(
      organization.tax_identifier_label,
      "tax_identifier_label",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel,
      "text",
    ),
    contactName: optionalIdentityText(
      organization.decision_maker,
      "decision_maker",
      CLIENT_QUOTE_FIELD_LIMITS.contactName,
      "text",
    ),
    jobTitle: optionalIdentityText(
      organization.job_title,
      "job_title",
      CLIENT_QUOTE_FIELD_LIMITS.jobTitle,
      "text",
    ),
    additionalNote: null,
  };
}
