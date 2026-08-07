import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AccountAccessStatusValue = "active" | "deactivated";

export type AccountAccessStatusRow = {
  user_id: string;
  status: AccountAccessStatusValue;
  updated_at: string;
  updated_by: string | null;
};

export class AccountAccessDeniedError extends Error {
  code = "ACCOUNT_DEACTIVATED";

  constructor(message = "This account has been deactivated.") {
    super(message);
    this.name = "AccountAccessDeniedError";
  }
}

/** Long-lived Auth ban used with application-level deactivation. */
export const ACCOUNT_ACCESS_BAN_DURATION = "876000h";

function isMissingAccessStatusRelationError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "PGRST205" || error.code === "42P01") {
    return true;
  }

  const message = error.message?.toLowerCase() || "";
  return message.includes("account_access_status");
}

/**
 * Missing row means active (existing pre-V24 accounts remain usable).
 * Only an explicit deactivated row fails closed.
 */
export async function getAccountAccessStatus(
  userId: string,
): Promise<AccountAccessStatusValue> {
  const id = userId.trim();
  if (!id) {
    return "active";
  }

  const { data, error } = await supabaseAdmin
    .from("account_access_status")
    .select("status")
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingAccessStatusRelationError(error)) {
      return "active";
    }
    console.error("account_access_status lookup failed:", error);
    // Fail closed on unexpected lookup errors for protected paths.
    throw new AccountAccessDeniedError(
      "Account access status could not be verified.",
    );
  }

  if (data?.status === "deactivated") {
    return "deactivated";
  }

  return "active";
}

export async function isAccountAccessActive(userId: string): Promise<boolean> {
  return (await getAccountAccessStatus(userId)) === "active";
}

export async function assertAccountAccessActive(userId: string): Promise<void> {
  if (!(await isAccountAccessActive(userId))) {
    throw new AccountAccessDeniedError();
  }
}

export async function ensureAccountAccessActive(input: {
  userId: string;
  updatedBy?: string | null;
}): Promise<void> {
  const userId = input.userId.trim();
  if (!userId) {
    throw new Error("userId is required for account access status.");
  }

  const { error } = await supabaseAdmin.from("account_access_status").upsert(
    {
      user_id: userId,
      status: "active",
      updated_at: new Date().toISOString(),
      updated_by: input.updatedBy?.trim() || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (isMissingAccessStatusRelationError(error)) {
      throw new Error(
        "account_access_status table is not available. Apply the V24 migration.",
      );
    }
    throw new Error(error.message || "Failed to set account access active.");
  }
}

export async function setAccountAccessDeactivated(input: {
  userId: string;
  updatedBy: string;
}): Promise<void> {
  const userId = input.userId.trim();
  const updatedBy = input.updatedBy.trim();
  if (!userId || !updatedBy) {
    throw new Error("userId and updatedBy are required.");
  }

  const { error } = await supabaseAdmin.from("account_access_status").upsert(
    {
      user_id: userId,
      status: "deactivated",
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (isMissingAccessStatusRelationError(error)) {
      throw new Error(
        "account_access_status table is not available. Apply the V24 migration.",
      );
    }
    throw new Error(error.message || "Failed to deactivate account access.");
  }
}

/**
 * Whether Supabase Auth currently treats the user as banned.
 * Used by deactivate/reactivate reconciliation (idempotent convergence).
 */
export async function isAuthUserBanned(userId: string): Promise<boolean> {
  const id = userId.trim();
  if (!id) {
    throw new Error("userId is required to inspect auth ban state.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
  if (error || !data.user) {
    throw new Error(error?.message || "Failed to resolve auth user ban state.");
  }

  const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
  if (!bannedUntil) {
    return false;
  }

  const untilMs = Date.parse(bannedUntil);
  if (Number.isNaN(untilMs)) {
    // Non-empty banned_until that cannot be parsed — treat as banned fail-closed.
    return true;
  }

  return untilMs > Date.now();
}

/**
 * Auth Admin ban paired with account_access_status deactivation.
 * Does not delete auth identity or tenant data.
 */
export async function banAuthUser(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: ACCOUNT_ACCESS_BAN_DURATION,
  });
  if (error) {
    throw new Error(error.message || "Failed to ban auth user.");
  }
}

export async function unbanAuthUser(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (error) {
    throw new Error(error.message || "Failed to unban auth user.");
  }
}
