"use client";

import { useRef, useState } from "react";
import { Mail } from "lucide-react";
import {
  buildClientDocumentGmailHandoff,
  clientDocumentRecipientEmail,
  type ClientDocumentGmailHandoff,
  type ClientQuoteEmailPaymentLinkInput,
  type ClientQuoteGmailSnapshot,
} from "@/lib/licensee/clientDocumentGmailHandoff";
import { parseClientQuotePaymentLinkPayload } from "@/lib/licensee/clientQuotePaymentLinksModel";
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

const PREPARING_EMAIL_TITLE = "Preparing email";
const PREPARING_EMAIL_MESSAGE = "Preparing email…";

function presentPreparingEmail(popup: Window) {
  try {
    popup.opener = null;
  } catch {
    // The browser rejected opener assignment. Navigation still uses the returned window.
  }
  try {
    const popupDocument = popup.document;
    popupDocument.title = PREPARING_EMAIL_TITLE;
    const paragraph = popupDocument.createElement("p");
    paragraph.textContent = PREPARING_EMAIL_MESSAGE;
    popupDocument.body?.replaceChildren(paragraph);
  } catch {
    // The temporary page is optional. Gmail opens only after the handoff is ready.
  }
}

async function readPersistedQuotePaymentLinks(
  quoteId: string,
): Promise<readonly ClientQuoteEmailPaymentLinkInput[] | null> {
  try {
    const response = await fetch(
      `/api/licensee/client-quotes/${encodeURIComponent(quoteId)}/payment-links`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return null;
    const payload = parseClientQuotePaymentLinkPayload(await response.json());
    if (!payload) return null;
    return payload.paymentRequests.map((row) => ({
      purpose: row.purpose,
      url: row.paymentLinkUrl,
    }));
  } catch {
    return null;
  }
}

function openQuoteLibraryEmailTab(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

async function settleQuoteLibraryEmail(input: {
  popup: Window | null;
  quoteId: string;
  snapshot: ClientQuoteGmailSnapshot;
  publishFallback: (handoff: ClientDocumentGmailHandoff) => void;
  unlock: () => void;
}) {
  try {
    const paymentLinks = await readPersistedQuotePaymentLinks(input.quoteId);
    const handoff = buildClientDocumentGmailHandoff({
      kind: "quote",
      snapshot: input.snapshot,
      ...(paymentLinks ? { paymentLinks } : {}),
    });
    if (input.popup) {
      try {
        if (!input.popup.closed) input.popup.location.replace(handoff.href);
      } catch {
        // Leave the blank tab. Do not open another window or synthesize a click.
      }
    } else {
      input.publishFallback(handoff);
    }
  } finally {
    input.unlock();
  }
}

export function QuoteLibraryCardEmail({
  quoteId,
  snapshot,
  messages,
}: {
  quoteId: string;
  snapshot: ClientQuoteGmailSnapshot | null;
  messages: LicenseeMessages;
}) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [fallbackHandoff, setFallbackHandoff] = useState<ClientDocumentGmailHandoff | null>(
    null,
  );
  if (!snapshot) return null;
  if (fallbackHandoff) {
    return (
      <ClientDocumentSendByEmailLink
        handoff={fallbackHandoff}
        messages={messages}
        layout="card"
        documentKind="quote"
      />
    );
  }

  const copy = messages.clientDocuments;
  const recipientMissing = clientDocumentRecipientEmail(snapshot.customer.email) == null;
  const issuedSnapshot = snapshot;

  function onSendByEmail() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    const popup = openQuoteLibraryEmailTab();
    if (popup) presentPreparingEmail(popup);
    void settleQuoteLibraryEmail({
      popup,
      quoteId,
      snapshot: issuedSnapshot,
      publishFallback: setFallbackHandoff,
      unlock() {
        lock.current = false;
        setPending(false);
      },
    });
  }

  return (
    <div
      className="inline-flex max-w-xs flex-col items-end gap-1"
      data-client-document-send-email="quote"
      data-client-document-send-layout="card"
      data-client-quote-send-email={quoteId}
      data-client-document-send-email-pending={pending ? "true" : "false"}
    >
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onSendByEmail}
        data-client-document-send-email-button="true"
        data-client-document-send-recipient={recipientMissing ? "omitted" : "included"}
        className={CLIENT_DOCUMENT_SEND_EMAIL_CARD_CLASS}
      >
        <Mail size={16} aria-hidden="true" />
        {copy.sendByEmail}
      </button>
      <p
        className="text-xs leading-5 text-white/45"
        data-client-document-send-reminder="true"
      >
        {copy.sendReminder}
      </p>
      {recipientMissing ? (
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
