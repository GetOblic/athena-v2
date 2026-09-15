"use client";

import { useState } from "react";
import { Building2, ChevronDown, Languages, Wallet } from "lucide-react";
import type { SuperAdminLicenseeView } from "@/lib/superAdmin/superAdminDashboardView";
import { SuperAdminSubAccountCard } from "@/components/superAdmin/SuperAdminSubAccountCard";
import {
  SUPER_ADMIN_CARD_SURFACE,
  SUPER_ADMIN_ICON_WELL,
  SUPER_ADMIN_INPUT_CLASS,
  SUPER_ADMIN_OWN_COMPANY_BADGE_CLASS,
  SUPER_ADMIN_PRIMARY_BUTTON_CLASS,
  SUPER_ADMIN_REACTIVATE_BUTTON_CLASS,
  SUPER_ADMIN_SECONDARY_BUTTON_CLASS,
  SUPER_ADMIN_STATUS_BADGE_ACTIVE_CLASS,
  SUPER_ADMIN_STATUS_BADGE_DEACTIVATED_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";
import {
  ORGANIZATION_LANGUAGES,
  ORGANIZATION_LANGUAGE_LABELS,
  isOrganizationLanguage,
  organizationLanguageLabel,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import {
  formatLicenseeCommercialFeeUsd,
  LICENSEE_MONTHLY_FEE_LABEL,
  SUB_ACCOUNT_MONTHLY_FEE_LABEL,
} from "@/services/superAdmin/superAdminLicenseeCommercialFeeTypes";
import { LICENSEE_DEFAULT_LANGUAGE_LABEL } from "@/services/superAdmin/superAdminLicenseeDefaultLanguageTypes";

type SuperAdminLicenseeCardProps = {
  licensee: SuperAdminLicenseeView;
  pending: boolean;
  licenseeMonthlyFeeDraft: string;
  subAccountMonthlyFeeDraft: string;
  savingLicenseeMonthlyFee: boolean;
  savingSubAccountMonthlyFee: boolean;
  onLicenseeMonthlyFeeDraftChange: (value: string) => void;
  onSubAccountMonthlyFeeDraftChange: (value: string) => void;
  onSaveLicenseeMonthlyFee: () => void;
  onSaveSubAccountMonthlyFee: () => void;
  defaultLanguageDraft: OrganizationLanguage;
  savingDefaultLanguage: boolean;
  onDefaultLanguageDraftChange: (value: OrganizationLanguage) => void;
  onSaveDefaultLanguage: () => void;
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

export function SuperAdminLicenseeCard({
  licensee,
  pending,
  licenseeMonthlyFeeDraft,
  subAccountMonthlyFeeDraft,
  savingLicenseeMonthlyFee,
  savingSubAccountMonthlyFee,
  onLicenseeMonthlyFeeDraftChange,
  onSubAccountMonthlyFeeDraftChange,
  onSaveLicenseeMonthlyFee,
  onSaveSubAccountMonthlyFee,
  defaultLanguageDraft,
  savingDefaultLanguage,
  onDefaultLanguageDraftChange,
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
}: SuperAdminLicenseeCardProps) {
  const [open, setOpen] = useState(false);
  const subAccountLabel =
    licensee.subAccountCount === 1
      ? "1 sub-account"
      : `${licensee.subAccountCount} sub-accounts`;

  return (
    <article
      className={`overflow-hidden rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] ${SUPER_ADMIN_CARD_SURFACE.blue}`}
    >
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={open}
        >
          <span
            className={`mt-0.5 grid size-10 place-items-center rounded-2xl ${SUPER_ADMIN_ICON_WELL.blue}`}
            aria-hidden="true"
          >
            <Building2 size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white/90">
              {licensee.masterEmail}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {licensee.status === "deactivated" ? (
                <span className={SUPER_ADMIN_STATUS_BADGE_DEACTIVATED_CLASS}>
                  Deactivated
                </span>
              ) : (
                <span className={SUPER_ADMIN_STATUS_BADGE_ACTIVE_CLASS}>
                  Active
                </span>
              )}
              {licensee.hasOwnCompany ? (
                <span className={SUPER_ADMIN_OWN_COMPANY_BADGE_CLASS}>
                  Own company
                </span>
              ) : null}
              <span className="text-xs text-white/40">{subAccountLabel}</span>
            </div>
            <div className="mt-2 text-xs leading-5 text-white/45">
              {LICENSEE_MONTHLY_FEE_LABEL}{" "}
              {formatLicenseeCommercialFeeUsd(licensee.licenseeMonthlyFeeUsd)}
              {" · "}
              {SUB_ACCOUNT_MONTHLY_FEE_LABEL}{" "}
              {formatLicenseeCommercialFeeUsd(licensee.subAccountMonthlyFeeUsd)}
              {" · "}
              {LICENSEE_DEFAULT_LANGUAGE_LABEL}{" "}
              {organizationLanguageLabel(licensee.defaultLanguage)}
            </div>
            <div className="mt-1 text-xs leading-5 text-white/40">
              {licensee.getoblicRollup.label}
            </div>
          </div>
          <ChevronDown
            className={`mt-1 size-5 shrink-0 text-white/45 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {licensee.userId ? (
          <div className="shrink-0 sm:pt-1">
            {licensee.status === "deactivated" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => onSetAccess(licensee.userId as string, "reactivate")}
                className={SUPER_ADMIN_REACTIVATE_BUTTON_CLASS}
              >
                Reactivate
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => onSetAccess(licensee.userId as string, "deactivate")}
                className={SUPER_ADMIN_SECONDARY_BUTTON_CLASS}
              >
                Deactivate
              </button>
            )}
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-6 border-t border-white/10 px-5 py-5">
          <div>
            <div className="text-sm font-medium text-white/80">
              Licensee identity
            </div>
            <p className="mt-1 text-sm leading-6 text-white/45">
              {licensee.displayName}
              {licensee.status === "deactivated" ? " · Deactivated" : " · Active"}
              {licensee.hasOwnCompany ? " · Own company present" : ""}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span
                className={`grid size-9 place-items-center rounded-xl ${SUPER_ADMIN_ICON_WELL.orange}`}
                aria-hidden="true"
              >
                <Wallet size={16} />
              </span>
              <div>
                <div className="text-sm font-medium text-white/80">
                  Licensee commercial configuration
                </div>
                <p className="mt-1 text-sm leading-6 text-white/45">
                  USD amounts for this Licensee Master.{" "}
                  {formatLicenseeCommercialFeeUsd(0)} is valid.
                </p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm text-white/70">
                  {LICENSEE_MONTHLY_FEE_LABEL} (USD)
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={licenseeMonthlyFeeDraft}
                    onChange={(event) =>
                      onLicenseeMonthlyFeeDraftChange(event.target.value)
                    }
                    aria-label={LICENSEE_MONTHLY_FEE_LABEL}
                    className={SUPER_ADMIN_INPUT_CLASS}
                  />
                  <button
                    type="button"
                    disabled={pending || savingLicenseeMonthlyFee}
                    onClick={onSaveLicenseeMonthlyFee}
                    className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
                  >
                    Save
                  </button>
                </div>
                <div className="text-xs text-white/40">
                  Current{" "}
                  {formatLicenseeCommercialFeeUsd(licensee.licenseeMonthlyFeeUsd)}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-white/70">
                  {SUB_ACCOUNT_MONTHLY_FEE_LABEL} (USD)
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={subAccountMonthlyFeeDraft}
                    onChange={(event) =>
                      onSubAccountMonthlyFeeDraftChange(event.target.value)
                    }
                    aria-label={SUB_ACCOUNT_MONTHLY_FEE_LABEL}
                    className={SUPER_ADMIN_INPUT_CLASS}
                  />
                  <button
                    type="button"
                    disabled={pending || savingSubAccountMonthlyFee}
                    onClick={onSaveSubAccountMonthlyFee}
                    className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
                  >
                    Save
                  </button>
                </div>
                <div className="text-xs text-white/40">
                  Current{" "}
                  {formatLicenseeCommercialFeeUsd(
                    licensee.subAccountMonthlyFeeUsd,
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span
                  className={`grid size-9 place-items-center rounded-xl ${SUPER_ADMIN_ICON_WELL.blue}`}
                  aria-hidden="true"
                >
                  <Languages size={16} />
                </span>
                <div>
                  <div className="text-sm font-medium text-white/80">
                    {LICENSEE_DEFAULT_LANGUAGE_LABEL}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/45">
                    Initial Athena language for future sub-accounts created by
                    this Licensee. Existing organizations are not changed.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <select
                  value={defaultLanguageDraft}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (isOrganizationLanguage(next)) {
                      onDefaultLanguageDraftChange(next);
                    }
                  }}
                  aria-label={LICENSEE_DEFAULT_LANGUAGE_LABEL}
                  className={SUPER_ADMIN_INPUT_CLASS}
                >
                  {ORGANIZATION_LANGUAGES.map((code) => (
                    <option key={code} value={code} className="bg-black text-white">
                      {ORGANIZATION_LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || savingDefaultLanguage}
                  onClick={onSaveDefaultLanguage}
                  className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
                >
                  Save
                </button>
              </div>
              <div className="text-xs text-white/40">
                Current {organizationLanguageLabel(licensee.defaultLanguage)}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
                GetOblic Listing Capacity
              </div>
              <div className="mt-2 text-sm font-medium text-white/80">
                Linked sub-accounts
              </div>
              <p className="mt-1 text-sm leading-6 text-white/45">
                Concurrent GetOblic listing capacity per Licensee sub-account.
                Licensee Masters and tenant users cannot change this.
              </p>
            </div>
            {licensee.subAccounts.length === 0 ? (
              <div className="text-sm text-white/45">
                No sub-accounts linked to this Licensee Master.
              </div>
            ) : (
              <div className="space-y-3">
                {licensee.subAccounts.map((row) => {
                  const key = allocationKeyFor(row);
                  return (
                    <SuperAdminSubAccountCard
                      key={key}
                      row={row}
                      capacityDraft={allowanceDrafts[key] ?? ""}
                      emailDraft={accountEmailDrafts[key] ?? ""}
                      wordpressUserIdDraft={
                        accountWordpressUserIdDrafts[key] ?? ""
                      }
                      pending={pending}
                      savingCapacity={savingAllocationKey === key}
                      savingAccount={savingAccountKey === key}
                      onCapacityDraftChange={(value) =>
                        onCapacityDraftChange(row, value)
                      }
                      onEmailDraftChange={(value) =>
                        onEmailDraftChange(row, value)
                      }
                      onWordpressUserIdDraftChange={(value) =>
                        onWordpressUserIdDraftChange(row, value)
                      }
                      onSaveCapacity={() => onSaveCapacity(row)}
                      onSaveAccount={() => onSaveAccount(row)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
