/**
 * Licensee Master quotation service (EST-QUOTE-1C.3).
 * licensee_account_id always comes from the authenticated Master.
 * Totals are recalculated by the domain layer. Client totals are ignored.
 * Issued rows are immutable. A revision is a new draft.
 * No worker, model, PDF, or tenant handoff.
 */

import { freezeOrganizationBrand, organizationLogoPath } from "@/services/clientQuote/clientQuoteBrand";
import {
  mapOrganizationToCustomerSnapshot,
  mapProspectToCustomerSnapshot,
  mapRemovedProspectSnapshotToCustomerSnapshot,
} from "@/services/clientQuote/clientQuoteCustomer";
import type {
  ClientQuoteDeps,
  ClientQuoteEstimateRecord,
  ClientQuoteMasterContext,
  ClientQuoteOrganizationRecord,
} from "@/services/clientQuote/clientQuoteDeps";
import {
  clientQuoteEstimateNotReady,
  clientQuoteEstimatePackageInvalid,
  clientQuoteInvalid,
  clientQuoteInvalidTransition,
  clientQuoteIssuedImmutable,
  clientQuoteIssuerIncomplete,
  clientQuoteLogoCopyFailed,
  clientQuoteNotFound,
  clientQuoteNotIssuable,
  clientQuoteNumberExhausted,
  clientQuotePersistenceFailed,
  clientQuoteRecipientUnavailable,
  ClientQuoteOperationError,
} from "@/services/clientQuote/clientQuoteErrors";
import { mapOrganizationCommercialIdentityToDraftIssuerSnapshot } from "@/services/clientQuote/clientQuoteIssuerProfile";
import {
  createDraftClientQuote,
  issueClientQuote,
  reviseIssuedClientQuote,
  updateDraftClientQuote,
} from "@/services/clientQuote/clientQuoteLifecycle";
import {
  CLIENT_QUOTE_NUMBER_ATTEMPTS,
  formatClientQuoteNumber,
  nextClientQuoteSequence,
  quoteNumberYear,
} from "@/services/clientQuote/clientQuoteNumber";
import { seedClientQuoteFromReadyEstimate } from "@/services/clientQuote/clientQuoteSeed";
import {
  ClientQuoteLifecycleError,
  ClientQuoteValidationError,
  IssuedClientQuoteImmutableError,
  emptyClientQuotePostalAddress,
  type AthenaClientQuote,
  type ClientQuoteIssuedBrandSnapshot,
  type ClientQuoteIssuedLogoSnapshot,
  type ClientQuoteIssuerSnapshot,
} from "@/services/clientQuote/clientQuoteTypes";
import { assertClientQuoteIssuable } from "@/services/clientQuote/clientQuoteValidation";
import {
  OrganizationLanguageInvalidError,
  parseOrganizationLanguage,
  resolveOrganizationLanguageValue,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

function emptyIssuer(): ClientQuoteIssuerSnapshot {
  return {
    legalName: "",
    tradingName: null,
    postalAddress: emptyClientQuotePostalAddress(),
    phone: null,
    email: null,
    website: null,
    registrationNumber: null,
    taxIdentifier: null,
    taxIdentifierLabel: null,
    contactName: null,
    jobTitle: null,
    additionalNote: null,
  };
}

function isLicenseeAccessError(error: unknown): boolean {
  return error instanceof Error && error.name === "LicenseeAccessError";
}

function asOperationError(error: unknown): never {
  if (error instanceof ClientQuoteOperationError) throw error;
  if (error instanceof IssuedClientQuoteImmutableError) {
    throw clientQuoteIssuedImmutable();
  }
  if (error instanceof ClientQuoteLifecycleError) {
    throw clientQuoteInvalidTransition(error.message);
  }
  if (error instanceof ClientQuoteValidationError) {
    throw clientQuoteInvalid(error.details[0] ?? error.message);
  }
  throw error;
}

async function discardLogo(
  deps: ClientQuoteDeps,
  storagePath: string | null,
  quoteId: string,
) {
  if (!storagePath) return;
  try {
    await deps.removeLogo(storagePath, quoteId);
  } catch (error) {
    console.error("[CLIENT_QUOTE] logo_cleanup_failed", error);
  }
}

async function loadIssuer(
  master: ClientQuoteMasterContext,
  deps: ClientQuoteDeps,
): Promise<ClientQuoteIssuerSnapshot> {
  const ownCompanyId = master.ownCompanyOrganizationId?.trim() || null;
  if (!ownCompanyId) return emptyIssuer();
  try {
    const owned = await deps.assertOwnsOrganization({
      masterUserId: master.masterUserId,
      organizationId: ownCompanyId,
    });
    if (owned.licenseeAccountId !== master.licenseeAccountId) return emptyIssuer();
  } catch (error) {
    if (isLicenseeAccessError(error)) return emptyIssuer();
    throw error;
  }
  const organization = await deps.getOrganization(ownCompanyId);
  if (!organization || organization.id !== ownCompanyId) return emptyIssuer();
  const website = await deps.getIdentityWebsite(ownCompanyId);
  return mapOrganizationCommercialIdentityToDraftIssuerSnapshot(organization, website);
}

async function loadOwnCompanyBrand(
  master: ClientQuoteMasterContext,
  deps: ClientQuoteDeps,
): Promise<ClientQuoteOrganizationRecord | null> {
  const ownCompanyId = master.ownCompanyOrganizationId?.trim() || null;
  if (!ownCompanyId) return null;
  try {
    const owned = await deps.assertOwnsOrganization({
      masterUserId: master.masterUserId,
      organizationId: ownCompanyId,
    });
    if (owned.licenseeAccountId !== master.licenseeAccountId) return null;
  } catch (error) {
    if (isLicenseeAccessError(error)) return null;
    throw error;
  }
  const organization = await deps.getOrganization(ownCompanyId);
  if (!organization || organization.id !== ownCompanyId) return null;
  return organization;
}

function estimateHasLiveProspect(estimate: ClientQuoteEstimateRecord): boolean {
  return typeof estimate.prospect_id === "string" && estimate.prospect_id.trim().length > 0;
}

/** Deleted Prospect: no live id, but the frozen business name is still present. */
function estimateHasRemovedProspect(estimate: ClientQuoteEstimateRecord): boolean {
  if (estimateHasLiveProspect(estimate)) return false;
  return (
    typeof estimate.prospect_business_name_snapshot === "string" &&
    estimate.prospect_business_name_snapshot.trim().length > 0
  );
}

function resolveContentLanguage(
  requested: unknown,
  organizationLanguage: unknown,
  fallback: OrganizationLanguage,
): OrganizationLanguage {
  if (requested != null && requested !== "") {
    try {
      return parseOrganizationLanguage(requested);
    } catch (error) {
      if (error instanceof OrganizationLanguageInvalidError) {
        throw clientQuoteInvalid("contentLanguage must be one of en, fr, es, it, de, pt.");
      }
      throw error;
    }
  }
  if (organizationLanguage != null && organizationLanguage !== "") {
    return resolveOrganizationLanguageValue(organizationLanguage);
  }
  return fallback;
}

function activeOwnedQuote(
  quote: AthenaClientQuote | null,
  licenseeAccountId: string,
): AthenaClientQuote | null {
  if (!quote || quote.licensee_account_id !== licenseeAccountId || quote.deleted_at) {
    return null;
  }
  return quote;
}

export async function listClientQuotesForMaster(
  masterUserId: string,
  deps: ClientQuoteDeps,
): Promise<AthenaClientQuote[]> {
  const master = await deps.requireMaster(masterUserId);
  const quotes = await deps.listQuotes(master.licenseeAccountId);
  return quotes.filter(
    (quote) =>
      quote.licensee_account_id === master.licenseeAccountId && !quote.deleted_at,
  );
}

export async function getClientQuoteForMaster(input: {
  masterUserId: string;
  quoteId: string;
  deps: ClientQuoteDeps;
}): Promise<AthenaClientQuote> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const quote = activeOwnedQuote(
    await input.deps.getQuote(input.quoteId, master.licenseeAccountId),
    master.licenseeAccountId,
  );
  if (!quote) throw clientQuoteNotFound("Quotation not found.");
  return quote;
}

