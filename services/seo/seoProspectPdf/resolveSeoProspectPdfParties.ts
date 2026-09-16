import type { LicenseeAccount } from "@/services/licensee/licenseeIdentity";
import type { Organization } from "@/services/organizationService";
import type {
  SeoProspectPdfParties,
} from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";

export type SeoProspectPdfPartyOrganization = Pick<Organization, "id" | "name">;

export type SeoProspectPdfPartyLicensee = Pick<
  LicenseeAccount,
  "id" | "own_company_organization_id"
>;

export type SeoProspectPdfPartyDeps = {
  getOrganizationById: (
    organizationId: string,
  ) => Promise<SeoProspectPdfPartyOrganization | null>;
  isLicenseeOwnCompanyOrganization: (organizationId: string) => Promise<boolean>;
  listLicenseeAccountsForSubAccountOrganization: (
    organizationId: string,
  ) => Promise<SeoProspectPdfPartyLicensee[]>;
};

function organizationName(organization: SeoProspectPdfPartyOrganization): string {
  const name = organization.name.trim();
  return name || "Organization";
}

function isMissingLicenseeRelationError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message?.toLowerCase() || "";
  return (
    message.includes("licensee_accounts") ||
    message.includes("licensee_sub_accounts")
  );
}

export async function listLicenseeAccountsForSubAccountOrganization(
  organizationId: string,
): Promise<LicenseeAccount[]> {
  const id = organizationId.trim();
  if (!id) return [];

  const [{ supabaseAdmin }, { getLicenseeAccountById }] = await Promise.all([
    import("@/lib/supabaseAdmin"),
    import("@/services/licensee/licenseeIdentity"),
  ]);

  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("licensee_account_id")
    .eq("organization_id", id);

  if (error) {
    if (!isMissingLicenseeRelationError(error)) {
      console.error(
        "[SEO_PROSPECT_PDF] licensee_relationship_lookup_failed",
        error,
      );
    }
    return [];
  }

  const licenseeIds = [
    ...new Set(
      (data ?? [])
        .map((row) =>
          typeof row.licensee_account_id === "string"
            ? row.licensee_account_id
            : "",
        )
        .filter(Boolean),
    ),
  ];

  const accounts: LicenseeAccount[] = [];
  for (const licenseeId of licenseeIds) {
    const account = await getLicenseeAccountById(licenseeId);
    if (account) accounts.push(account);
  }
  return accounts;
}

async function defaultPartyDeps(): Promise<SeoProspectPdfPartyDeps> {
  const [
    { getOrganizationById },
    { isLicenseeOwnCompanyOrganization },
  ] = await Promise.all([
    import("@/services/organizationService"),
    import("@/services/licensee/licenseeIdentity"),
  ]);

  return {
    getOrganizationById,
    isLicenseeOwnCompanyOrganization,
    listLicenseeAccountsForSubAccountOrganization,
  };
}

/**
 * Deterministic sender/subject resolution for prospect PDFs.
 * Never accepts a client-supplied sender organization id.
 */
export async function resolveSeoProspectPdfParties(
  currentOrganizationId: string,
  deps?: SeoProspectPdfPartyDeps,
): Promise<SeoProspectPdfParties> {
  const resolved = deps ?? (await defaultPartyDeps());
  const organizationId = currentOrganizationId.trim();
  const subjectOrg = organizationId
    ? await resolved.getOrganizationById(organizationId)
    : null;
  if (!subjectOrg) {
    throw new Error("SEO prospect PDF subject organization was not found.");
  }

  const subject = {
    organizationId: subjectOrg.id,
    name: organizationName(subjectOrg),
  };

  const asCurrent = (): SeoProspectPdfParties => ({
    subject,
    sender: subject,
  });

  if (await resolved.isLicenseeOwnCompanyOrganization(subject.organizationId)) {
    return asCurrent();
  }

  const licensees =
    await resolved.listLicenseeAccountsForSubAccountOrganization(
      subject.organizationId,
    );
  if (licensees.length !== 1) {
    return asCurrent();
  }

  const ownCompanyId = licensees[0]?.own_company_organization_id?.trim() ?? "";
  if (!ownCompanyId || ownCompanyId === subject.organizationId) {
    return asCurrent();
  }

  const designated = await resolved.isLicenseeOwnCompanyOrganization(ownCompanyId);
  if (!designated) {
    return asCurrent();
  }

  const senderOrg = await resolved.getOrganizationById(ownCompanyId);
  if (!senderOrg) {
    return asCurrent();
  }

  return {
    subject,
    sender: {
      organizationId: senderOrg.id,
      name: organizationName(senderOrg),
    },
  };
}
