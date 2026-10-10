/**
 * Licensee GetOblic Links authorization.
 *
 * My Company is resolved only from licensee_accounts.own_company_organization_id
 * for the authenticated Master. Callers must not pass a client or managed-client
 * organization id. The Worker client and its API key are unchanged.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";
import { requireLicenseeMasterAccount } from "@/services/licensee/licenseeSubAccounts";

const ORGANIZATION_SELECTION_KEYS = [
  "organizationId",
  "organization_id",
  "clientOrganizationId",
  "client_organization_id",
  "own_company_organization_id",
] as const;

export class LicenseeGetOblicLinksAccessError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LicenseeGetOblicLinksAccessError";
    this.status = status;
    this.code = code;
  }
}

export type LicenseeGetOblicLinksContext = {
  userId: string;
  organizationId: string;
};

export type LicenseeGetOblicLinksAccessDeps = {
  getUserId: () => Promise<string | null>;
  requireMaster: (
    userId: string,
  ) => Promise<{ own_company_organization_id: string | null }>;
};

const defaultDeps: LicenseeGetOblicLinksAccessDeps = {
  async getUserId() {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  },
  requireMaster(userId) {
    return requireLicenseeMasterAccount(userId);
  },
};

/**
 * Authenticated Licensee Master with an active account and a designated
 * My Company. Inactive Masters fail inside requireLicenseeMasterAccount.
 */
export async function requireLicenseeGetOblicLinksAccess(
  deps: LicenseeGetOblicLinksAccessDeps = defaultDeps,
): Promise<LicenseeGetOblicLinksContext> {
  const userId = (await deps.getUserId())?.trim() ?? "";
  if (!userId) {
    throw new LicenseeGetOblicLinksAccessError(
      401,
      "UNAUTHORIZED",
      "Authentication required.",
    );
  }

  let account: { own_company_organization_id: string | null };
  try {
    account = await deps.requireMaster(userId);
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      throw new LicenseeGetOblicLinksAccessError(
        403,
        "FORBIDDEN",
        "Licensee Master access required.",
      );
    }
    throw error;
  }

  const organizationId = account.own_company_organization_id?.trim() ?? "";
  if (!organizationId) {
    throw new LicenseeGetOblicLinksAccessError(
      403,
      "OWN_COMPANY_REQUIRED",
      "Designate My Company before using GetOblic Links.",
    );
  }

  return { userId, organizationId };
}

/**
 * Reject a caller-selected organization. My Company is not chosen from the
 * query string or JSON body.
 */
export function assertNoLicenseeGetOblicOrganizationSelection(
  request: Request,
  body?: unknown,
): void {
  const url = new URL(request.url);
  for (const key of ORGANIZATION_SELECTION_KEYS) {
    if (url.searchParams.has(key)) {
      throw new LicenseeGetOblicLinksAccessError(
        400,
        "ORGANIZATION_SELECTION_REJECTED",
        "GetOblic Links uses My Company only.",
      );
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return;
  }

  const record = body as Record<string, unknown>;
  for (const key of ORGANIZATION_SELECTION_KEYS) {
    if (key in record) {
      throw new LicenseeGetOblicLinksAccessError(
        400,
        "ORGANIZATION_SELECTION_REJECTED",
        "GetOblic Links uses My Company only.",
      );
    }
  }
}
