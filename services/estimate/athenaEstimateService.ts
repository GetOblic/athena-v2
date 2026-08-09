/**
 * Licensee-account-scoped Athena Estimate persistence.
 * Ownership always comes from trusted server licensee_account_id — never the client.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapAthenaEstimateRow } from "@/services/estimate/athenaEstimateMappers";
import type {
  AthenaEstimate,
  EstimateRequest,
} from "@/services/estimate/athenaEstimateTypes";
import { resolveLicenseeSubAccountTitle } from "@/services/licensee/licenseeSubAccountTypes";

export type { AthenaEstimate } from "@/services/estimate/athenaEstimateTypes";
export { mapAthenaEstimateRow } from "@/services/estimate/athenaEstimateMappers";

export class AthenaEstimateNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "Estimate not found.") {
    super(message);
    this.name = "AthenaEstimateNotFoundError";
  }
}

function touch(): string {
  return new Date().toISOString();
}

export async function listAthenaEstimatesForLicensee(
  licenseeAccountId: string,
): Promise<AthenaEstimate[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_estimates")
    .select("*")
    .eq("licensee_account_id", licenseeAccountId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ATHENA_ESTIMATE] list_failed", {
      licenseeAccountId,
      error: error.message,
    });
    throw new Error("Failed to load Estimates.");
  }

  return (data ?? []).map((row) =>
    mapAthenaEstimateRow(row as Record<string, unknown>),
  );
}

export async function getAthenaEstimateByIdForLicensee(
  id: string,
  licenseeAccountId: string,
): Promise<AthenaEstimate | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_estimates")
    .select("*")
    .eq("id", id)
    .eq("licensee_account_id", licenseeAccountId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_ESTIMATE] get_failed", {
      id,
      licenseeAccountId,
      error: error.message,
    });
    return null;
  }
  if (!data) return null;
  return mapAthenaEstimateRow(data as Record<string, unknown>);
}

/**
 * Live relationshipConnected for historical reads.
 * Informational only — not a permission gate for reading Master-owned history.
 */
export async function getEstimateRelationshipConnected(input: {
  licenseeAccountId: string;
  organizationId: string;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id")
    .eq("licensee_account_id", input.licenseeAccountId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_ESTIMATE] relationship_lookup_failed", {
      licenseeAccountId: input.licenseeAccountId,
      organizationId: input.organizationId,
      error: error.message,
    });
    return false;
  }
  return Boolean(data?.id);
}

/**
 * Batch relationshipConnected for list responses.
 * Avoids N+1 and never loads tenant intelligence.
 */
export async function getEstimateRelationshipConnectedMap(input: {
  licenseeAccountId: string;
  organizationIds: string[];
}): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const uniqueIds = Array.from(
    new Set(input.organizationIds.map((id) => id.trim()).filter(Boolean)),
  );
  for (const id of uniqueIds) {
    result.set(id, false);
  }
  if (uniqueIds.length === 0) {
    return result;
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("organization_id")
    .eq("licensee_account_id", input.licenseeAccountId)
    .in("organization_id", uniqueIds);

  if (error) {
    console.error("[ATHENA_ESTIMATE] relationship_batch_failed", {
      licenseeAccountId: input.licenseeAccountId,
      error: error.message,
    });
    return result;
  }

  for (const row of data ?? []) {
    const organizationId = String(
      (row as { organization_id?: string }).organization_id ?? "",
    );
    if (organizationId) {
      result.set(organizationId, true);
    }
  }
  return result;
}

/**
 * Freeze the Licensee-facing title at Estimate creation time.
 * Same semantics as Master dashboard/sub-account selector:
 * trim(licensee_sub_accounts.display_name) || organizations.name
 *
 * Scoped to the authorized licensee_account_id + organization_id relationship
 * so another Master's alias for the same org cannot leak in.
 * Fail closed if that relationship (or org name) cannot be resolved.
 */
export async function loadOrganizationNameSnapshot(input: {
  licenseeAccountId: string;
  organizationId: string;
}): Promise<string> {
  const licenseeAccountId = input.licenseeAccountId.trim();
  const organizationId = input.organizationId.trim();

  if (!licenseeAccountId || !organizationId) {
    throw new Error(
      "Authorized Licensee relationship could not be resolved for Estimate name snapshot.",
    );
  }

  const { data: relationship, error: relationshipError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("display_name")
    .eq("licensee_account_id", licenseeAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (relationshipError) {
    console.error("[ATHENA_ESTIMATE] snapshot_relationship_lookup_failed", {
      licenseeAccountId,
      organizationId,
      error: relationshipError.message,
    });
    throw new Error(
      "Failed to resolve Estimate organization name snapshot.",
    );
  }

  if (!relationship) {
    throw new Error(
      "Authorized Licensee relationship could not be resolved for Estimate name snapshot.",
    );
  }

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError) {
    console.error("[ATHENA_ESTIMATE] org_name_lookup_failed", {
      organizationId,
      error: organizationError.message,
    });
    throw new Error(
      "Failed to resolve Estimate organization name snapshot.",
    );
  }

  if (!organization) {
    throw new Error(
      "Organization could not be resolved for Estimate name snapshot.",
    );
  }

  const organizationName =
    typeof organization.name === "string" && organization.name.trim()
      ? organization.name.trim()
      : "";
  const displayName =
    typeof relationship.display_name === "string"
      ? relationship.display_name
      : null;

  return resolveLicenseeSubAccountTitle({
    displayName,
    name: organizationName || "Organization",
  });
}

export async function createQueuedAthenaEstimate(input: {
  licenseeAccountId: string;
  organizationId: string;
  requestedBy: string | null;
  organizationNameSnapshot: string;
  request: EstimateRequest;
}): Promise<AthenaEstimate> {
  const now = touch();

  const { data, error } = await supabaseAdmin
    .from("athena_estimates")
    .insert({
      licensee_account_id: input.licenseeAccountId,
      organization_id: input.organizationId,
      requested_by: input.requestedBy,
      organization_name_snapshot: input.organizationNameSnapshot,
      request_json: input.request,
      status: "Queued",
      generation_stage: null,
      package_json: null,
      error_code: null,
      error_message: null,
      currency_code: null,
      geography_label: null,
      currency_resolution: null,
      instruction_config_key: null,
      instruction_revision_id: null,
      instruction_configured: false,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[ATHENA_ESTIMATE] create_failed", {
      licenseeAccountId: input.licenseeAccountId,
      organizationId: input.organizationId,
      error: error?.message,
    });
    throw new Error("Failed to create Estimate.");
  }

  return mapAthenaEstimateRow(data as Record<string, unknown>);
}

/**
 * Compensating update when job enqueue fails after Estimate insert.
 * Mirrors SEO/Ads mark*EnqueueFailed — keeps the row as Processing Failed.
 */
export async function markAthenaEstimateEnqueueFailed(input: {
  estimateId: string;
  licenseeAccountId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await supabaseAdmin
    .from("athena_estimates")
    .update({
      status: "Processing Failed",
      generation_stage: "failed",
      package_json: null,
      error_code: input.errorCode.slice(0, 120),
      error_message: input.errorMessage.slice(0, 1000),
      updated_at: touch(),
    })
    .eq("id", input.estimateId)
    .eq("licensee_account_id", input.licenseeAccountId);
}
