/**
 * Licensee Master dashboard presentation grammar.
 * Visual language and read-only plan mapping only.
 * Does not import Identity or Super Admin visual tokens.
 */

import {
  organizationLanguageLabel,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import { formatLicenseeCommercialFeeUsd } from "@/services/superAdmin/superAdminLicenseeCommercialFeeTypes";

export type LicenseeDashboardAccent =
  | "orange"
  | "blue"
  | "violet"
  | "green"
  | "warm"
  | "cyan";

export const LICENSEE_DASHBOARD_SHELL_CLASS =
  "min-h-screen bg-[var(--athena-bg)] px-5 py-8 text-white sm:px-6";

export const LICENSEE_DASHBOARD_CANVAS_CLASS = "mx-auto max-w-5xl";

export const LICENSEE_CARD_SURFACE: Record<LicenseeDashboardAccent, string> = {
  orange:
    "relative !border-[rgba(255,102,0,0.34)] hover:!border-[rgba(255,102,0,0.52)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_46%)] shadow-[0_0_28px_rgba(255,102,0,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.7)]",
  blue:
    "relative !border-[rgba(56,189,248,0.30)] hover:!border-[rgba(56,189,248,0.50)] bg-[linear-gradient(180deg,rgba(56,189,248,0.06),transparent_46%)] shadow-[0_0_24px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]",
  violet:
    "relative !border-[rgba(167,139,250,0.30)] hover:!border-[rgba(167,139,250,0.48)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_46%)] shadow-[0_0_24px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  green:
    "relative !border-[var(--athena-success)]/35 hover:!border-[var(--athena-success)]/55 bg-[linear-gradient(180deg,rgba(0,208,132,0.09),rgba(19,19,26,0.15)_52%)] shadow-[0_0_30px_rgba(0,208,132,0.08)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--athena-success)]/80",
  warm:
    "relative !border-[rgba(255,160,80,0.28)] hover:!border-[rgba(255,160,80,0.46)] bg-[linear-gradient(180deg,rgba(255,160,80,0.05),transparent_46%)] shadow-[0_0_22px_rgba(255,160,80,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,160,80,0.58)]",
  cyan:
    "relative !border-[rgba(34,211,238,0.30)] hover:!border-[rgba(34,211,238,0.50)] bg-[linear-gradient(180deg,rgba(34,211,238,0.06),transparent_46%)] shadow-[0_0_24px_rgba(34,211,238,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(34,211,238,0.62)]",
};

export const LICENSEE_ICON_WELL: Record<LicenseeDashboardAccent, string> = {
  orange:
    "border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)] shadow-[0_0_16px_rgba(255,102,0,0.22)]",
  blue:
    "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  green:
    "border border-[var(--athena-success)]/40 bg-[var(--athena-success)]/15 text-[var(--athena-success)] shadow-[0_0_18px_rgba(0,208,132,0.22)]",
  warm:
    "border border-[rgba(255,160,80,0.30)] bg-[rgba(255,160,80,0.12)] text-orange-200 shadow-[0_0_14px_rgba(255,160,80,0.16)]",
  cyan:
    "border border-[rgba(34,211,238,0.32)] bg-[rgba(34,211,238,0.13)] text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.16)]",
};

export const LICENSEE_SEARCH_INPUT_CLASS =
  "w-full rounded-2xl border border-white/15 bg-[#141820] py-3.5 pl-12 pr-5 text-sm text-white shadow-[0_10px_28px_rgba(0,0,0,0.32)] outline-none placeholder:text-white/40 transition focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30";

export const LICENSEE_PRIMARY_CTA_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--athena-orange)] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90";

export const LICENSEE_OPEN_ATHENA_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--athena-orange)] px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-orange-500/25 transition hover:opacity-90 disabled:opacity-60";

export const LICENSEE_SECTION_HEADER_CLASS =
  "mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-white/45";

export const LICENSEE_SUB_ACCOUNT_CARD_CLASS =
  "relative overflow-hidden rounded-[28px] border border-white/16 bg-[#141820] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_48%)] p-6 shadow-[0_14px_40px_rgba(0,0,0,0.38)]";

