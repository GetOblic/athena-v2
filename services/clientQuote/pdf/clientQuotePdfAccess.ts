/**
 * Licensee Master gate for an issued quotation PDF.
 * The returned snapshot is the only commercial document the renderer sees.
 */

import { clientQuotePdfNotIssued, clientQuoteNotFound } from "@/services/clientQuote/clientQuoteErrors";
import type { ClientQuoteDeps } from "@/services/clientQuote/clientQuoteDeps";
import { getClientQuoteForMaster } from "@/services/clientQuote/clientQuoteService";
import type { ClientQuoteIssuedSnapshotV1 } from "@/services/clientQuote/clientQuoteTypes";

export async function loadIssuedClientQuoteSnapshotForPdf(input: {
  masterUserId: string;
  quoteId: string;
  deps: ClientQuoteDeps;
}): Promise<ClientQuoteIssuedSnapshotV1> {
  const quote = await getClientQuoteForMaster(input);
  const snapshot = quote.issued_snapshot_json;
  if (quote.status !== "issued" || !snapshot) {
    throw clientQuotePdfNotIssued();
  }
  if (
    snapshot.quoteId !== quote.id ||
    snapshot.licenseeAccountId !== quote.licensee_account_id
  ) {
    throw clientQuoteNotFound("Quotation not found.");
  }
  return snapshot;
}
