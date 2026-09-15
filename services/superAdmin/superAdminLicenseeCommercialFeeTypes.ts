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
