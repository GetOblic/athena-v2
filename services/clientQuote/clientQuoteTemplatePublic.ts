/**
 * Licensee Master template responses.
 * Licensee account ids stay on the stored row and are omitted here.
 */

import type { ClientQuoteBillingFrequency } from "@/services/clientQuote/clientQuoteTypes";
import type { AthenaClientQuoteTemplate } from "@/services/clientQuote/clientQuoteTemplateTypes";

export type PublicClientQuoteTemplate = {
  id: string;
  name: string;
  description: string;
  quantity: {
    coefficient: number;
    scale: number;
  };
  unitPriceMinor: number;
  currencyCode: string;
  billingFrequency: ClientQuoteBillingFrequency;
  createdAt: string;
  updatedAt: string;
};

export function toPublicClientQuoteTemplate(
  template: AthenaClientQuoteTemplate,
): PublicClientQuoteTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    quantity: {
      coefficient: template.quantity_coefficient,
      scale: template.quantity_scale,
    },
    unitPriceMinor: template.unit_price_minor,
    currencyCode: template.currency_code,
    billingFrequency: template.billing_frequency,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}
