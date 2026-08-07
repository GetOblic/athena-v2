import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";

export const dashboardNavItems = [
  { label: "Dashboard", href: "/" },
  { label: "Getting Started", href: "/getting-started" },
  { label: "Athena Brain", href: "/identity" },
  { label: "Athena Quote", href: "/quote" },
  { label: "Intelligence Domains", href: "/intelligence-domains" },
  { label: "Inbox", href: "/inbox" },
  { label: "Discussions", href: "/discussions" },
  { label: "Prospects", href: "/prospects" },
  { label: "Personas", href: "/personas" },
  { label: "Ads", href: "/ads" },
  { label: "SEO Intelligence", href: "/seo" },
  { label: "Opportunities", href: "/opportunities" },
  { label: "Briefings", href: "/briefings" },
];

type DashboardSidebarProps = {
  activeHref: string;
};

export function DashboardSidebar({ activeHref }: DashboardSidebarProps) {
  return (
    <aside className="relative hidden w-[300px] border-r border-[var(--athena-border)] bg-[var(--athena-panel)] p-7 md:block">
      <div className="mb-12">
        <AthenaBrandLink />
      </div>

      <nav className="space-y-2 text-sm">
        {dashboardNavItems.map((item) => {
          const isActive = item.href === activeHref;

          return (
            <Link
              key={item.label}
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
        <div className="text-xs text-white/30">Powered by GetOblic</div>
      </div>
    </aside>
  );
}
