/**
 * Server-side quotation dependencies.
 * The service never constructs a Supabase client. Routes supply the
 * default adapter. Tests supply an in-memory adapter.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { OrganizationBrandFields } from "@/services/clientQuote/clientQuoteBrand";
import type { ClientQuoteOrganizationRecipient, ClientQuoteProspectRecipient } from "@/services/clientQuote/clientQuoteCustomer";
import type { OrganizationCommercialIdentity } from "@/services/clientQuote/clientQuoteIssuerProfile";
import type {
  AthenaClientQuote,
  ClientQuoteIssuedLogoSnapshot,
} from "@/services/clientQuote/clientQuoteTypes";

export type ClientQuoteMasterContext = {
  licenseeAccountId: string;
  masterUserId: string;
  defaultLanguage: OrganizationLanguage;
  ownCompanyOrganizationId: string | null;
};

export type ClientQuoteOrganizationRecord = OrganizationCommercialIdentity &
  OrganizationBrandFields &
  ClientQuoteOrganizationRecipient & {
    id: string;
    name: string;
    language?: string | null;
  };

export type ClientQuoteProspectRecord = ClientQuoteProspectRecipient & {
  id: string;
  organization_id: string;
};

/**
 * Ready-or-not Estimate row used only to authorize and seed.
 * prospect generation context is intentionally absent.
 */
export type ClientQuoteEstimateRecord = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
  organization_name_snapshot: string | null;
  /** Live Prospect target. Null after deletion and for organization-only Estimates. */
  prospect_id: string | null;
  /** Frozen at Estimate create. Retained after the Prospect is deleted. */
  prospect_business_name_snapshot: string | null;
  status: string;
  package_json: unknown;
};

export type ClientQuoteIssueWriteResult =
  | { ok: true; quote: AthenaClientQuote }
  | { ok: false; reason: "conflict" | "not_draft" };

export type ClientQuoteMaskWriteResult = {
  quote: AthenaClientQuote;
  alreadyMasked: boolean;
};

export type ClientQuoteDeps = {
  requireMaster(masterUserId: string): Promise<ClientQuoteMasterContext>;
  assertOwnsOrganization(input: {
    masterUserId: string;
    organizationId: string;
  }): Promise<{ licenseeAccountId: string }>;
  getEstimate(
    estimateId: string,
    licenseeAccountId: string,
  ): Promise<ClientQuoteEstimateRecord | null>;
  getOrganization(
    organizationId: string,
  ): Promise<ClientQuoteOrganizationRecord | null>;
  getProspect(
    prospectId: string,
    organizationId: string,
  ): Promise<ClientQuoteProspectRecord | null>;
  getIdentityWebsite(organizationId: string): Promise<string | null>;
  insertQuote(quote: AthenaClientQuote): Promise<AthenaClientQuote>;
  updateDraftQuote(quote: AthenaClientQuote): Promise<AthenaClientQuote | null>;
  issueQuote(quote: AthenaClientQuote): Promise<ClientQuoteIssueWriteResult>;
  getQuote(
    id: string,
    licenseeAccountId: string,
  ): Promise<AthenaClientQuote | null>;
  /** Active library only. Masked rows stay stored and out of this list. */
  listQuotes(licenseeAccountId: string): Promise<AthenaClientQuote[]>;
  /**
   * Soft-mask one owned quotation. A second call must not write again.
   * Does not delete the row, snapshot, number, estimate, or logo.
   */
  maskQuote(
    id: string,
    licenseeAccountId: string,
    deletedAt: string,
  ): Promise<ClientQuoteMaskWriteResult | null>;
  listQuoteNumbers(licenseeAccountId: string): Promise<string[]>;
  copyLogo(input: {
    sourceOrganizationId: string;
    sourcePath: string;
    quoteId: string;
  }): Promise<ClientQuoteIssuedLogoSnapshot>;
  removeLogo(storagePath: string, quoteId: string): Promise<void>;
  now(): string;
  newId(): string;
};
