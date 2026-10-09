/**
 * Service-role persistence for athena_client_quotes.
 * licensee_account_id is always the argument from the authenticated Master.
 * Logo bytes are copied inside client-brand-assets, outside identity/logo.
 */

import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertBrandLogoPathForOrganization,
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_MAX_BYTES,
  isAllowedBrandLogoMimeType,
  type BrandLogoMimeType,
} from "@/services/identity/brandIdentity";
import type {
  ClientQuoteDeps,
  ClientQuoteEstimateRecord,
  ClientQuoteMaskWriteResult,
  ClientQuoteOrganizationRecord,
  ClientQuoteProspectRecord,
} from "@/services/clientQuote/clientQuoteDeps";
import { clientQuotePersistenceFailed } from "@/services/clientQuote/clientQuoteErrors";
import { maskAthenaClientQuote } from "@/services/clientQuote/clientQuoteLifecycle";
import {
  assertClientQuoteLogoRemovalPath,
  buildClientQuoteLogoObjectPath,
} from "@/services/clientQuote/clientQuoteLogo";
import type {
  AthenaClientQuote,
  ClientQuoteDraftV1,
  ClientQuoteIssuedSnapshotV1,
  ClientQuoteLogoMimeType,
  ClientQuoteSourceEstimateSnapshot,
  ClientQuoteStatus,
} from "@/services/clientQuote/clientQuoteTypes";
import { assertLicenseeOwnsSubAccount } from "@/services/licensee/licenseeIdentity";
import { requireLicenseeMasterAccount } from "@/services/licensee/licenseeSubAccounts";
import { getAthenaEstimateByIdForLicensee } from "@/services/estimate/athenaEstimateService";
import { getOrganizationById } from "@/services/organizationService";
import { resolveOrganizationLanguageValue } from "@/services/organizationLanguage";
import { getProspectById } from "@/services/prospects/prospectService";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message ?? "");
}

function asUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw clientQuotePersistenceFailed();
  }
  return value.trim().toLowerCase();
}

function asOptionalUuid(value: unknown): string | null {
  if (value == null) return null;
  return asUuid(value);
}

function asTimestamp(value: unknown): string {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw clientQuotePersistenceFailed();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw clientQuotePersistenceFailed();
  return date.toISOString();
}

function asOptionalTimestamp(value: unknown): string | null {
  if (value == null) return null;
  return asTimestamp(value);
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function mapAthenaClientQuoteRow(row: Record<string, unknown>): AthenaClientQuote {
  const status = row.status;
  if (status !== "draft" && status !== "issued") {
    throw clientQuotePersistenceFailed();
  }
  const draft = asJsonObject(row.draft_json);
  if (!draft || draft.schemaVersion !== "client_quote_draft_v1") {
    throw clientQuotePersistenceFailed();
  }
  const issued = asJsonObject(row.issued_snapshot_json);
  if (issued && issued.schemaVersion !== "client_quote_issued_v1") {
    throw clientQuotePersistenceFailed();
  }
  const source = asJsonObject(row.source_estimate_snapshot);
  if (source && source.schemaVersion !== "client_quote_source_estimate_v1") {
    throw clientQuotePersistenceFailed();
  }
  const quoteStatus = status as ClientQuoteStatus;
  return {
    id: asUuid(row.id),
    licensee_account_id: asUuid(row.licensee_account_id),
    organization_id: asUuid(row.organization_id),
    requested_by: asOptionalUuid(row.requested_by),
    source_estimate_id: asOptionalUuid(row.source_estimate_id),
    source_estimate_snapshot: source as ClientQuoteSourceEstimateSnapshot | null,
    revised_from_quote_id: asOptionalUuid(row.revised_from_quote_id),
    status: quoteStatus,
    content_language: resolveOrganizationLanguageValue(row.content_language),
    currency_code: typeof row.currency_code === "string" ? row.currency_code : "",
    draft_json: draft as unknown as ClientQuoteDraftV1,
    issued_snapshot_json: issued as ClientQuoteIssuedSnapshotV1 | null,
    quote_number: typeof row.quote_number === "string" ? row.quote_number : null,
    issued_at: asOptionalTimestamp(row.issued_at),
    deleted_at: asOptionalTimestamp(row.deleted_at),
    created_at: asTimestamp(row.created_at),
    updated_at: asTimestamp(row.updated_at),
  };
}

function toWriteRow(quote: AthenaClientQuote): Record<string, unknown> {
  return {
    id: quote.id,
    licensee_account_id: quote.licensee_account_id,
    organization_id: quote.organization_id,
    requested_by: quote.requested_by,
    source_estimate_id: quote.source_estimate_id,
    source_estimate_snapshot: quote.source_estimate_snapshot,
    revised_from_quote_id: quote.revised_from_quote_id,
    status: quote.status,
    content_language: quote.content_language,
    currency_code: quote.currency_code,
    draft_json: quote.draft_json,
    issued_snapshot_json: quote.issued_snapshot_json,
    quote_number: quote.quote_number,
    issued_at: quote.issued_at,
    created_at: quote.created_at,
    updated_at: quote.updated_at,
  };
}

function mimeFromLogoPath(path: string): BrandLogoMimeType | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

async function copyQuoteLogo(input: {
  sourceOrganizationId: string;
  sourcePath: string;
  quoteId: string;
}): Promise<{
  storagePath: string;
  mimeType: ClientQuoteLogoMimeType;
  contentHash: string;
}> {
  const source = assertBrandLogoPathForOrganization(
    input.sourcePath,
    input.sourceOrganizationId,
  );
  const downloaded = await supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).download(source);
  if (downloaded.error || !downloaded.data) {
    console.error("[CLIENT_QUOTE] logo_download_failed", downloaded.error);
    throw new Error("Could not download the organization logo.");
  }
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > BRAND_LOGO_MAX_BYTES) {
    throw new Error("Organization logo is empty or too large.");
  }
  const blobType = downloaded.data.type;
  const mime = isAllowedBrandLogoMimeType(blobType)
    ? blobType
    : mimeFromLogoPath(source);
  if (!mime) throw new Error("Organization logo type is not supported.");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const storagePath = buildClientQuoteLogoObjectPath({
    quoteId: input.quoteId,
    mimeType: mime,
    objectId: randomUUID(),
  });
  const uploaded = await supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploaded.error) {
    console.error("[CLIENT_QUOTE] logo_upload_failed", uploaded.error);
    throw new Error("Could not store the quotation logo.");
  }
  return { storagePath, mimeType: mime, contentHash };
}

