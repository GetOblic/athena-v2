"use client";

import { useState } from "react";
import { Building, ChevronDown } from "lucide-react";
import {
  allocationSecondaryCopy,
  superAdminAllocationKey,
  type SuperAdminSubAccountView,
} from "@/lib/superAdmin/superAdminDashboardView";
import {
  SUPER_ADMIN_CONFIGURED_BADGE_CLASS,
  SUPER_ADMIN_ICON_WELL,
  SUPER_ADMIN_INPUT_CLASS,
  SUPER_ADMIN_NESTED_CARD_CLASS,
  SUPER_ADMIN_OWN_COMPANY_BADGE_CLASS,
  SUPER_ADMIN_PRIMARY_BUTTON_CLASS,
  SUPER_ADMIN_UNCONFIGURED_BADGE_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";

type SuperAdminSubAccountCardProps = {
  row: SuperAdminSubAccountView;
  capacityDraft: string;
  emailDraft: string;
  wordpressUserIdDraft: string;
  pending: boolean;
  savingCapacity: boolean;
  savingAccount: boolean;
  onCapacityDraftChange: (value: string) => void;
  onEmailDraftChange: (value: string) => void;
  onWordpressUserIdDraftChange: (value: string) => void;
  onSaveCapacity: () => void;
  onSaveAccount: () => void;
};

export function SuperAdminSubAccountCard({
  row,
  capacityDraft,
  emailDraft,
  wordpressUserIdDraft,
  pending,
  savingCapacity,
  savingAccount,
  onCapacityDraftChange,
  onEmailDraftChange,
  onWordpressUserIdDraftChange,
  onSaveCapacity,
  onSaveAccount,
}: SuperAdminSubAccountCardProps) {
  const [open, setOpen] = useState(false);
  const key = superAdminAllocationKey(row);
  const accountDisabled = !row.configured;

  return (
    <article className={SUPER_ADMIN_NESTED_CARD_CLASS}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
        aria-controls={`sub-account-${key}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 grid size-9 place-items-center rounded-xl ${SUPER_ADMIN_ICON_WELL.blue}`}
            aria-hidden="true"
          >
            <Building size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-white">
                {row.organizationName}
              </div>
              {row.isOwnCompany ? (
                <span className={SUPER_ADMIN_OWN_COMPANY_BADGE_CLASS}>
                  Own company
                </span>
              ) : null}
              <span
                className={
                  row.configured
                    ? SUPER_ADMIN_CONFIGURED_BADGE_CLASS
                    : SUPER_ADMIN_UNCONFIGURED_BADGE_CLASS
                }
              >
                {row.configured ? "Configured" : "Not configured"}
              </span>
            </div>
            {row.displayAlias ? (
              <div className="mt-1 text-xs text-white/45">
                {row.displayAlias}
              </div>
            ) : null}
            <div className="mt-1 text-xs leading-5 text-white/40">
              {allocationSecondaryCopy(row)}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`mt-1 size-5 shrink-0 text-white/45 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id={`sub-account-${key}`} className="mt-5 space-y-5 border-t border-white/10 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 space-y-2">
              <span className="text-sm text-white/70">
                GetOblic listing capacity
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={capacityDraft}
                onChange={(event) => onCapacityDraftChange(event.target.value)}
                placeholder=""
                className={SUPER_ADMIN_INPUT_CLASS}
              />
            </label>
            <button
              type="button"
              disabled={pending || savingCapacity}
              onClick={onSaveCapacity}
              className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
            >
              Save
            </button>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-4">
            <div className="text-sm font-medium text-white/80">
              GetOblic.com account
            </div>
            <label className="block space-y-2">
              <span className="text-sm text-white/70">Email</span>
              <input
                type="email"
                value={emailDraft}
                onChange={(event) => onEmailDraftChange(event.target.value)}
                disabled={accountDisabled}
                placeholder=""
                className={SUPER_ADMIN_INPUT_CLASS}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-white/70">WordPress User ID</span>
              <input
                type="text"
                inputMode="numeric"
                value={wordpressUserIdDraft}
                onChange={(event) =>
                  onWordpressUserIdDraftChange(event.target.value)
                }
                disabled={accountDisabled}
                placeholder=""
                className={SUPER_ADMIN_INPUT_CLASS}
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={pending || savingAccount || accountDisabled}
                onClick={onSaveAccount}
                className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
              >
                Save Account
              </button>
              {accountDisabled ? (
                <span className="text-xs text-white/40">
                  Listing capacity must be configured first.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