export async function maskClientQuoteForMaster(input: {
  masterUserId: string;
  quoteId: string;
  deps: ClientQuoteDeps;
}): Promise<{ quote: AthenaClientQuote; alreadyMasked: boolean }> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const masked = await input.deps.maskQuote(
    input.quoteId,
    master.licenseeAccountId,
    input.deps.now(),
  );
  if (!masked || masked.quote.licensee_account_id !== master.licenseeAccountId) {
    throw clientQuoteNotFound("Quotation not found.");
  }
  return masked;
}

export async function createClientQuoteDraftForMaster(input: {
  masterUserId: string;
  estimateId: string;
  recipient:
    | { kind: "prospect"; prospectId: string }
    | { kind: "removedProspect" }
    | { kind: "client" };
  contentLanguage?: unknown;
  deps: ClientQuoteDeps;
}): Promise<AthenaClientQuote> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const estimate = await input.deps.getEstimate(
    input.estimateId,
    master.licenseeAccountId,
  );
  if (!estimate || estimate.licensee_account_id !== master.licenseeAccountId) {
    throw clientQuoteNotFound("Estimate not found.");
  }
  const owned = await input.deps.assertOwnsOrganization({
    masterUserId: master.masterUserId,
    organizationId: estimate.organization_id,
  });
  if (owned.licenseeAccountId !== master.licenseeAccountId) {
    throw clientQuoteNotFound("Estimate not found.");
  }
  if (estimate.status !== "Ready") {
    throw clientQuoteEstimateNotReady();
  }

  const organization = await input.deps.getOrganization(estimate.organization_id);
  if (!organization || organization.id !== estimate.organization_id) {
    throw clientQuoteRecipientUnavailable();
  }

  let customer;
  if (input.recipient.kind === "prospect") {
    const prospect = await input.deps.getProspect(
      input.recipient.prospectId,
      estimate.organization_id,
    );
    if (!prospect || prospect.organization_id !== estimate.organization_id) {
      throw clientQuoteRecipientUnavailable();
    }
    customer = mapProspectToCustomerSnapshot(prospect);
  } else if (input.recipient.kind === "removedProspect") {
    if (estimateHasLiveProspect(estimate)) {
      throw clientQuoteRecipientUnavailable();
    }
    customer = mapRemovedProspectSnapshotToCustomerSnapshot(
      estimate.prospect_business_name_snapshot,
    );
  } else if (estimateHasRemovedProspect(estimate)) {
    throw clientQuoteRecipientUnavailable();
  } else {
    customer = mapOrganizationToCustomerSnapshot(organization);
  }
  if (!customer) throw clientQuoteRecipientUnavailable();

  const issuer = await loadIssuer(master, input.deps);
  const contentLanguage = resolveContentLanguage(
    input.contentLanguage,
    organization.language,
    master.defaultLanguage,
  );

  let seeded;
  try {
    seeded = seedClientQuoteFromReadyEstimate({
      estimateId: estimate.id,
      organizationId: estimate.organization_id,
      organizationNameSnapshot: estimate.organization_name_snapshot,
      estimatePackage: estimate.package_json as never,
      issuer,
      customer,
    });
  } catch (error) {
    if (error instanceof ClientQuoteValidationError) {
      const detail = error.details[0] ?? error.message;
      if (
        /estimatePackage|recommendedClientPrice|scopeInterpretation|schemaVersion|currency/i.test(
          detail,
        )
      ) {
        throw clientQuoteEstimatePackageInvalid();
      }
      throw clientQuoteInvalid(detail);
    }
    throw error;
  }

  let draft;
  try {
    draft = createDraftClientQuote({
      id: input.deps.newId(),
      licenseeAccountId: master.licenseeAccountId,
      organizationId: estimate.organization_id,
      requestedBy: master.masterUserId,
      contentLanguage,
      currencyCode: seeded.currencyCode,
      draft: seeded.draft,
      sourceEstimateId: estimate.id,
      sourceEstimateSnapshot: seeded.sourceEstimateSnapshot,
      revisedFromQuoteId: null,
      createdAt: input.deps.now(),
    });
  } catch (error) {
    asOperationError(error);
  }
  return input.deps.insertQuote(draft);
}

