/**
 * Prospect commercial-target helpers for Athena Estimates (V27 L13/L14).
 *
 * normalize / removed-target helpers are pure (no DB imports).
 * resolveAthenaEstimateProspectTarget performs org-bound identity resolution only —
 * it does NOT compose Prospect intelligence or generation context.
 *
 * Default Prospect fetch is lazy-imported so pure unit tests never load Supabase.
 *
 * L14/L15:
 * Creation resolves org-bound Prospect identity + snapshot only.
 * Generation-time intelligence composition lives in estimateProspectContextComposer.
 */

import {
  AthenaEstimateProspectTargetError,
} from "@/services/estimate/athenaEstimateTypes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fail-closed Prospect target resolution (missing / wrong-org / invalid id).
 * Intentionally opaque — do not leak whether the Prospect exists elsewhere.
 */
export class AthenaEstimateProspectResolutionError extends Error {
  readonly code = "PROSPECT_TARGET_UNAVAILABLE";

  constructor(message = "Prospect target is unavailable for this Estimate.") {
    super(message);
    this.name = "AthenaEstimateProspectResolutionError";
  }
}

export type AthenaEstimateProspectTarget = {
  prospectId: string | null;
  prospectBusinessNameSnapshot: string | null;
};

type ProspectIdentityRow = {
  id: string;
  business_name: string;
};

/**
 * Normalize optional Prospect target fields for queued Estimate creation.
 * Non-null prospectId requires a non-empty business-name snapshot.
 */
export function normalizeAthenaEstimateProspectTarget(input: {
  prospectId?: string | null;
  prospectBusinessNameSnapshot?: string | null;
}): AthenaEstimateProspectTarget {
  const prospectId =
    typeof input.prospectId === "string" && input.prospectId.trim()
      ? input.prospectId.trim()
      : null;
  const prospectBusinessNameSnapshot =
    typeof input.prospectBusinessNameSnapshot === "string" &&
    input.prospectBusinessNameSnapshot.trim()
      ? input.prospectBusinessNameSnapshot.trim()
      : null;

  if (prospectId && !prospectBusinessNameSnapshot) {
    throw new AthenaEstimateProspectTargetError();
  }

  return { prospectId, prospectBusinessNameSnapshot };
}

/**
 * Historical Prospect-targeted Estimate whose live prospect_id was SET NULL
 * after Prospect deletion (snapshot retained). Distinct from org-only
 * (both null).
 */
export function isRemovedAthenaEstimateProspectTarget(input: {
  prospectId?: string | null;
  prospectBusinessNameSnapshot?: string | null;
}): boolean {
  const prospectId =
    typeof input.prospectId === "string" && input.prospectId.trim()
      ? input.prospectId.trim()
      : null;
  const snapshot =
    typeof input.prospectBusinessNameSnapshot === "string" &&
    input.prospectBusinessNameSnapshot.trim()
      ? input.prospectBusinessNameSnapshot.trim()
      : null;
  return prospectId === null && snapshot !== null;
}

/**
 * Public DTO flag: Prospect was removed after targeting.
 * Deterministic: prospectId === null AND prospectBusinessNameSnapshot !== null.
 */
export function deriveAthenaEstimateProspectRemoved(input: {
  prospectId: string | null;
  prospectBusinessNameSnapshot: string | null;
}): boolean {
  return isRemovedAthenaEstimateProspectTarget(input);
}

export type ResolveAthenaEstimateProspectTargetDeps = {
  getProspectById?: (
    id: string,
    organizationId: string,
  ) => Promise<ProspectIdentityRow | null>;
};

/**
 * Server-side Prospect target resolver for an already-authorized organizationId.
 *
 * - prospectId absent/null → org-only target (no Prospect fetch)
 * - prospectId present → org-bound getProspectById; fail closed if missing
 * - business-name snapshot derived SERVER-SIDE from prospect.business_name
 * - never trusts a browser-supplied Prospect business name
 *
 * Does not fetch Prospect intelligence / generation context.
 */
export async function resolveAthenaEstimateProspectTarget(
  input: {
    organizationId: string;
    prospectId?: string | null;
  },
  deps?: ResolveAthenaEstimateProspectTargetDeps,
): Promise<AthenaEstimateProspectTarget> {
  const organizationId = input.organizationId.trim();
  if (!organizationId || !UUID_RE.test(organizationId)) {
    throw new AthenaEstimateProspectResolutionError(
      "organizationId must be a valid UUID.",
    );
  }

  const rawProspectId =
    typeof input.prospectId === "string" && input.prospectId.trim()
      ? input.prospectId.trim()
      : null;

  if (!rawProspectId) {
    return { prospectId: null, prospectBusinessNameSnapshot: null };
  }

  if (!UUID_RE.test(rawProspectId)) {
    throw new AthenaEstimateProspectResolutionError(
      "prospectId must be a valid UUID.",
    );
  }

  const fetchProspect =
    deps?.getProspectById ??
    (await import("@/services/prospects/prospectService")).getProspectById;

  const prospect = await fetchProspect(rawProspectId, organizationId);
  if (!prospect) {
    throw new AthenaEstimateProspectResolutionError();
  }

  const businessName =
    typeof prospect.business_name === "string"
      ? prospect.business_name.trim()
      : "";
  if (!businessName) {
    throw new AthenaEstimateProspectResolutionError();
  }

  return normalizeAthenaEstimateProspectTarget({
    prospectId: prospect.id,
    prospectBusinessNameSnapshot: businessName,
  });
}
