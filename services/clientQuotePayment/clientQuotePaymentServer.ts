/**
 * CQ-STRIPE-1 Gate 2B — server wiring for payment links.
 * The Stripe secret is read only when a Stripe call runs.
 */

import { requireLicenseeMasterAccount } from "@/services/licensee/licenseeSubAccounts";
import type { ClientQuotePaymentLinkDeps } from "@/services/clientQuotePayment/clientQuotePaymentApi";
import {
  createStripePaymentClient,
  createStripeV1Http,
  readStripeSecretFromEnv,
} from "@/services/clientQuotePayment/clientQuotePaymentStripeAdapter";
import { createSupabaseClientQuotePaymentStripeDispatchLedger } from "@/services/clientQuotePayment/clientQuotePaymentStripeDispatchStore";
import { createSupabaseClientQuotePaymentRequestStore } from "@/services/clientQuotePayment/clientQuotePaymentSupabaseStore";

export function createDefaultClientQuotePaymentLinkDeps(): ClientQuotePaymentLinkDeps {
  return {
    async requireMaster(userId) {
      const account = await requireLicenseeMasterAccount(userId);
      if (!account?.id || account.user_id !== userId) {
        const error = new Error("Authenticated user is not a Business Licensee Master.");
        error.name = "LicenseeAccessError";
        throw error;
      }
      return { id: account.id };
    },
    store: createSupabaseClientQuotePaymentRequestStore(),
    ledger: createSupabaseClientQuotePaymentStripeDispatchLedger(),
    stripe: createStripePaymentClient({
      http: createStripeV1Http(),
      secret: () => readStripeSecretFromEnv(),
    }),
    now: () => new Date().toISOString(),
  };
}
