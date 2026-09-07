import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type TenantNavSection =
  | "home"
  | "growth"
  | "utilities"
  | "more"
  | "help";

export type TenantNavIconName =
  | "home"
  | "brain"
  | "visibility"
  | "traction"
  | "convert"
  | "inbox"
  | "settings"
  | "help";

export type TenantNavDef = {
  key: keyof TenantMessages["nav"];
  section: TenantNavSection;
  href?: string;
  alsoActiveFor?: readonly string[];
  exact?: boolean;
  disabled?: boolean;
  subtitleKey?: keyof TenantMessages["nav"];
  icon?: TenantNavIconName;
  stageNumber?: number;
};

export const tenantNavDefs = [
  {
    key: "home",
    href: "/",
    exact: true,
    section: "home",
    icon: "home",
  },
  {
    key: "defineYourBusiness",
    href: "/identity",
    section: "growth",
    subtitleKey: "athenaBrain",
    icon: "brain",
    stageNumber: 1,
  },
  {
    key: "buildVisibility",
    href: "/seo",
    section: "growth",
    subtitleKey: "buildVisibilitySubtitle",
    icon: "visibility",
    stageNumber: 2,
  },
  {
    key: "generateTraction",
    href: "/personas",
    section: "growth",
    subtitleKey: "generateTractionSubtitle",
    icon: "traction",
    stageNumber: 3,
  },
  {
    key: "convertOpportunities",
    href: "/prospects",
    section: "growth",
    subtitleKey: "convertOpportunitiesSubtitle",
    icon: "convert",
    stageNumber: 4,
  },
  {
    key: "athenaInbox",
    href: "/inbox",
    section: "utilities",
    icon: "inbox",
  },
  {
    key: "settings",
    section: "utilities",
    disabled: true,
    subtitleKey: "settingsHint",
    icon: "settings",
  },
  {
    key: "gettingStarted",
    href: "/getting-started",
    section: "more",
  },
  {
    key: "intelligenceDomains",
    href: "/intelligence-domains",
    alsoActiveFor: ["/communities"],
    section: "more",
  },
  {
    key: "discussions",
    href: "/discussions",
    section: "more",
  },
  {
    key: "ads",
    href: "/ads",
    section: "more",
  },
  {
    key: "socialPlanner",
    href: "/social-planner",
    section: "more",
  },
  {
    key: "opportunities",
    href: "/opportunities",
    section: "more",
  },
  {
    key: "briefings",
    href: "/briefings",
    section: "more",
  },
  {
    key: "needHelp",
    section: "help",
    disabled: true,
    subtitleKey: "chatWithAthena",
    icon: "help",
  },
] as const satisfies ReadonlyArray<TenantNavDef>;

export type LocalizedTenantNavItem = {
  key: string;
  section: TenantNavSection;
  href?: string;
  alsoActiveFor?: readonly string[];
  exact?: boolean;
  disabled?: boolean;
  icon?: TenantNavIconName;
  stageNumber?: number;
  label: string;
  subtitle?: string;
};

function pathMatches(currentPath: string, href: string, exact?: boolean): boolean {
  if (exact || href === "/") {
    return currentPath === href;
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function isTenantNavActive(
  currentPath: string,
  item: Pick<
    LocalizedTenantNavItem,
    "href" | "alsoActiveFor" | "exact" | "disabled"
  >,
): boolean {
  if (item.disabled || !item.href) {
    return false;
  }
  if (pathMatches(currentPath, item.href, item.exact)) {
    return true;
  }
  return (item.alsoActiveFor ?? []).some((alias) =>
    pathMatches(currentPath, alias),
  );
}

export function localizeTenantNav(
  messages: TenantMessages,
): LocalizedTenantNavItem[] {
  return tenantNavDefs.map((item) => ({
    key: item.key,
    section: item.section,
    href: "href" in item ? item.href : undefined,
    alsoActiveFor: "alsoActiveFor" in item ? item.alsoActiveFor : undefined,
    exact: "exact" in item ? item.exact : undefined,
    disabled: "disabled" in item ? item.disabled : undefined,
    icon: "icon" in item ? item.icon : undefined,
    stageNumber: "stageNumber" in item ? item.stageNumber : undefined,
    label: messages.nav[item.key],
    subtitle:
      "subtitleKey" in item && item.subtitleKey
        ? messages.nav[item.subtitleKey]
        : undefined,
  }));
}

/** Stable nav metadata with canonical English labels for source-contract tests. */
export const tenantNavItems = localizeTenantNav(en);

export function groupTenantNav(items: LocalizedTenantNavItem[]) {
  return {
    home: items.filter((item) => item.section === "home"),
    growth: items.filter((item) => item.section === "growth"),
    utilities: items.filter((item) => item.section === "utilities"),
    more: items.filter((item) => item.section === "more"),
    help: items.filter((item) => item.section === "help"),
  };
}

export const tenantNavRowClassName = {
  base: "flex items-start gap-3 rounded-2xl px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]",
  active:
    "bg-[var(--athena-orange)]/15 text-white border border-[var(--athena-orange)]/35",
  inactive: "text-white/60 hover:bg-white/5 hover:text-white",
  disabled: "cursor-not-allowed opacity-50 text-white/60",
} as const;