export async function updateClientQuoteDraftForMaster(input: {
  masterUserId: string;
  quoteId: string;
  draft: unknown;
  contentLanguage?: unknown;
  /**
   * Explicit USD/EUR denomination change. Omitted means keep the stored
   * currency, including historical ISO codes. Line prices are not converted.
   */
  currencyCode?: unknown;
  deps: ClientQuoteDeps;
}): Promise<AthenaClientQuote> {
  const current = await getClientQuoteForMaster({
    masterUserId: input.masterUserId,
    quoteId: input.quoteId,
    deps: input.deps,
  });
  if (current.status !== "draft") throw clientQuoteIssuedImmutable();
  let next: AthenaClientQuote;
  try {
    next = updateDraftClientQuote(current, input.draft, {
      updatedAt: input.deps.now(),
      contentLanguage: input.contentLanguage,
      currencyCode: input.currencyCode,
    });
  } catch (error) {
    asOperationError(error);
  }
  if (
    next.licensee_account_id !== current.licensee_account_id ||
    next.organization_id !== current.organization_id
  ) {
    throw clientQuoteInvalid("Quotation authority fields cannot be changed.");
  }
  if (next.currency_code !== current.currency_code) {
    const approved =
      typeof input.currencyCode === "string"
        ? input.currencyCode.trim().toUpperCase()
        : "";
    if (approved !== next.currency_code) {
      throw clientQuoteInvalid("Quotation authority fields cannot be changed.");
    }
  }
  const saved = await input.deps.updateDraftQuote(next);
  if (!saved) throw clientQuoteIssuedImmutable();
  return saved;
}

