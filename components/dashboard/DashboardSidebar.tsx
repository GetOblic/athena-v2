import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export const dashboardNavDefs = [
  { key: "dashboard", href: "/" },
  { key: "gettingStarted", href: "/getting-started" },
  { key: "athenaBrain", href: "/identity" },
  { key: "intelligenceDomains", href: "/intelligence-domains" },
  { key: "inbox", href: "/inbox" },
  { key: "discussions", href: "/discussions" },
  { key: "prospects", href: "/prospects" },
  { key: "personas", href: "/personas" },
  { key: "ads", href: "/ads" },
  { key: "seoIntelligence", href: "/seo" },
  { key: "socialPlanner", href: "/social-planner" },
  { key: "opportunities", href: "/opportunities" },
  { key: "briefings", href: "/briefings" },
] as const satisfies ReadonlyArray<{
  key: keyof TenantMessages["nav"];
  href: string;
}>;

/** Stable nav metadata with canonical English labels for existing tests. */
export const dashboardNavItems = dashboardNavDefs.map((item) => ({
  key: item.key,
  href: item.href,
  label: en.nav[item.key],
}));

export function localizeDashboardNavItems(messages: TenantMessages) {
  return dashboardNavDefs.map((item) => ({
    key: item.key,
    href: item.href,
    label: messages.nav[item.key],
  }));
}

type DashboardSidebarProps = {
  activeHref: string;
  messages?: TenantMessages;
};

export function DashboardSidebar({
  activeHref,
  messages = en,
}: DashboardSidebarProps) {
  const navItems = localizeDashboardNavItems(messages);

  return (
    <aside className="relative hidden w-[300px] border-r border-[var(--athena-border)] bg-[var(--athena-panel)] p-7 md:block">
      <div className="mb-12">
        <AthenaBrandLink
          tagline={messages.chrome.tagline}
          logoutLabel={messages.chrome.logOut}
          sessionActionsLabel={messages.chrome.sessionActions}
        />
      </div>

      <nav className="space-y-2 text-sm">
        {navItems.map((item) => {
          const isActive = item.href === activeHref;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`block rounded-2xl px-5 py-4 transition ${
                isActive
                  ? "bg-[var(--athena-orange)] text-white shadow-lg shadow-orange-500/20"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-7 left-7 right-7 space-y-3">
        {/* Future workspace settings: Members, Billing, API Keys, Integrations */}
        <div className="text-xs text-white/30">
          {messages.chrome.poweredByGetOblic}
        </div>
      </div>
    </aside>
  );
}
