import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SuperAdminAuditAction =
  | "create_athena_account"
  | "create_licensee_master"
  | "deactivate_account"
  | "reactivate_account";

export type SuperAdminAuditAccountType = "athena" | "licensee";

export type SuperAdminAuditEvent = {
  actorUserId: string;
  action: SuperAdminAuditAction;
  targetUserId?: string | null;
  targetEmail?: string | null;
  accountType?: SuperAdminAuditAccountType | null;
  metadata?: Record<string, unknown> | null;
  success: boolean;
  reason?: string | null;
};

/**
 * Minimal durable Super Admin audit + console trail.
 * Never logs secrets, OTP codes, or session tokens.
 */
export async function logSuperAdminAudit(
  event: SuperAdminAuditEvent,
): Promise<void> {
  const timestamp = new Date().toISOString();

  console.info("[GETOBLIC_SUPER_ADMIN]", {
    action: event.action,
    success: event.success,
    actorUserId: event.actorUserId,
    targetUserId: event.targetUserId ?? null,
    targetEmail: event.targetEmail ?? null,
    accountType: event.accountType ?? null,
    reason: event.reason ?? null,
    timestamp,
  });

  if (!event.success) {
    return;
  }

  const { error } = await supabaseAdmin.from("getoblic_super_admin_audit").insert({
    actor_user_id: event.actorUserId,
    action: event.action,
    target_user_id: event.targetUserId ?? null,
    target_email: event.targetEmail ?? null,
    account_type: event.accountType ?? null,
    metadata: event.metadata ?? null,
    created_at: timestamp,
  });

  if (error) {
    console.error("getoblic_super_admin_audit insert failed:", error);
  }
}