async function copyIssuedLogo(
  quoteId: string,
  organization: ClientQuoteOrganizationRecord | null,
  deps: ClientQuoteDeps,
): Promise<ClientQuoteIssuedLogoSnapshot | null> {
  const sourcePath = organizationLogoPath(organization);
  if (!sourcePath || !organization) return null;
  try {
    return await deps.copyLogo({
      sourceOrganizationId: organization.id,
      sourcePath,
      quoteId,
    });
  } catch (error) {
    console.error("[CLIENT_QUOTE] logo_copy_failed", error);
    throw clientQuoteLogoCopyFailed();
  }
}

async function assignIssuedQuote(
  quote: AthenaClientQuote,
  brand: ClientQuoteIssuedBrandSnapshot,
  copiedLogoPath: string | null,
  deps: ClientQuoteDeps,
): Promise<AthenaClientQuote> {
  const issuedAt = deps.now();
  const year = quoteNumberYear(issuedAt);
  let sequence = nextClientQuoteSequence(
    await deps.listQuoteNumbers(quote.licensee_account_id),
    year,
  );
  for (let attempt = 0; attempt < CLIENT_QUOTE_NUMBER_ATTEMPTS; attempt += 1) {
    const quoteNumber = formatClientQuoteNumber(year, sequence);
    let issued: AthenaClientQuote;
    try {
      issued = issueClientQuote(quote, {
        quoteNumber,
        issuedAt,
        updatedAt: issuedAt,
        brand,
      });
    } catch (error) {
      await discardLogo(deps, copiedLogoPath, quote.id);
      asOperationError(error);
    }
    let write;
    try {
      write = await deps.issueQuote(issued);
    } catch (error) {
      await discardLogo(deps, copiedLogoPath, quote.id);
      if (error instanceof ClientQuoteOperationError) throw error;
      throw clientQuotePersistenceFailed("Could not issue the quotation.");
    }
    if (write.ok) return write.quote;
    if (write.reason === "not_draft") {
      let current: AthenaClientQuote | null;
      try {
        current = await deps.getQuote(quote.id, quote.licensee_account_id);
      } catch (error) {
        await discardLogo(deps, copiedLogoPath, quote.id);
        throw error;
      }
      const storedLogo = current?.issued_snapshot_json?.brand.logo?.storagePath ?? null;
      if (copiedLogoPath && copiedLogoPath !== storedLogo) {
        await discardLogo(deps, copiedLogoPath, quote.id);
      }
      if (current?.deleted_at) throw clientQuoteNotFound("Quotation not found.");
      if (current?.status === "issued") return current;
      throw clientQuoteIssuedImmutable();
    }
    const latest = nextClientQuoteSequence(
      await deps.listQuoteNumbers(quote.licensee_account_id),
      year,
    );
    sequence = Math.max(sequence + 1, latest);
  }
  await discardLogo(deps, copiedLogoPath, quote.id);
  throw clientQuoteNumberExhausted();
}

