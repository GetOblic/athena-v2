import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logLicenseeHandoffAudit } from "@/services/licensee/licenseeAuditLog";
import {
  LicenseeAccessError,
  getLicenseeAccountByUserId,
  resolveAuthorizedSubAccountHandoff,
} from "@/services/licensee/licenseeIdentity";
import {
  buildLicenseeOriginCookieValue,
  parseLicenseeOriginCookieValue,
} from "@/services/licensee/licenseeOriginCookie";
import {
  AccountAccessDeniedError,
  assertAccountAccessActive,
} from "@/services/superAdmin/accountAccessStatus";

export {
  LICENSEE_ORIGIN_COOKIE,
  applyLicenseeOriginCookie,
  buildLicenseeOriginCookieValue,
  clearLicenseeOriginCookie,
  parseLicenseeOriginCookieValue,
} from "@/services/licensee/licenseeOriginCookie";

export {
  LICENSEE_HANDOFF_CLEAR_STORAGE_KEYS,
  LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES,
} from "@/services/licensee/licenseeHandoffStorageKeys";

/**
 * Establish a standard Supabase SSR session for an existing auth user
 * without sending email and without OTP UI interaction.
 *
 * Confirmed installed primitive (@supabase/auth-js 2.110.0):
 *   supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })
 *   → properties.hashed_token
 *   createSupabaseServerClient().auth.verifyOtp({ token_hash, type: 'magiclink' })
 *   → sets normal SSR auth cookies
 */
export async function establishSupabaseSessionForEmail(email: string): Promise<{
  userId: string;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new LicenseeAccessError("Missing auth email for session establishment.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (error || !data?.properties?.hashed_token) {
    throw new LicenseeAccessError(
      error?.message || "Failed to generate session handoff token.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError || !verified.user?.id) {
    throw new LicenseeAccessError(
      verifyError?.message || "Failed to establish handoff session.",
    );
  }

  return { userId: verified.user.id };
}

/**
 * Master → Sub-account session handoff.
 * Authorization completes before any session replacement.
 * Replaces the current Supabase session cookies with the sub-account owner session.
 */
export async function handoffMasterToSubAccount(input: {
  masterUserId: string;
  organizationId: string;
}): Promise<{
  ownerUserId: string;
  organizationId: string;
  licenseeAccountId: string;
  originCookieValue: string;
}> {
  let licenseeAccountId: string | null = null;

  try {
    const authorized = await resolveAuthorizedSubAccountHandoff(input);
    licenseeAccountId = authorized.licenseeAccountId;

    // Origin cookie is prepared before session switch; applied by the route after success.
    const originCookieValue = buildLicenseeOriginCookieValue({
      masterUserId: input.masterUserId,
      licenseeAccountId: authorized.licenseeAccountId,
      organizationId: authorized.organizationId,
    });

    const session = await establishSupabaseSessionForEmail(authorized.ownerEmail);

    if (session.userId !== authorized.ownerUserId) {
      throw new LicenseeAccessError(
        "Handoff session user did not match authorized sub-account owner.",
      );
    }

    logLicenseeHandoffAudit({
      action: "open_sub_account",
      success: true,
      masterUserId: input.masterUserId,
      licenseeAccountId: authorized.licenseeAccountId,
      organizationId: authorized.organizationId,
      subAccountUserId: session.userId,
    });

    return {
      ownerUserId: session.userId,
      organizationId: authorized.organizationId,
      licenseeAccountId: authorized.licenseeAccountId,
      originCookieValue,
    };
  } catch (error) {
    logLicenseeHandoffAudit({
      action: "open_sub_account",
      success: false,
      masterUserId: input.masterUserId,
      licenseeAccountId,
      organizationId: input.organizationId,
      reason: error instanceof Error ? error.message : "Handoff failed.",
    });
    throw error;
  }
}

/**
 * Sub-account → Master restoration using a signed Master-origin cookie.
 * Does not store Supabase access/refresh tokens in the custom cookie.
 * Re-establishes Master session via admin generateLink + verifyOtp.
 */
export async function restoreMasterFromOriginCookie(
  originCookieValue: string | undefined | null,
): Promise<{ masterUserId: string; licenseeAccountId: string; organizationId: string }> {
  const origin = parseLicenseeOriginCookieValue(originCookieValue);
  if (!origin) {
    logLicenseeHandoffAudit({
      action: "return_to_master",
      success: false,
      reason: "Master-origin context is missing or invalid.",
    });
    throw new LicenseeAccessError("Master-origin context is missing or invalid.");
  }

  try {
    const licenseeAccount = await getLicenseeAccountByUserId(origin.masterUserId);
    if (!licenseeAccount || licenseeAccount.id !== origin.licenseeAccountId) {
      throw new LicenseeAccessError("Master-origin context is no longer valid.");
    }

    // Back-to-Master must not restore a deactivated Master.
    try {
      await assertAccountAccessActive(origin.masterUserId);
    } catch (error) {
      if (error instanceof AccountAccessDeniedError) {
        throw new LicenseeAccessError(error.message);
      }
      throw error;
    }

    const { data: relationship, error: relationshipError } = await supabaseAdmin
      .from("licensee_sub_accounts")
      .select("id")
      .eq("licensee_account_id", origin.licenseeAccountId)
      .eq("organization_id", origin.organizationId)
      .maybeSingle();

    if (relationshipError || !relationship) {
      throw new LicenseeAccessError(
        "Master-origin relationship is no longer valid.",
      );
    }

    const session = await establishSupabaseSessionForEmail(licenseeAccount.email);
    if (session.userId !== origin.masterUserId) {
      throw new LicenseeAccessError("Restored session did not match Master user.");
    }

    logLicenseeHandoffAudit({
      action: "return_to_master",
      success: true,
      masterUserId: session.userId,
      licenseeAccountId: licenseeAccount.id,
      organizationId: origin.organizationId,
    });

    return {
      masterUserId: session.userId,
      licenseeAccountId: licenseeAccount.id,
      organizationId: origin.organizationId,
    };
  } catch (error) {
    logLicenseeHandoffAudit({
      action: "return_to_master",
      success: false,
      masterUserId: origin.masterUserId,
      licenseeAccountId: origin.licenseeAccountId,
      organizationId: origin.organizationId,
      reason: error instanceof Error ? error.message : "Restore failed.",
    });
    throw error;
  }
}
