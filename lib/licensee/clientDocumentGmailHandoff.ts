/**
 * Gmail compose handoff for an issued client quotation or invoice.
 * The URL is built from the frozen issued snapshot only.
 * It does not select a Gmail account and it does not send mail.
 */

import { clientDocumentEmailMessage, singleLine } from "@/lib/licensee/clientDocumentEmailCopy";
import { buildClientInvoicePdfFilename } from "@/services/clientInvoice/pdf/clientInvoicePdfFilename";
import { buildClientQuotePdfFilename } from "@/services/clientQuote/pdf/clientQuotePdfFilename";
import {
  isOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

export const GMAIL_COMPOSE_URL_BASE = "https://mail.google.com/mail/?view=cm&fs=1&tf=1";
export const GMAIL_COMPOSE_MAX_URL_LENGTH = 2_000;
export const GMAIL_COMPOSE_MAX_SUBJECT_LENGTH = 120;

const ELLIPSIS = "…";
const RECIPIENT_PATTERN = /^[^\s@,;<>"()\\]+@[^\s@,;<>"()\\]+\.[^\s@,;<>"()\\]+$/;

export type ClientQuoteGmailSnapshot = {
  contentLanguage: OrganizationLanguage;
  quoteNumber: string;
  issuedAt: string;
  projectTitle: string;
  customer: {
    name: string;
    contactName: string | null;
    email: string | null;
  };
  issuer: {
    legalName: string;
    tradingName: string | null;
  };
};

export type ClientInvoiceGmailSnapshot = {
  contentLanguage: OrganizationLanguage;
  invoiceNumber: string;
  issueDate: string;
  projectTitle: string;
  customer: {
    name: string;
    contactName: string | null;
    email: string | null;
  };
  issuer: {
    legalName: string;
    tradingName: string | null;
  };
};

export type GmailComposeUrl = {
  href: string;
  subject: string;
  body: string;
  recipientIncluded: boolean;
};

export type ClientDocumentGmailHandoff = GmailComposeUrl & {
  /** True when the frozen customer email is missing or not a single address. */
  recipientMissing: boolean;
  pdfFilename: string;
};

function codePoints(value: string): string[] {
  return Array.from(value);
}

function sliceCodePoints(value: string, count: number): string {
  if (count <= 0) return "";
  return codePoints(value).slice(0, count).join("");
}

function capSubject(value: string): string {
  const clean = singleLine(value);
  if (codePoints(clean).length <= GMAIL_COMPOSE_MAX_SUBJECT_LENGTH) return clean;
  if (GMAIL_COMPOSE_MAX_SUBJECT_LENGTH <= 1) {
    return sliceCodePoints(ELLIPSIS, GMAIL_COMPOSE_MAX_SUBJECT_LENGTH);
  }
  return `${sliceCodePoints(clean, GMAIL_COMPOSE_MAX_SUBJECT_LENGTH - 1).trimEnd()}${ELLIPSIS}`;
}

function assemble(to: string | null, subject: string, body: string): string {
  const params = new URLSearchParams();
  params.set("view", "cm");
  params.set("fs", "1");
  params.set("tf", "1");
  if (to) params.set("to", to);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function fits(href: string): boolean {
  return href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH;
}

function longestFitting(
  source: string,
  accept: (candidate: string) => boolean,
): string {
  if (accept(source)) return source;
  const points = codePoints(source);
  let low = 0;
  let high = points.length;
  let best = "";
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const prefix = points.slice(0, mid).join("").trimEnd();
    const candidate =
      mid >= points.length ? source : prefix ? `${prefix}${ELLIPSIS}` : "";
    if (accept(candidate)) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/**
 * Pure Gmail compose URL.
 * Subject is capped at 120 characters. The full URL is capped at 2,000.
 * Overflow drops body text first, then the subject, then the recipient.
 * The last resort is the account-neutral compose base.
 */
export function buildGmailComposeUrl(input: {
  to?: string | null;
  subject: string;
  body: string;
}): GmailComposeUrl {
  const subject = capSubject(input.subject);
  const body = input.body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const to = input.to && input.to.trim() ? input.to.trim() : null;

  const full = assemble(to, subject, body);
  if (fits(full)) {
    return { href: full, subject, body, recipientIncluded: to !== null };
  }

  const fittedBody = longestFitting(body, (candidate) =>
    fits(assemble(to, subject, candidate)),
  );
  const withBody = assemble(to, subject, fittedBody);
  if (fits(withBody)) {
    return {
      href: withBody,
      subject,
      body: fittedBody,
      recipientIncluded: to !== null,
    };
  }

  const fittedSubject = longestFitting(subject, (candidate) =>
    fits(assemble(to, candidate, "")),
  );
  const subjectOnly = assemble(to, fittedSubject, "");
  if (fits(subjectOnly)) {
    return {
      href: subjectOnly,
      subject: fittedSubject,
      body: "",
      recipientIncluded: to !== null,
    };
  }

  const noRecipientSubject = longestFitting(subject, (candidate) =>
    fits(assemble(null, candidate, "")),
  );
  const noRecipient = assemble(null, noRecipientSubject, "");
  if (fits(noRecipient)) {
    return {
      href: noRecipient,
      subject: noRecipientSubject,
      body: "",
      recipientIncluded: false,
    };
  }

  return {
    href: GMAIL_COMPOSE_URL_BASE,
    subject: "",
    body: "",
    recipientIncluded: false,
  };
}

/** A single mailbox. Display names, lists, and header punctuation are rejected. */
export function clientDocumentRecipientEmail(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!email || email.length > 320) return null;
  if (email.split("@").length !== 2) return null;
  return RECIPIENT_PATTERN.test(email) ? email : null;
}

function greetingName(customer: ClientQuoteGmailSnapshot["customer"]): string {
  return singleLine(customer.contactName) || singleLine(customer.name);
}

function issuerName(issuer: ClientQuoteGmailSnapshot["issuer"]): string {
  return singleLine(issuer.tradingName) || singleLine(issuer.legalName);
}

function languageOf(value: OrganizationLanguage): OrganizationLanguage {
  if (!isOrganizationLanguage(value)) return "en";
  return value.toLowerCase() as OrganizationLanguage;
}

export function buildClientDocumentGmailHandoff(
  input:
    | { kind: "quote"; snapshot: ClientQuoteGmailSnapshot }
    | { kind: "invoice"; snapshot: ClientInvoiceGmailSnapshot },
): ClientDocumentGmailHandoff {
  const snapshot = input.snapshot;
  const recipient = clientDocumentRecipientEmail(snapshot.customer.email);
  const pdfFilename =
    input.kind === "quote"
      ? buildClientQuotePdfFilename({
          quoteNumber: input.snapshot.quoteNumber,
          issuedAt: input.snapshot.issuedAt,
        })
      : buildClientInvoicePdfFilename({
          invoiceNumber: input.snapshot.invoiceNumber,
          issueDate: input.snapshot.issueDate,
        });
  const documentNumber =
    input.kind === "quote" ? input.snapshot.quoteNumber : input.snapshot.invoiceNumber;
  const message = clientDocumentEmailMessage({
    kind: input.kind,
    language: languageOf(snapshot.contentLanguage),
    documentNumber,
    projectTitle: snapshot.projectTitle,
    greetingName: greetingName(snapshot.customer),
    issuerName: issuerName(snapshot.issuer),
    pdfFilename,
  });
  const url = buildGmailComposeUrl({
    to: recipient,
    subject: message.subject,
    body: message.body,
  });
  return {
    ...url,
    recipientMissing: recipient === null,
    pdfFilename,
  };
}
