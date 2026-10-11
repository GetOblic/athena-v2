/**
 * Browser-safe Licensee unclaimed GetOblic prospecting contracts.
 * Keep privileged DB / service-role access out of this module.
 */

export const UNCLAIMED_GETOBLIC_PROSPECTING_LABEL =
  "Allow unclaimed GetOblic prospecting";

export const UNCLAIMED_GETOBLIC_PROSPECTING_SUPPORTING_COPY =
  "Internal GetOblic access. Allows the Licensee's Own Company to add unlimited unclaimed Prospects and send Description or Knowledge Base without claiming listings.";

export type LicenseeUnclaimedGetoblicProspectingSetting = {
  licenseeAccountId: string;
  masterEmail: string;
  allowUnclaimedGetoblicProspecting: boolean;
};
