/**
 * One organization-scoped identity read for a discovery request.
 * The formatted context is prompt-only. It is not written to the catalog.
 */

import {
  COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FIELD_MAX_LENGTH,
  COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_MAX_LENGTH,
  COMMUNITY_DISCOVERY_IDENTITY_READ_TIMEOUT_MS,
} from "@/services/communityDiscovery/communityDiscoveryLimits";
import {
  BUSINESS_MODEL_FIELD_LABELS,
  readIdentityExecutiveIntelligence,
  type IdentityBusinessModelMap,
} from "@/services/identity/identityExecutiveIntelligence";

export const COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK =
  "No business identity is available. Use only the objective and each result. Do not invent the poster's business, credentials, audience, or location.";

const BUSINESS_CONTEXT_FIELDS = [
  "products_and_services",
  "positioning",
  "primary_audience",
  "value_proposition",
  "communication_style",
  "geographic_reach",
] as const satisfies readonly (keyof IdentityBusinessModelMap)[];

export const COMMUNITY_DISCOVERY_IDENTITY_COLUMNS =
  "organization_id, master_profile";

export type OrganizationIdentityTable = {
  select(columns: string): {
    order(
      column: string,
      options: { ascending: boolean },
    ): {
      limit(count: number): PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
};

export type OrganizationIdentityTableOpener = (
  organizationId: string,
) => OrganizationIdentityTable | Promise<OrganizationIdentityTable>;

function collapseContextText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

function clipContextText(value: string, maxLength: number): string {
  return Array.from(collapseContextText(value)).slice(0, maxLength).join("").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function businessModelFromProfile(masterProfile: unknown): IdentityBusinessModelMap {
  const profile = asRecord(masterProfile);
  const executive = readIdentityExecutiveIntelligence(profile);
  if (executive) return executive.business_model;

  const rawModel = asRecord(asRecord(profile?.executive_intelligence)?.business_model);
  if (!rawModel) return {};
  const model: IdentityBusinessModelMap = {};
  for (const key of BUSINESS_CONTEXT_FIELDS) {
    const value = rawModel[key];
    if (typeof value !== "string") continue;
    const text = collapseContextText(value);
    if (text) model[key] = text;
  }
  return model;
}

/**
 * Services, positioning, audience, value, style, and geography only.
 * Other Brain fields stay out of the prompt.
 */
export function formatCommunityDiscoveryBusinessContext(masterProfile: unknown): string {
  const model = businessModelFromProfile(masterProfile);
  const lines: string[] = [];
  for (const key of BUSINESS_CONTEXT_FIELDS) {
    const value = model[key];
    if (typeof value !== "string") continue;
    const text = clipContextText(
      value,
      COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FIELD_MAX_LENGTH,
    );
    if (!text) continue;
    lines.push(`${BUSINESS_MODEL_FIELD_LABELS[key]}: ${text}`);
  }
  if (lines.length === 0) return COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;
  return clipContextText(
    lines.join("\n"),
    COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_MAX_LENGTH,
  );
}

export function boundCommunityDiscoveryBusinessContext(value: unknown): string {
  if (typeof value !== "string") return COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;
  const clipped = clipContextText(value, COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_MAX_LENGTH);
  return clipped || COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;
}

export function communityBusinessContextHasFacts(context: string): boolean {
  const trimmed = context.trim();
  return (
    trimmed.length > 0 && trimmed !== COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK
  );
}

function contextFromIdentityRow(
  organizationId: string,
  row: unknown,
): string {
  const record = asRecord(row);
  if (!record || record.organization_id !== organizationId) {
    return COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;
  }
  return formatCommunityDiscoveryBusinessContext(record.master_profile);
}

async function openOrganizationIdentityTable(
  organizationId: string,
): Promise<OrganizationIdentityTable> {
  const { createTenantScope } = await import("@/lib/tenantDatabase");
  return createTenantScope(organizationId).from(
    "athena_identity",
  ) as unknown as OrganizationIdentityTable;
}

/**
 * One select for the organization. The newest identity row wins.
 * Missing, mismatched, or failed reads use the fallback.
 */
export async function readCommunityDiscoveryBusinessContext(
  organizationId: string,
  openTable: OrganizationIdentityTableOpener = openOrganizationIdentityTable,
): Promise<string> {
  try {
    const table = await openTable(organizationId);
    const { data, error } = await table
      .select(COMMUNITY_DISCOVERY_IDENTITY_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) {
      console.error("[ATHENA_COMMUNITY_DISCOVERY] identity_unavailable");
      return COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;
    }
    const rows = Array.isArray(data) ? data.slice(0, 1) : [];
    return contextFromIdentityRow(organizationId, rows[0]);
  } catch {
    console.error("[ATHENA_COMMUNITY_DISCOVERY] identity_unavailable");
    return COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;
  }
}

export async function readBusinessContextWithinBudget(input: {
  organizationId: string;
  read: (organizationId: string) => Promise<string>;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = input.timeoutMs ?? COMMUNITY_DISCOVERY_IDENTITY_READ_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const readPromise = input
    .read(input.organizationId)
    .then((value) => boundCommunityDiscoveryBusinessContext(value))
    .catch(() => COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK);
  try {
    return await Promise.race([
      readPromise,
      new Promise<string>((resolve) => {
        timer = setTimeout(() => {
          resolve(COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
