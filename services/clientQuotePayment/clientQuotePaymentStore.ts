/**
 * Persistence port for payment-request intents.
 * The service-role adapter and the tests both implement this shape.
 */

import type { AthenaClientQuote } from "@/services/clientQuote/clientQuoteTypes";
import type {
  ClientQuotePaymentCommitInput,
} from "@/services/clientQuotePayment/clientQuotePaymentCommit";
import type { ClientQuotePaymentStripeFulfillmentInput } from "@/services/clientQuotePayment/clientQuotePaymentFulfillment";
import type { ClientQuotePaymentRequest } from "@/services/clientQuotePayment/clientQuotePaymentTypes";

export type ClientQuotePaymentRequestStore = {
  /** Owned row, including a masked or draft quotation. Null when not owned. */
  getOwnedQuote(
    sourceQuoteId: string,
    licenseeAccountId: string,
  ): Promise<AthenaClientQuote | null>;
  /**
   * Insert one decision under the quotation lock.
   * Must not update the quotation, invoice, or an existing payment request.
   */
  commitPaymentRequestIntents(
    input: ClientQuotePaymentCommitInput,
  ): Promise<ClientQuotePaymentRequest[]>;
  /** Readable after quotation expiry and after the quotation is masked. */
  listPaymentRequests(
    sourceQuoteId: string,
    licenseeAccountId: string,
  ): Promise<ClientQuotePaymentRequest[]>;
  getPaymentRequest(
    id: string,
    licenseeAccountId: string,
  ): Promise<ClientQuotePaymentRequest | null>;
  /**
   * Fill Stripe Price and Payment Link identifiers on an existing intent.
   * Must not change commercial fields or idempotency keys.
   */
  recordStripeFulfillment(
    input: ClientQuotePaymentStripeFulfillmentInput,
  ): Promise<ClientQuotePaymentRequest>;
};
