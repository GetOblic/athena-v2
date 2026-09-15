/**
 * Browser-safe Licensee commercial-fee contracts.
 * Keep privileged DB / service-role access out of this module.
 */

export const LICENSEE_MONTHLY_FEE_LABEL = "Licensee Monthly Fee";
export const SUB_ACCOUNT_MONTHLY_FEE_LABEL = "Sub-Account Monthly Fee";

export type LicenseeCommercialFeeField =
  | "licenseeMonthlyFeeUsd"
  | "subAccountMonthlyFeeUsd";

export type LicenseeCommercialFees = {
  licenseeAccountId: string;
  masterEmail: string;
  licenseeMonthlyFeeUsd: number;
  subAccountMonthlyFeeUsd: number;
};

export function formatLicenseeCommercialFeeUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Coerce a stored Licensee commercial-fee value.
 * Missing or unreadable values default to 0.00.
 */
export function readStoredFeeUsd(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : Math.round(value * 100) / 100;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Object.is(parsed, -0) ? 0 : Math.round(parsed * 100) / 100;
    }
  }
  return 0;
}