async function removeQuoteLogo(storagePath: string, quoteId: string): Promise<void> {
  const path = assertClientQuoteLogoRemovalPath(storagePath, quoteId);
  const removed = await supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).remove([path]);
  if (removed.error) {
    console.error("[CLIENT_QUOTE] logo_remove_failed", removed.error);
    throw new Error("Could not remove the quotation logo.");
  }
}

async function loadOwnedQuote(
  id: string,
  licenseeAccountId: string,
): Promise<AthenaClientQuote | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_client_quotes")
    .select("*")
    .eq("id", id)
    .eq("licensee_account_id", licenseeAccountId)
    .maybeSingle();
  if (error) {
    console.error("[CLIENT_QUOTE] get_failed", error);
    throw clientQuotePersistenceFailed("Could not load the quotation.");
  }
  if (!data) return null;
  return mapAthenaClientQuoteRow(data as Record<string, unknown>);
}

export function createDefaultClientQuoteDeps(): ClientQuoteDeps {
  return {
    async requireMaster(masterUserId) {
      const account = await requireLicenseeMasterAccount(masterUserId);
      return {
        licenseeAccountId: account.id,
        masterUserId,
        defaultLanguage: account.default_language,
        ownCompanyOrganizationId: account.own_company_organization_id,
      };
    },
    async assertOwnsOrganization(input) {
      const owned = await assertLicenseeOwnsSubAccount(input);
      return { licenseeAccountId: owned.licenseeAccountId };
    },
    async getEstimate(estimateId, licenseeAccountId) {
      const estimate = await getAthenaEstimateByIdForLicensee(
        estimateId,
        licenseeAccountId,
      );
      if (!estimate) return null;
      const record: ClientQuoteEstimateRecord = {
        id: estimate.id,
        licensee_account_id: estimate.licensee_account_id,
        organization_id: estimate.organization_id,
        organization_name_snapshot: estimate.organization_name_snapshot,
        prospect_id: estimate.prospect_id,
        prospect_business_name_snapshot: estimate.prospect_business_name_snapshot,
        status: estimate.status,
        package_json: estimate.package_json,
      };
      return record;
    },
    async getOrganization(organizationId) {
      const organization = await getOrganizationById(organizationId);
      return organization as ClientQuoteOrganizationRecord | null;
    },
    async getProspect(prospectId, organizationId) {
      const prospect = await getProspectById(prospectId, organizationId);
      if (!prospect) return null;
      const record: ClientQuoteProspectRecord = {
        id: prospect.id,
        organization_id: prospect.organization_id,
        business_name: prospect.business_name,
        legal_name: prospect.legal_name,
        address: prospect.address,
        address_line2: prospect.address_line2,
        city: prospect.city,
        state: prospect.state,
        postal_code: prospect.postal_code,
        country: prospect.country,
        phone: prospect.phone,
        email: prospect.email,
        decision_maker: prospect.decision_maker,
        job_title: prospect.job_title,
        tax_identifier: prospect.tax_identifier,
      };
      return record;
    },
    async getIdentityWebsite(organizationId) {
      const { data, error } = await supabaseAdmin
        .from("athena_identity")
        .select("website")
        .eq("organization_id", organizationId);
      if (error) {
        console.error("[CLIENT_QUOTE] identity_website_failed", error);
        return null;
      }
      for (const row of data ?? []) {
        if (typeof row.website === "string" && row.website.trim()) {
          return row.website.trim();
        }
      }
      return null;
    },
    async insertQuote(quote) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quotes")
        .insert(toWriteRow(quote))
        .select("*")
        .single();
      if (error || !data) {
        console.error("[CLIENT_QUOTE] insert_failed", error);
        throw clientQuotePersistenceFailed();
      }
      return mapAthenaClientQuoteRow(data as Record<string, unknown>);
    },
    async updateDraftQuote(quote) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quotes")
        .update({
          content_language: quote.content_language,
          currency_code: quote.currency_code,
          draft_json: quote.draft_json,
          issued_snapshot_json: null,
          quote_number: null,
          issued_at: null,
          updated_at: quote.updated_at,
        })
        .eq("id", quote.id)
        .eq("licensee_account_id", quote.licensee_account_id)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_QUOTE] update_failed", error);
        throw clientQuotePersistenceFailed();
      }
      if (!data) return null;
      return mapAthenaClientQuoteRow(data as Record<string, unknown>);
    },
    async issueQuote(quote) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quotes")
        .update({
          status: "issued",
          content_language: quote.content_language,
          currency_code: quote.currency_code,
          draft_json: quote.draft_json,
          issued_snapshot_json: quote.issued_snapshot_json,
          quote_number: quote.quote_number,
          issued_at: quote.issued_at,
          updated_at: quote.updated_at,
        })
        .eq("id", quote.id)
        .eq("licensee_account_id", quote.licensee_account_id)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (isUniqueViolation(error)) return { ok: false, reason: "conflict" };
      if (error) {
        console.error("[CLIENT_QUOTE] issue_failed", error);
        throw clientQuotePersistenceFailed("Could not issue the quotation.");
      }
      if (!data) return { ok: false, reason: "not_draft" };
      return {
        ok: true,
        quote: mapAthenaClientQuoteRow(data as Record<string, unknown>),
      };
    },
    async getQuote(id, licenseeAccountId) {
      return loadOwnedQuote(id, licenseeAccountId);
    },
    async listQuotes(licenseeAccountId) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quotes")
        .select("*")
        .eq("licensee_account_id", licenseeAccountId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[CLIENT_QUOTE] list_failed", error);
        throw clientQuotePersistenceFailed("Could not list quotations.");
      }
      return (data ?? [])
        .map((row) => mapAthenaClientQuoteRow(row as Record<string, unknown>))
        .filter((quote) => !quote.deleted_at);
    },
    async maskQuote(id, licenseeAccountId, deletedAt) {
      const current = await loadOwnedQuote(id, licenseeAccountId);
      if (!current) return null;
      const decision = maskAthenaClientQuote(current, deletedAt);
      if (decision.alreadyMasked) {
        return { quote: decision.quote, alreadyMasked: true };
      }
      const { data, error } = await supabaseAdmin
        .from("athena_client_quotes")
        .update({
          deleted_at: decision.quote.deleted_at,
          updated_at: decision.quote.updated_at,
        })
        .eq("id", current.id)
        .eq("licensee_account_id", licenseeAccountId)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("[CLIENT_QUOTE] mask_failed", error);
        throw clientQuotePersistenceFailed(
          "Could not remove the quotation from the library.",
        );
      }
      if (!data) {
        const again = await loadOwnedQuote(id, licenseeAccountId);
        if (again?.deleted_at) {
          return { quote: again, alreadyMasked: true };
        }
        return null;
      }
      const masked: ClientQuoteMaskWriteResult = {
        quote: mapAthenaClientQuoteRow(data as Record<string, unknown>),
        alreadyMasked: false,
      };
      return masked;
    },
    async listQuoteNumbers(licenseeAccountId) {
      const { data, error } = await supabaseAdmin
        .from("athena_client_quotes")
        .select("quote_number")
        .eq("licensee_account_id", licenseeAccountId)
        .not("quote_number", "is", null);
      if (error) {
        console.error("[CLIENT_QUOTE] numbers_failed", error);
        throw clientQuotePersistenceFailed("Could not assign a quote number.");
      }
      return (data ?? [])
        .map((row) => row.quote_number)
        .filter((value): value is string => typeof value === "string");
    },
    copyLogo: copyQuoteLogo,
    removeLogo: removeQuoteLogo,
    now() {
      return new Date().toISOString();
    },
    newId() {
      return randomUUID();
    },
  };
}