export async function issueClientQuoteForMaster(input: {
  masterUserId: string;
  quoteId: string;
  deps: ClientQuoteDeps;
}): Promise<AthenaClientQuote> {
  const quote = await getClientQuoteForMaster({
    masterUserId: input.masterUserId,
    quoteId: input.quoteId,
    deps: input.deps,
  });
  if (quote.status === "issued") return quote;
  try {
    assertClientQuoteIssuable(quote.draft_json);
  } catch (error) {
    if (error instanceof ClientQuoteValidationError) {
      const detail = error.details.join(" ");
      if (/issuer\.legalName/i.test(detail)) throw clientQuoteIssuerIncomplete();
      throw clientQuoteNotIssuable(error.details[0] ?? error.message);
    }
    throw error;
  }

  const master = await input.deps.requireMaster(input.masterUserId);
  const ownCompany = await loadOwnCompanyBrand(master, input.deps);
  const logo = await copyIssuedLogo(quote.id, ownCompany, input.deps);
  const copiedLogoPath = logo?.storagePath ?? null;
  let brand: ClientQuoteIssuedBrandSnapshot;
  try {
    brand = freezeOrganizationBrand({ brand: ownCompany, logo });
  } catch (error) {
    await discardLogo(input.deps, copiedLogoPath, quote.id);
    if (error instanceof ClientQuoteValidationError) throw clientQuoteLogoCopyFailed();
    throw error;
  }

  let latest: AthenaClientQuote | null;
  try {
    latest = await input.deps.getQuote(quote.id, quote.licensee_account_id);
  } catch (error) {
    await discardLogo(input.deps, copiedLogoPath, quote.id);
    throw error;
  }
  if (
    !latest ||
    latest.licensee_account_id !== quote.licensee_account_id ||
    latest.deleted_at
  ) {
    await discardLogo(input.deps, copiedLogoPath, quote.id);
    throw clientQuoteNotFound("Quotation not found.");
  }
  if (latest.status === "issued") {
    const storedLogo = latest.issued_snapshot_json?.brand.logo?.storagePath ?? null;
    if (copiedLogoPath && copiedLogoPath !== storedLogo) {
      await discardLogo(input.deps, copiedLogoPath, quote.id);
    }
    return latest;
  }
  try {
    assertClientQuoteIssuable(latest.draft_json);
  } catch (error) {
    await discardLogo(input.deps, copiedLogoPath, quote.id);
    if (error instanceof ClientQuoteValidationError) {
      const detail = error.details.join(" ");
      if (/issuer\.legalName/i.test(detail)) throw clientQuoteIssuerIncomplete();
      throw clientQuoteNotIssuable(error.details[0] ?? error.message);
    }
    throw error;
  }
  return assignIssuedQuote(latest, brand, copiedLogoPath, input.deps);
}

export async function reviseClientQuoteForMaster(input: {
  masterUserId: string;
  quoteId: string;
  deps: ClientQuoteDeps;
}): Promise<AthenaClientQuote> {
  const quote = await getClientQuoteForMaster({
    masterUserId: input.masterUserId,
    quoteId: input.quoteId,
    deps: input.deps,
  });
  let revision: AthenaClientQuote;
  try {
    revision = reviseIssuedClientQuote(quote, {
      id: input.deps.newId(),
      createdAt: input.deps.now(),
    });
  } catch (error) {
    asOperationError(error);
  }
  if (revision.id === quote.id || revision.revised_from_quote_id !== quote.id) {
    throw clientQuoteInvalidTransition("Revision could not be created.");
  }
  const saved = await input.deps.insertQuote(revision);
  const original = await input.deps.getQuote(quote.id, quote.licensee_account_id);
  if (!original || original.status !== "issued" || original.quote_number !== quote.quote_number) {
    throw clientQuoteInvalidTransition("The issued quotation changed during revision.");
  }
  return saved;
}