export const LICENSEE_OWN_COMPANY_CARD_CLASS =
  "relative overflow-hidden rounded-[28px] border border-[var(--athena-orange)]/45 bg-[#141820] bg-[linear-gradient(180deg,rgba(255,102,0,0.08),transparent_48%)] p-6 shadow-[0_14px_40px_rgba(0,0,0,0.38)] ring-1 ring-[var(--athena-orange)]/20 before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.7)]";

export const LICENSEE_EMPTY_STATE_CLASS =
  "rounded-[28px] border border-dashed border-white/18 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_58%)] px-6 py-14 text-center shadow-lg shadow-black/20";

export const LICENSEE_SUCCESS_NOTICE_CLASS =
  "rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100";

export const LICENSEE_ERROR_NOTICE_CLASS =
  "rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100";

export const LICENSEE_WARNING_NOTICE_CLASS =
  "rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4";

export const LICENSEE_ESTIMATE_CARD_CLASS = `block rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] px-5 py-5 transition ${LICENSEE_CARD_SURFACE.cyan}`;

export const LICENSEE_QUOTE_CARD_CLASS = `block rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] px-5 py-5 transition ${LICENSEE_CARD_SURFACE.violet}`;

export const LICENSEE_USEFUL_LINKS_CARD_CLASS = `mb-8 block rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] px-5 py-5 transition ${LICENSEE_CARD_SURFACE.orange}`;

export const LICENSEE_PLAN_TITLE = "Your Licensee Plan";
export const LICENSEE_PLAN_LANGUAGE_LABEL = "Default Language";
export const LICENSEE_PLAN_LANGUAGE_SUPPORT = "Default for new sub-accounts";
export const LICENSEE_PLAN_LICENSEE_FEE_LABEL = "Licensee Fee";
export const LICENSEE_PLAN_SUB_ACCOUNT_FEE_LABEL = "Sub-account Fee";

export type LicenseePlanCopy = {
  languageSupport: string;
  perMonth: string;
  perMonthPerActiveSubAccount: string;
};

export type LicenseePlanView = {
  defaultLanguageLabel: string;
  languageSupport: string;
  licenseeFeeDisplay: string;
  subAccountFeeDisplay: string;
};

export type LicenseePlanSource = {
  defaultLanguage: OrganizationLanguage;
  licenseeMonthlyFeeUsd: number;
  subAccountMonthlyFeeUsd: number;
};

const ENGLISH_PLAN_COPY: LicenseePlanCopy = {
  languageSupport: LICENSEE_PLAN_LANGUAGE_SUPPORT,
  perMonth: " / month",
  perMonthPerActiveSubAccount: " / month per active sub-account",
};

export function formatLicenseePlanMonthlyFee(
  value: number,
  perMonth = ENGLISH_PLAN_COPY.perMonth,
): string {
  return `${formatLicenseeCommercialFeeUsd(value)}${perMonth}`;
}

export function formatLicenseePlanSubAccountFee(
  value: number,
  perMonthPerActiveSubAccount = ENGLISH_PLAN_COPY.perMonthPerActiveSubAccount,
): string {
  return `${formatLicenseeCommercialFeeUsd(value)}${perMonthPerActiveSubAccount}`;
}

export function buildLicenseePlanView(
  input: LicenseePlanSource,
  copy: LicenseePlanCopy = ENGLISH_PLAN_COPY,
): LicenseePlanView {
  return {
    defaultLanguageLabel: organizationLanguageLabel(input.defaultLanguage),
    languageSupport: copy.languageSupport,
    licenseeFeeDisplay: formatLicenseePlanMonthlyFee(
      input.licenseeMonthlyFeeUsd,
      copy.perMonth,
    ),
    subAccountFeeDisplay: formatLicenseePlanSubAccountFee(
      input.subAccountMonthlyFeeUsd,
      copy.perMonthPerActiveSubAccount,
    ),
  };
}

export function formatLicenseeLastVisit(
  iso: string | null,
  locale: string,
  labels: { neverVisited: string; today: string; yesterday: string; separator: string },
): string {
  if (!iso) {
    return labels.neverVisited;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return labels.neverVisited;
  }

  const now = new Date();
  const time = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDelta = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000,
  );

  if (dayDelta === 0) {
    return `${labels.today}${labels.separator}${time}`;
  }
  if (dayDelta === 1) {
    return `${labels.yesterday}${labels.separator}${time}`;
  }

  const dayLabel = date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
  return `${dayLabel}${labels.separator}${time}`;
}
