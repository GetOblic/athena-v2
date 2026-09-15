/**
 * Prospect → Client intelligence continuity (BIC-1).
 *
 * Copies only a normalized website URL and a sanitized website-intelligence
 * snapshot into a minimal untrained athena_identity. Conversion stays
 * zero-generation. Fill-empty / create-if-absent. Never overwrite trained
 * or processing Identity rows.
 *
 * Conversion authorization stays in licenseeProspectClientConversion.
 * This module is not a client→Prospect read API.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sanitizeReusableWebsiteIntelligence } from "@/services/getoblicDirectory/getoblicReusableWebsiteIntelligence";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";
import { websiteIntelligenceHasUsableContent } from "@/services/prospects/prospectWebsiteLearningPolicy";
import {
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  isDeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export const CONTINUITY_HYDRATION_FAILED = "CONTINUITY_HYDRATION_FAILED";

export const ATHENA_IDENTITY_HYDRATION_SELECT =
  "id, user_id, organization_id, website, website_intelligence, greeting_name, about_you, expertise, brain_status, brain_last_updated, master_profile, master_profile_version, master_profile_generated_at, last_deep_scrape_at, last_deep_scrape_pages" as const;

const OWNER_MEMBERSHIP_SELECT = "user_id, role" as const;

export type LicenseeProspectClientContinuityState =
  | "initialized"
  | "noop"
  | "incomplete";

export type HydrateLicenseeProspectClientIntelligenceInput = {
  clientOrganizationId: string;
  website?: string | null;
  websiteIntelligence?: unknown;
};

export type HydrateLicenseeProspectClientIntelligenceResult = {
  state: LicenseeProspectClientContinuityState;
  identityCreated: boolean;
  websiteFilled: boolean;
  websiteIntelligenceFilled: boolean;
};

export type HydrationIdentitySnapshot = {
  id: string;
  user_id: string;
  organization_id: string;
  website: string | null;
  website_intelligence: unknown;
  greeting_name: string | null;
  about_you: string | null;
  expertise: string | null;
  brain_status: string | null;
  brain_last_updated: string | null;
  master_profile: unknown;
  master_profile_version: string | null;
  master_profile_generated_at: string | null;
  last_deep_scrape_at: string | null;
  last_deep_scrape_pages: number | null;
};

export type UntrainedIdentityInsert = {
  user_id: string;
  organization_id: string;
  website: string | null;
  website_intelligence: Record<string, unknown> | null;
  greeting_name: null;
  about_you: null;
  expertise: null;
  brain_status: "pending";
  brain_last_updated: null;
  master_profile: null;
  master_profile_version: null;
  master_profile_generated_at: null;
  last_deep_scrape_at: null;
  last_deep_scrape_pages: null;
};

export type LicenseeProspectClientIntelligenceHydrationStore = {
  loadOwnerUserId(organizationId: string): Promise<string | null>;
  loadIdentity(input: {
    organizationId: string;
    userId: string;
  }): Promise<HydrationIdentitySnapshot | null>;
  insertUntrainedIdentity(row: UntrainedIdentityInsert): Promise<void>;
  updateEmptyIdentityFields(input: {
    identityId: string;
    organizationId: string;
    website?: string | null;
    websiteIntelligence?: Record<string, unknown> | null;
  }): Promise<void>;
};

const emptyResult = (
  state: LicenseeProspectClientContinuityState,
): HydrateLicenseeProspectClientIntelligenceResult => ({
  state,
  identityCreated: false,
  websiteFilled: false,
  websiteIntelligenceFilled: false,
});

export function isClientIdentityMutationBlocked(
  identity: Pick<
    HydrationIdentitySnapshot,
    "master_profile" | "brain_status"
  >,
): boolean {
  if (identity.master_profile != null) {
    return true;
  }
  return (
    identity.brain_status === "ready" || identity.brain_status === "processing"
  );
}

export function identityWebsiteIntelligenceIsProtected(
  value: unknown,
): boolean {
  if (isDeepWebsiteIntelligence(value)) {
    return true;
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).provider ===
      DEEP_WEBSITE_INTELLIGENCE_PROVIDER
  ) {
    return true;
  }
  return websiteIntelligenceHasUsableContent(
    value as Record<string, unknown> | null,
  );
}

export async function hydrateLicenseeProspectClientIntelligence(
  input: HydrateLicenseeProspectClientIntelligenceInput,
  store: LicenseeProspectClientIntelligenceHydrationStore = defaultHydrationStore,
): Promise<HydrateLicenseeProspectClientIntelligenceResult> {
  const clientOrganizationId = input.clientOrganizationId.trim();
  if (!clientOrganizationId) {
    return emptyResult("incomplete");
  }

  const normalizedWebsite = normalizeWebsiteUrl(input.website ?? null);
  const sanitizedIntelligence = sanitizeReusableWebsiteIntelligence(
    input.websiteIntelligence,
  );

  if (!normalizedWebsite && !sanitizedIntelligence) {
    return emptyResult("noop");
  }

  const ownerUserId = await store.loadOwnerUserId(clientOrganizationId);
  if (!ownerUserId) {
    return emptyResult("incomplete");
  }

  const existing = await store.loadIdentity({
    organizationId: clientOrganizationId,
    userId: ownerUserId,
  });

  if (!existing) {
    const row = buildUntrainedIdentityInsert({
      userId: ownerUserId,
      organizationId: clientOrganizationId,
      website: normalizedWebsite,
      websiteIntelligence: sanitizedIntelligence,
    });
    try {
      await store.insertUntrainedIdentity(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await store.loadIdentity({
          organizationId: clientOrganizationId,
          userId: ownerUserId,
        });
        if (raced) {
          return fillEmptyExistingIdentity({
            identity: raced,
            organizationId: clientOrganizationId,
            website: normalizedWebsite,
            websiteIntelligence: sanitizedIntelligence,
            store,
          });
        }
      }
      throw error;
    }
    return {
      state: "initialized",
      identityCreated: true,
      websiteFilled: Boolean(normalizedWebsite),
      websiteIntelligenceFilled: Boolean(sanitizedIntelligence),
    };
  }

  return fillEmptyExistingIdentity({
    identity: existing,
    organizationId: clientOrganizationId,
    website: normalizedWebsite,
    websiteIntelligence: sanitizedIntelligence,
    store,
  });
}

function buildUntrainedIdentityInsert(input: {
  userId: string;
  organizationId: string;
  website: string | null;
  websiteIntelligence: Record<string, unknown> | null;
}): UntrainedIdentityInsert {
  return {
    user_id: input.userId,
    organization_id: input.organizationId,
    website: input.website,
    website_intelligence: input.websiteIntelligence,
    greeting_name: null,
    about_you: null,
    expertise: null,
    brain_status: "pending",
    brain_last_updated: null,
    master_profile: null,
    master_profile_version: null,
    master_profile_generated_at: null,
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
  };
}

async function fillEmptyExistingIdentity(input: {
  identity: HydrationIdentitySnapshot;
  organizationId: string;
  website: string | null;
  websiteIntelligence: Record<string, unknown> | null;
  store: LicenseeProspectClientIntelligenceHydrationStore;
}): Promise<HydrateLicenseeProspectClientIntelligenceResult> {
  if (isClientIdentityMutationBlocked(input.identity)) {
    return emptyResult("noop");
  }

  const existingWebsite = normalizeWebsiteUrl(input.identity.website);
  const websiteFilled = !existingWebsite && Boolean(input.website);
  const websiteIntelligenceFilled =
    !identityWebsiteIntelligenceIsProtected(
      input.identity.website_intelligence,
    ) && Boolean(input.websiteIntelligence);

  if (!websiteFilled && !websiteIntelligenceFilled) {
    return emptyResult("noop");
  }

  await input.store.updateEmptyIdentityFields({
    identityId: input.identity.id,
    organizationId: input.organizationId,
    ...(websiteFilled ? { website: input.website } : {}),
    ...(websiteIntelligenceFilled
      ? { websiteIntelligence: input.websiteIntelligence }
      : {}),
  });

  return {
    state: "initialized",
    identityCreated: false,
    websiteFilled,
    websiteIntelligenceFilled,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return (error as { code?: string }).code === "23505";
}

export const defaultHydrationStore: LicenseeProspectClientIntelligenceHydrationStore =
  {
    loadOwnerUserId: loadClientOwnerUserId,
    loadIdentity: loadClientIdentity,
    insertUntrainedIdentity,
    updateEmptyIdentityFields,
  };

async function loadClientOwnerUserId(
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select(OWNER_MEMBERSHIP_SELECT)
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  const owners = (data ?? []).filter(
    (row) =>
      row &&
      row.role === "owner" &&
      typeof row.user_id === "string" &&
      row.user_id.trim(),
  );
  if (owners.length !== 1) {
    return null;
  }
  return String(owners[0].user_id);
}

async function loadClientIdentity(input: {
  organizationId: string;
  userId: string;
}): Promise<HydrationIdentitySnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .select(ATHENA_IDENTITY_HYDRATION_SELECT)
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapIdentitySnapshot(data as Record<string, unknown>);
}

async function insertUntrainedIdentity(
  row: UntrainedIdentityInsert,
): Promise<void> {
  const { error } = await supabaseAdmin.from("athena_identity").insert(row);
  if (error) {
    throw error;
  }
}

async function updateEmptyIdentityFields(input: {
  identityId: string;
  organizationId: string;
  website?: string | null;
  websiteIntelligence?: Record<string, unknown> | null;
}): Promise<void> {
  const values: Record<string, unknown> = {};
  if ("website" in input) {
    values.website = input.website ?? null;
  }
  if ("websiteIntelligence" in input) {
    values.website_intelligence = input.websiteIntelligence ?? null;
  }
  if (Object.keys(values).length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("athena_identity")
    .update(values)
    .eq("id", input.identityId)
    .eq("organization_id", input.organizationId);

  if (error) {
    throw error;
  }
}

function mapIdentitySnapshot(
  row: Record<string, unknown>,
): HydrationIdentitySnapshot | null {
  const id = readNonEmptyString(row.id);
  const userId = readNonEmptyString(row.user_id);
  const organizationId = readNonEmptyString(row.organization_id);
  if (!id || !userId || !organizationId) {
    return null;
  }
  return {
    id,
    user_id: userId,
    organization_id: organizationId,
    website: readNonEmptyString(row.website),
    website_intelligence: row.website_intelligence ?? null,
    greeting_name: readNonEmptyString(row.greeting_name),
    about_you: readNonEmptyString(row.about_you),
    expertise: readNonEmptyString(row.expertise),
    brain_status:
      typeof row.brain_status === "string" ? row.brain_status : null,
    brain_last_updated: readNonEmptyString(row.brain_last_updated),
    master_profile: row.master_profile ?? null,
    master_profile_version: readNonEmptyString(row.master_profile_version),
    master_profile_generated_at: readNonEmptyString(
      row.master_profile_generated_at,
    ),
    last_deep_scrape_at: readNonEmptyString(row.last_deep_scrape_at),
    last_deep_scrape_pages:
      typeof row.last_deep_scrape_pages === "number"
        ? row.last_deep_scrape_pages
        : null,
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
