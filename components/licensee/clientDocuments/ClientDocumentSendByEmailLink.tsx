"use client";

import { Mail } from "lucide-react";
import type { ClientDocumentGmailHandoff } from "@/lib/licensee/clientDocumentGmailHandoff";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";

/** Same outline pill as the quotation and invoice PDF actions. */
export const CLIENT_DOCUMENT_SEND_EMAIL_DETAIL_CLASS =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60 sm:w-auto";

/** Compact outline pill for library cards. */
export const CLIENT_DOCUMENT_SEND_EMAIL_CARD_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5";

export function ClientDocumentSendByEmailLink({
  handoff,
  messages,
  layout,
  documentKind,
}: {
  handoff: ClientDocumentGmailHandoff;
  messages: LicenseeMessages;
  layout: "detail" | "card";
  documentKind: "quote" | "invoice";
}) {
  const copy = messages.clientDocuments;
  const detail = layout === "detail";
  return (
    <div
      className={
        detail
          ? "flex w-full flex-col gap-2 sm:w-auto"
          : "inline-flex max-w-xs flex-col items-end gap-1"
      }
      data-client-document-send-email={documentKind}
      data-client-document-send-layout={layout}
    >
      <a
        href={handoff.href}
        target="_blank"
        rel="noopener noreferrer"
        data-client-document-send-email-link="true"
        data-client-document-send-recipient={
          handoff.recipientIncluded ? "included" : "omitted"
        }
        className={
          detail
            ? CLIENT_DOCUMENT_SEND_EMAIL_DETAIL_CLASS
            : CLIENT_DOCUMENT_SEND_EMAIL_CARD_CLASS
        }
      >
        <Mail size={16} aria-hidden="true" />
        {copy.sendByEmail}
      </a>
      <p
        className="text-xs leading-5 text-white/45"
        data-client-document-send-reminder="true"
      >
        {copy.sendReminder}
      </p>
      {handoff.recipientMissing ? (
        <p
          className="text-xs leading-5 text-amber-100"
          role="status"
          data-client-document-send-recipient-warning="true"
        >
          {copy.missingRecipient}
        </p>
      ) : null}
    </div>
  );
}

export function IssuedDocumentCardEmail({
  handoff,
  messages,
  documentKind,
}: {
  handoff: ClientDocumentGmailHandoff | null;
  messages: LicenseeMessages;
  documentKind: "quote" | "invoice";
}) {
  if (!handoff) return null;
  return (
    <ClientDocumentSendByEmailLink
      handoff={handoff}
      messages={messages}
      layout="card"
      documentKind={documentKind}
    />
  );
}
