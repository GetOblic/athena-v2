import type { FormEvent, ReactNode } from "react";
import { SuperAdminCreateAccountPanel } from "@/components/superAdmin/SuperAdminCreateAccountPanel";
import { SuperAdminLicenseeCard } from "@/components/superAdmin/SuperAdminLicenseeCard";
import type { SuperAdminLicenseeView } from "@/lib/superAdmin/superAdminDashboardView";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type SuperAdminLicenseeDirectoryProps = {
  licensees: SuperAdminLicenseeView[];
  pending: boolean;
  onCreateSubmit: (event: FormEvent) => void | Promise<void>;
  createFields: ReactNode;
  feeDrafts: Record<
    string,
    { licenseeMonthlyFeeUsd: string; subAccountMonthlyFeeUsd: string }
  >;
  savingFeeKey: string | null;
  onFeeDraftChange: (
    licenseeAccountId: string,
    field: "licenseeMonthlyFeeUsd" | "subAccountMonthlyFeeUsd",
    value: string,
  ) => void;
  onSaveFee: (
    licenseeAccountId: string,
    field: "licenseeMonthlyFeeUsd" | "subAccountMonthlyFeeUsd",
  ) => void;
  languageDrafts: Record<string, OrganizationLanguage>;
  savingLanguageKey: string | null;
  onLanguageDraftChange: (
    licenseeAccountId: string,
    value: OrganizationLanguage,
  ) => void;
  onSaveDefaultLanguage: (licenseeAccountId: string) => void;
  onSetAccess: (userId: string, action: "deactivate" | "reactivate") => void;
  allowanceDrafts: Record<string, string>;
  accountEmailDrafts: Record<string, string>;
  accountWordpressUserIdDrafts: Record<string, string>;
  savingAllocationKey: string | null;
  savingAccountKey: string | null;
  allocationKeyFor: (row: SuperAdminLicenseeView["subAccounts"][number]) => string;
  onCapacityDraftChange: (
    row: SuperAdminLicenseeView["subAccounts"][number],
    value: string,
  ) => void;
  onEmailDraftChange: (
    row: SuperAdminLicenseeView["subAccounts"][number],
    value: string,
  ) => void;
  onWordpressUserIdDraftChange: (
    row: SuperAdminLicenseeView["subAccounts"][number],
    value: string,
  ) => void;
  onSaveCapacity: (row: SuperAdminLicenseeView["subAccounts"][number]) => void;
  onSaveAccount: (row: SuperAdminLicenseeView["subAccounts"][number]) => void;
};

export function SuperAdminLicenseeDirectory({
  licensees,
  pending,
  onCreateSubmit,
  createFields,
  feeDrafts,
  savingFeeKey,
  onFeeDraftChange,
  onSaveFee,
  languageDrafts,
  savingLanguageKey,
  onLanguageDraftChange,
  onSaveDefaultLanguage,
  onSetAccess,
  allowanceDrafts,
  accountEmailDrafts,
  accountWordpressUserIdDrafts,
  savingAllocationKey,
  savingAccountKey,
  allocationKeyFor,
  onCapacityDraftChange,
  onEmailDraftChange,
  onWordpressUserIdDraftChange,
  onSaveCapacity,
  onSaveAccount,
}: SuperAdminLicenseeDirectoryProps) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
            Licensees
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Licensee Masters
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
            Principal Super Admin management domain. A Licensee Master remains
            visible and manageable even with zero sub-accounts. Fees are
            Licensee-level. GetOblic capacity and account mapping stay
            organization-scoped.
          </p>
        </div>
        <SuperAdminCreateAccountPanel
          title="Create Licensee Master"
          summary="Creates a Business Licensee Master identity only. Never creates an Athena organization for the Master."
          actionLabel="Create Licensee Master"
          pending={pending}
          onSubmit={onCreateSubmit}
        >
          {createFields}
        </SuperAdminCreateAccountPanel>
      </div>

      {licensees.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-8 text-sm text-white/50">
          No Licensee Masters yet. Create a Licensee Master and link
          sub-accounts before setting listing capacity.
        </div>
      ) : (
        <div className="space-y-4">
          {licensees.map((licensee) => {
            const drafts = feeDrafts[licensee.licenseeAccountId] ?? {
              licenseeMonthlyFeeUsd: licensee.licenseeMonthlyFeeUsd.toFixed(2),
              subAccountMonthlyFeeUsd:
                licensee.subAccountMonthlyFeeUsd.toFixed(2),
            };
            return (
              <SuperAdminLicenseeCard
                key={licensee.licenseeAccountId}
                licensee={licensee}
                pending={pending}
                licenseeMonthlyFeeDraft={drafts.licenseeMonthlyFeeUsd}
                subAccountMonthlyFeeDraft={drafts.subAccountMonthlyFeeUsd}
                savingLicenseeMonthlyFee={
                  savingFeeKey ===
                  `${licensee.licenseeAccountId}:licenseeMonthlyFeeUsd`
                }
                savingSubAccountMonthlyFee={
                  savingFeeKey ===
                  `${licensee.licenseeAccountId}:subAccountMonthlyFeeUsd`
                }
                onLicenseeMonthlyFeeDraftChange={(value) =>
                  onFeeDraftChange(
                    licensee.licenseeAccountId,
                    "licenseeMonthlyFeeUsd",
                    value,
                  )
                }
                onSubAccountMonthlyFeeDraftChange={(value) =>
                  onFeeDraftChange(
                    licensee.licenseeAccountId,
                    "subAccountMonthlyFeeUsd",
                    value,
                  )
                }
                onSaveLicenseeMonthlyFee={() =>
                  onSaveFee(
                    licensee.licenseeAccountId,
                    "licenseeMonthlyFeeUsd",
                  )
                }
                onSaveSubAccountMonthlyFee={() =>
                  onSaveFee(
                    licensee.licenseeAccountId,
                    "subAccountMonthlyFeeUsd",
                  )
                }
                defaultLanguageDraft={
                  languageDrafts[licensee.licenseeAccountId] ??
                  licensee.defaultLanguage
                }
                savingDefaultLanguage={
                  savingLanguageKey === licensee.licenseeAccountId
                }
                onDefaultLanguageDraftChange={(value) =>
                  onLanguageDraftChange(licensee.licenseeAccountId, value)
                }
                onSaveDefaultLanguage={() =>
                  onSaveDefaultLanguage(licensee.licenseeAccountId)
                }
                onSetAccess={onSetAccess}
                allowanceDrafts={allowanceDrafts}
                accountEmailDrafts={accountEmailDrafts}
                accountWordpressUserIdDrafts={accountWordpressUserIdDrafts}
                savingAllocationKey={savingAllocationKey}
                savingAccountKey={savingAccountKey}
                allocationKeyFor={allocationKeyFor}
                onCapacityDraftChange={onCapacityDraftChange}
                onEmailDraftChange={onEmailDraftChange}
                onWordpressUserIdDraftChange={onWordpressUserIdDraftChange}
                onSaveCapacity={onSaveCapacity}
                onSaveAccount={onSaveAccount}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
