/**
 * Pure recipient mapping for a quotation customer snapshot.
 * Prospect email is the prospect contact email.
 * Organization email is business_email only.
 * Login and provisional account emails are not inputs.
 */

import {
  CLIENT_QUOTE_FIELD_LIMITS,
  emptyClientQuotePostalAddress,
  type ClientQuoteCustomerSnapshot,
  type ClientQuotePostalAddress,
} from "@/services/clientQuote/clientQuoteTypes";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClientQuoteProspectRecipient = {
  business_name?: unknown;
  legal_name?: unknown;
  address?: unknown;
  address_line2?: unknown;
  city?: unknown;
  state?: unknown;
  postal_code?: unknown;
  country?: unknown;
  phone?: unknown;
  email?: unknown;
  decision_maker?: unknown;
  job_title?: unknown;
  tax_identifier?: unknown;
};

export type ClientQuoteOrganizationRecipient = {
  name?: unknown;
  legal_name?: unknown;
  address?: unknown;
  address_line2?: unknown;
  city?: unknown;
  state?: unknown;
  postal_code?: unknown;
  country?: unknown;
  phone?: unknown;
  business_email?: unknown;
  decision_maker?: unknown;
  job_title?: unknown;
  tax_identifier?: unknown;
};

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\u0000") || trimmed.length > max) return null;
  return trimmed;
}

function readEmail(value: unknown): string | null {
  const email = readText(value, CLIENT_QUOTE_FIELD_LIMITS.email);
  if (!email || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function readAddress(source: {
  address?: unknown;
  address_line2?: unknown;
  city?: unknown;
  state?: unknown;
  postal_code?: unknown;
  country?: unknown;
}): ClientQuotePostalAddress {
  return {
    ...emptyClientQuotePostalAddress(),
    line1: readText(source.address, CLIENT_QUOTE_FIELD_LIMITS.addressLine),
    line2: readText(source.address_line2, CLIENT_QUOTE_FIELD_LIMITS.addressLine),
    city: readText(source.city, CLIENT_QUOTE_FIELD_LIMITS.city),
    region: readText(source.state, CLIENT_QUOTE_FIELD_LIMITS.region),
    postalCode: readText(source.postal_code, CLIENT_QUOTE_FIELD_LIMITS.postalCode),
    country: readText(source.country, CLIENT_QUOTE_FIELD_LIMITS.country),
  };
}

/**
 * Customer name prefers the legal name, then the prospect display name.
 * Returns null when neither can be printed.
 */
export function mapProspectToCustomerSnapshot(
  prospect: ClientQuoteProspectRecipient,
): ClientQuoteCustomerSnapshot | null {
  const name =
    readText(prospect.legal_name, CLIENT_QUOTE_FIELD_LIMITS.customerName) ??
    readText(prospect.business_name, CLIENT_QUOTE_FIELD_LIMITS.customerName);
  if (!name) return null;
  return {
    name,
    contactName: readText(prospect.decision_maker, CLIENT_QUOTE_FIELD_LIMITS.contactName),
    jobTitle: readText(prospect.job_title, CLIENT_QUOTE_FIELD_LIMITS.jobTitle),
    postalAddress: readAddress(prospect),
    phone: readText(prospect.phone, CLIENT_QUOTE_FIELD_LIMITS.phone),
    email: readEmail(prospect.email),
    taxIdentifier: readText(
      prospect.tax_identifier,
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier,
    ),
  };
}

/**
 * Deleted Prospect: the only printable fact is the Estimate's frozen
 * business-name snapshot. Address and contact stay blank.
 * Returns null when that snapshot cannot be printed.
 */
export function mapRemovedProspectSnapshotToCustomerSnapshot(
  businessNameSnapshot: unknown,
): ClientQuoteCustomerSnapshot | null {
  const name = readText(
    businessNameSnapshot,
    CLIENT_QUOTE_FIELD_LIMITS.customerName,
  );
  if (!name) return null;
  return {
    name,
    contactName: null,
    jobTitle: null,
    postalAddress: emptyClientQuotePostalAddress(),
    phone: null,
    email: null,
    taxIdentifier: null,
  };
}

/**
 * Customer name prefers the legal name, then organizations.name.
 * business_email is the only email. A sibling login email is not read.
 */
export function mapOrganizationToCustomerSnapshot(
  organization: ClientQuoteOrganizationRecipient,
): ClientQuoteCustomerSnapshot | null {
  const name =
    readText(organization.legal_name, CLIENT_QUOTE_FIELD_LIMITS.customerName) ??
    readText(organization.name, CLIENT_QUOTE_FIELD_LIMITS.customerName);
  if (!name) return null;
  return {
    name,
    contactName: readText(
      organization.decision_maker,
      CLIENT_QUOTE_FIELD_LIMITS.contactName,
    ),
    jobTitle: readText(organization.job_title, CLIENT_QUOTE_FIELD_LIMITS.jobTitle),
    postalAddress: readAddress(organization),
    phone: readText(organization.phone, CLIENT_QUOTE_FIELD_LIMITS.phone),
    email: readEmail(organization.business_email),
    taxIdentifier: readText(
      organization.tax_identifier,
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier,
    ),
  };
}
