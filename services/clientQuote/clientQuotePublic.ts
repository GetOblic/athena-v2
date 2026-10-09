/**
 * Licensee Master quotation responses.
 * Private logo object paths stay on the stored snapshot and are omitted here.
 * Source Estimate intelligence is not part of this contract.
 */

import { preservedSourceEstimateId } from "@/services/clientQuote/clientQuoteTypes";
import type {
  AthenaClientQuote,
  ClientQuoteDraftV1,
  ClientQuoteIssuedSnapshotV1,
  ClientQuoteLogoMimeType,
  ClientQuoteSourceEstimateSnapshot,
  ClientQuoteStatus,
} from "@/services/clientQuote/clientQuoteTypes";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

export type PublicClientQuoteLogo = {
  mimeType: ClientQuoteLogoMimeType;
  contentHash: string;
};

export type PublicClientQuoteIssuedSnapshot = Omit<
  ClientQuoteIssuedSnapshotV1,
  "brand" | "licenseeAccountId"
> & {
  brand: Omit<ClientQuoteIssuedSnapshotV1["brand"], "logo"> & {
    logo: PublicClientQuoteLogo | null;
  };
};

export type PublicClientQuote = {
  id: string;
  organizationId: string;
  status: ClientQuoteStatus;
  contentLanguage: OrganizationLanguage;
  currencyCode: string;
  quoteNumber: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceEstimateId: string | null;
  sourceEstimate: ClientQuoteSourceEstimateSnapshot | null;
  revisedFromQuoteId: string | null;
  draft: ClientQuoteDraftV1;
  issuedSnapshot: PublicClientQuoteIssuedSnapshot | null;
};

function publicIssuedSnapshot(
  snapshot: ClientQuoteIssuedSnapshotV1 | null,
): PublicClientQuoteIssuedSnapshot | null {
  if (!snapshot) return null;
  const logo = snapshot.brand.logo;
  const { licenseeAccountId: _licenseeAccountId, ...commercial } = snapshot;
  return {
    ...commercial,
    brand: {
      primaryColor: snapshot.brand.primaryColor,
      secondaryColor: snapshot.brand.secondaryColor,
      accentColor: snapshot.brand.accentColor,
      backgroundColor: snapshot.brand.backgroundColor,
      font: snapshot.brand.font,
      logo: logo
        ? { mimeType: logo.mimeType, contentHash: logo.contentHash }
        : null,
    },
  };
}

export function toPublicClientQuote(quote: AthenaClientQuote): PublicClientQuote {
  return {
    id: quote.id,
    organizationId: quote.organization_id,
    status: quote.status,
    contentLanguage: quote.content_language,
    currencyCode: quote.currency_code,
    quoteNumber: quote.quote_number,
    issuedAt: quote.issued_at,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
    sourceEstimateId: preservedSourceEstimateId(quote),
    sourceEstimate: quote.source_estimate_snapshot,
    revisedFromQuoteId: quote.revised_from_quote_id,
    draft: quote.draft_json,
    issuedSnapshot: publicIssuedSnapshot(quote.issued_snapshot_json),
  };
}
