/**
 * Licensee Master invoice responses.
 * Licensee account ids, the requesting user, mask timestamps, and private
 * logo storage paths stay on the stored row and are omitted here.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type {
  ClientQuoteIssuedBrandSnapshot,
  ClientQuoteLogoMimeType,
} from "@/services/clientQuote/clientQuoteTypes";
import type {
  ClientInvoice,
  ClientInvoiceDraftV1,
  ClientInvoiceIssuedSnapshotV1,
  ClientInvoiceStatus,
} from "@/services/clientInvoice/clientInvoiceTypes";

export type PublicClientInvoiceLogo = {
  mimeType: ClientQuoteLogoMimeType;
  contentHash: string;
};

export type PublicClientInvoiceIssuedSnapshot = Omit<
  ClientInvoiceIssuedSnapshotV1,
  "licenseeAccountId" | "brand"
> & {
  brand: Omit<ClientQuoteIssuedBrandSnapshot, "logo"> & {
    logo: PublicClientInvoiceLogo | null;
  };
};

export type PublicClientInvoice = {
  id: string;
  organizationId: string;
  status: ClientInvoiceStatus;
  contentLanguage: OrganizationLanguage;
  currencyCode: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceQuoteId: string;
  draft: ClientInvoiceDraftV1;
  issuedSnapshot: PublicClientInvoiceIssuedSnapshot | null;
};

function publicBrand(
  brand: ClientQuoteIssuedBrandSnapshot | null | undefined,
): PublicClientInvoiceIssuedSnapshot["brand"] {
  const logo = brand?.logo;
  return {
    primaryColor: brand?.primaryColor ?? null,
    secondaryColor: brand?.secondaryColor ?? null,
    accentColor: brand?.accentColor ?? null,
    backgroundColor: brand?.backgroundColor ?? null,
    font: brand?.font ?? null,
    logo:
      logo && logo.mimeType && logo.contentHash
        ? { mimeType: logo.mimeType, contentHash: logo.contentHash }
        : null,
  };
}

function publicIssuedSnapshot(
  snapshot: ClientInvoiceIssuedSnapshotV1 | null,
): PublicClientInvoiceIssuedSnapshot | null {
  if (!snapshot) return null;
  const {
    licenseeAccountId: _licenseeAccountId,
    brand: _brand,
    ...commercial
  } = snapshot;
  return {
    ...commercial,
    brand: publicBrand(snapshot.brand),
  };
}

export function toPublicClientInvoice(invoice: ClientInvoice): PublicClientInvoice {
  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    status: invoice.status,
    contentLanguage: invoice.contentLanguage,
    currencyCode: invoice.currencyCode,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    issuedAt: invoice.issuedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    sourceQuoteId: invoice.draft.sourceQuote.quoteId,
    draft: invoice.draft,
    issuedSnapshot: publicIssuedSnapshot(invoice.issuedSnapshot),
  };
}
