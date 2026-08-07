export type LicenseeHandoffAuditAction =
  | "open_sub_account"
  | "return_to_master";

export type LicenseeHandoffAuditEvent = {
  action: LicenseeHandoffAuditAction;
  success: boolean;
  masterUserId?: string | null;
  licenseeAccountId?: string | null;
  organizationId?: string | null;
  subAccountUserId?: string | null;
  reason?: string | null;
};

/**
 * Privileged handoff audit trail — server logs only.
 * Never log auth secrets, OTP values, or session credentials.
 */
export function logLicenseeHandoffAudit(event: LicenseeHandoffAuditEvent): void {
  console.info("[LICENSEE_HANDOFF]", {
    action: event.action,
    success: event.success,
    masterUserId: event.masterUserId ?? null,
    licenseeAccountId: event.licenseeAccountId ?? null,
    organizationId: event.organizationId ?? null,
    subAccountUserId: event.subAccountUserId ?? null,
    reason: event.reason ?? null,
    timestamp: new Date().toISOString(),
  });
}
