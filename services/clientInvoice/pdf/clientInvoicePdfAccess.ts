/**
 * Licensee Master gate for an issued invoice PDF.
 * The returned snapshot is the only commercial document the renderer sees.
 */

import type { ClientInvoiceDeps } from "@/services/clientInvoice/clientInvoiceDeps";
import {
  clientInvoiceNotFound,
  clientInvoicePdfNotIssued,
} from "@/services/clientInvoice/clientInvoiceErrors";
import { getClientInvoiceForMaster } from "@/services/clientInvoice/clientInvoiceService";
import type { ClientInvoiceIssuedSnapshotV1 } from "@/services/clientInvoice/clientInvoiceTypes";

export async function loadIssuedClientInvoiceSnapshotForPdf(input: {
  masterUserId: string;
  invoiceId: string;
  deps: ClientInvoiceDeps;
}): Promise<ClientInvoiceIssuedSnapshotV1> {
  const invoice = await getClientInvoiceForMaster(input);
  const snapshot = invoice.issuedSnapshot;
  if (invoice.status !== "issued" || !snapshot) {
    throw clientInvoicePdfNotIssued();
  }
  if (
    snapshot.invoiceId !== invoice.id ||
    snapshot.licenseeAccountId !== invoice.licenseeAccountId ||
    snapshot.organizationId !== invoice.organizationId ||
    snapshot.invoiceNumber !== invoice.invoiceNumber ||
    snapshot.currencyCode !== invoice.currencyCode ||
    snapshot.contentLanguage !== invoice.contentLanguage ||
    snapshot.issueDate !== invoice.issueDate ||
    snapshot.sourceQuote.quoteId !== invoice.draft.sourceQuote.quoteId
  ) {
    throw clientInvoiceNotFound("Invoice not found.");
  }
  return snapshot;
}
