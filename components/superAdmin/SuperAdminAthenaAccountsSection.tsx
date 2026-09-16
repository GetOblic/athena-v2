import type { FormEvent, ReactNode } from "react";
import { Users } from "lucide-react";
import { SuperAdminCreateAccountPanel } from "@/components/superAdmin/SuperAdminCreateAccountPanel";
import {
  SUPER_ADMIN_ICON_WELL,
  SUPER_ADMIN_NESTED_CARD_CLASS,
  SUPER_ADMIN_PANEL_CLASS,
  SUPER_ADMIN_PLAN_BADGE_FREE_CLASS,
  SUPER_ADMIN_PLAN_BADGE_FULL_CLASS,
  SUPER_ADMIN_REACTIVATE_BUTTON_CLASS,
  SUPER_ADMIN_SECONDARY_BUTTON_CLASS,
  SUPER_ADMIN_STATUS_BADGE_ACTIVE_CLASS,
  SUPER_ADMIN_STATUS_BADGE_DEACTIVATED_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";
import { athenaPlanBadgeLabel } from "@/services/athenaPlan";
import type { SuperAdminAthenaAccountView } from "@/lib/superAdmin/superAdminDashboardView";

type SuperAdminAthenaAccountsSectionProps = {
  accounts: SuperAdminAthenaAccountView[];
  pending: boolean;
  onCreateSubmit: (event: FormEvent) => void | Promise<void>;
  createFields: ReactNode;
  onSetAccess: (userId: string, action: "deactivate" | "reactivate") => void;
};

export function SuperAdminAthenaAccountsSection({
  accounts,
  pending,
  onCreateSubmit,
  createFields,
  onSetAccess,
}: SuperAdminAthenaAccountsSectionProps) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
            Athena Accounts
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Ordinary Athena accounts
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
            Deactivation retains identity, organization, membership, Licensee
            relationships, and tenant data. No deletion. No impersonation.
            Licensee Master access is managed inside Licensees.
          </p>
        </div>
        <SuperAdminCreateAccountPanel
          title="Create Athena account"
          summary="Provisions a normal Athena organization with an owner membership. Does not create a Licensee relationship."
          actionLabel="Create Athena Account"
          pending={pending}
          onSubmit={onCreateSubmit}
        >
          {createFields}
        </SuperAdminCreateAccountPanel>
      </div>

      <div className={SUPER_ADMIN_PANEL_CLASS}>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-10 place-items-center rounded-2xl ${SUPER_ADMIN_ICON_WELL.violet}`}
              aria-hidden="true"
            >
              <Users size={18} />
            </span>
            <div>
              <div className="text-sm font-medium text-white/80">
                Account access
              </div>
              <p className="mt-1 text-sm text-white/45">
                Ordinary Athena accounts only.
              </p>
            </div>
          </div>
          <div className="text-sm text-white/40">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-8 text-sm text-white/50">
            No ordinary Athena accounts yet.
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={`${account.accountType}:${account.userId}`}
                className={`${SUPER_ADMIN_NESTED_CARD_CLASS} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-white/90">
                      {account.displayName}
                    </div>
                    <span
                      className={
                        account.athenaPlan === "free"
                          ? SUPER_ADMIN_PLAN_BADGE_FREE_CLASS
                          : SUPER_ADMIN_PLAN_BADGE_FULL_CLASS
                      }
                    >
                      {athenaPlanBadgeLabel(account.athenaPlan)}
                    </span>
                    {account.status === "deactivated" ? (
                      <span className={SUPER_ADMIN_STATUS_BADGE_DEACTIVATED_CLASS}>
                        Deactivated
                      </span>
                    ) : (
                      <span className={SUPER_ADMIN_STATUS_BADGE_ACTIVE_CLASS}>
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-white/50">{account.email}</div>
                </div>
                {account.status === "active" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSetAccess(account.userId, "deactivate")}
                    className={SUPER_ADMIN_SECONDARY_BUTTON_CLASS}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSetAccess(account.userId, "reactivate")}
                    className={SUPER_ADMIN_REACTIVATE_BUTTON_CLASS}
                  >
                    Reactivate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
