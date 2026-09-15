import type { ReactNode } from "react";
import { Building2, Languages, Wallet } from "lucide-react";
import {
  LICENSEE_CARD_SURFACE,
  LICENSEE_ICON_WELL,
  LICENSEE_PLAN_LANGUAGE_LABEL,
  LICENSEE_PLAN_LICENSEE_FEE_LABEL,
  LICENSEE_PLAN_SUB_ACCOUNT_FEE_LABEL,
  LICENSEE_PLAN_TITLE,
  type LicenseeDashboardAccent,
  type LicenseePlanView,
} from "@/lib/licensee/licenseeDashboardPresentation";

type LicenseePlanSectionProps = {
  plan: LicenseePlanView;
  labels?: {
    title: string;
    languageLabel: string;
    licenseeFeeLabel: string;
    subAccountFeeLabel: string;
  };
};

export function LicenseePlanSection({
  plan,
  labels,
}: LicenseePlanSectionProps) {
  const title = labels?.title ?? LICENSEE_PLAN_TITLE;
  const languageLabel = labels?.languageLabel ?? LICENSEE_PLAN_LANGUAGE_LABEL;
  const licenseeFeeLabel =
    labels?.licenseeFeeLabel ?? LICENSEE_PLAN_LICENSEE_FEE_LABEL;
  const subAccountFeeLabel =
    labels?.subAccountFeeLabel ?? LICENSEE_PLAN_SUB_ACCOUNT_FEE_LABEL;

  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-white/45">
        {title}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <PlanMetricCard
          accent="blue"
          icon={<Languages size={18} />}
          label={languageLabel}
          value={plan.defaultLanguageLabel}
          detail={plan.languageSupport}
        />
        <PlanMetricCard
          accent="green"
          icon={<Wallet size={18} />}
          label={licenseeFeeLabel}
          value={plan.licenseeFeeDisplay}
        />
        <PlanMetricCard
          accent="violet"
          icon={<Building2 size={18} />}
          label={subAccountFeeLabel}
          value={plan.subAccountFeeDisplay}
        />
      </div>
    </section>
  );
}

function PlanMetricCard({
  accent,
  icon,
  label,
  value,
  detail,
}: {
  accent: LicenseeDashboardAccent;
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article
      className={`overflow-hidden rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-5 ${LICENSEE_CARD_SURFACE[accent]}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl ${LICENSEE_ICON_WELL[accent]}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {label}
          </div>
          <div className="mt-2 text-xl font-semibold tracking-tight text-white">
            {value}
          </div>
          {detail ? (
            <p className="mt-1 text-sm leading-6 text-white/45">{detail}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
