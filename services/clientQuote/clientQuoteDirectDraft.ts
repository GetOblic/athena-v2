/**
 * Empty draft for a quotation created without an Estimate.
 * Does not read an Estimate, enqueue generation, or call a model.
 */

import { CLIENT_QUOTE_DRAFT_SCHEMA_VERSION } from "@/services/clientQuote/clientQuoteTypes";
import type { ClientQuoteDraftV1 } from "@/services/clientQuote/clientQuoteTypes";
import { normalizeClientQuoteDraft } from "@/services/clientQuote/clientQuoteValidation";

/**
 * USD draft with no project text, no service lines, and a disabled appendix.
 * Customer and issuer are the caller's already authorized snapshots.
 */
export function buildDirectClientQuoteDraft(input: {
  issuer: unknown;
  customer: unknown;
}): ClientQuoteDraftV1 {
  return normalizeClientQuoteDraft(
    {
      schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
      issuer: input.issuer,
      customer: input.customer,
      projectTitle: "",
      scopeSummary: "",
      lineItems: [],
      paymentTerms: { summary: "", scheduleNote: null },
      validity: { validForDays: null, validUntil: null, note: null },
      appendix: { enabled: false, sections: [] },
      discount: { kind: "none" },
      tax: { kind: "none" },
    },
    "USD",
    { allowIncomplete: true },
  );
}
