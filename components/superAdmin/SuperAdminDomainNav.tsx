import { Building2, LayoutDashboard, Settings2, Users } from "lucide-react";
import type { SuperAdminDomainId } from "@/lib/superAdmin/superAdminDashboardView";
import { SUPER_ADMIN_DOMAIN_ITEMS } from "@/lib/superAdmin/superAdminDashboardView";
import {
  SUPER_ADMIN_ICON_WELL,
  SUPER_ADMIN_NAV_ACTIVE_CLASS,
  SUPER_ADMIN_NAV_IDLE_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";

type SuperAdminDomainNavProps = {
  activeDomain: SuperAdminDomainId;
  onDomainChange: (domain: SuperAdminDomainId) => void;
};

const DOMAIN_ICONS = {
  overview: LayoutDashboard,
  licensees: Building2,
  "athena-accounts": Users,
  "system-configuration": Settings2,
} as const;

const DOMAIN_ACCENTS = {
  overview: "orange",
  licensees: "blue",
  "athena-accounts": "violet",
  "system-configuration": "warm",
} as const;

export function SuperAdminDomainNav({
  activeDomain,
  onDomainChange,
}: SuperAdminDomainNavProps) {
  return (
    <nav
      aria-label="Super Admin domains"
      className="flex flex-wrap gap-2 rounded-[24px] border border-white/10 bg-black/20 p-2"
    >
      {SUPER_ADMIN_DOMAIN_ITEMS.map((item) => {
        const Icon = DOMAIN_ICONS[item.id];
        const active = item.id === activeDomain;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onDomainChange(item.id)}
            aria-current={active ? "page" : undefined}
            className={
              active ? SUPER_ADMIN_NAV_ACTIVE_CLASS : SUPER_ADMIN_NAV_IDLE_CLASS
            }
          >
            <span
              className={`grid size-8 place-items-center rounded-xl ${SUPER_ADMIN_ICON_WELL[DOMAIN_ACCENTS[item.id]]}`}
              aria-hidden="true"
            >
              <Icon size={16} />
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
