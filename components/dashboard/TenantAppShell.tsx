import Link from "next/link";
import { AthenaHeaderActions } from "@/components/auth/AthenaHeaderActions";
import { TenantMobileNav } from "@/components/dashboard/TenantMobileNav";
import {
  TenantAthenaWordmark,
  TenantSidebar,
} from "@/components/dashboard/TenantSidebar";
import { localizeTenantNav } from "@/components/dashboard/tenantNavigation";
import type { DefineKind } from "@/lib/home/homeDomainState";
import {
  applyFreeUntrainedNavPresentation,
  freeUntrainedLockedNavCopy,
} from "@/lib/organization/freeUntrained";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { resolveGlobalFullAthenaInvite } from "@/lib/upgrade/upgradeChromePresentation";
import type { AthenaPlan } from "@/services/athenaPlan";

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

type TenantAppShellProps = {
  currentPath: string;
  messages: TenantMessages;
  athenaPlan?: AthenaPlan;
  defineKind?: DefineKind;
  children: React.ReactNode;
};

export function TenantAppShell({
  currentPath,
  messages,
  athenaPlan,
  defineKind,
  children,
}: TenantAppShellProps) {
  const items = applyFreeUntrainedNavPresentation(
    localizeTenantNav(messages),
    { athenaPlan, defineKind },
    freeUntrainedLockedNavCopy(messages.nav),
  );
  const fullAthenaInvite = resolveGlobalFullAthenaInvite(
    { athenaPlan, defineKind },
    messages.upgrade,
  );

  return (
    <div className="flex min-h-dvh bg-[var(--athena-bg)] text-white">
      <TenantSidebar
        currentPath={currentPath}
        messages={messages}
        athenaPlan={athenaPlan}
        defineKind={defineKind}
      />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--athena-border)] bg-[var(--athena-panel)] px-4 py-3 lg:justify-end lg:border-0 lg:bg-transparent lg:px-8 lg:py-4 xl:px-10">
          <TenantMobileNav
            currentPath={currentPath}
            items={items}
            tagline={messages.chrome.tagline}
            openMenuLabel={messages.chrome.openMenu}
            closeMenuLabel={messages.chrome.closeMenu}
            mainNavigationLabel={messages.chrome.mainNavigation}
            yourGrowthLabel={messages.nav.yourGrowth}
            utilitiesLabel={messages.nav.utilities}
            moreToolsLabel={messages.nav.moreTools}
            poweredByGetOblic={messages.chrome.poweredByGetOblic}
            athenaPlan={athenaPlan}
            fullAthenaInvite={fullAthenaInvite}
          />

          <Link
            href="/"
            className={`min-w-0 lg:hidden ${focusRingClassName}`}
          >
            <TenantAthenaWordmark
              titleClassName="text-xl font-bold tracking-tight"
              athenaPlan={athenaPlan}
            />
          </Link>

          <div className="ml-auto">
            <AthenaHeaderActions
              logoutLabel={messages.chrome.logOut}
              sessionActionsLabel={messages.chrome.sessionActions}
            />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-auto px-5 py-6 lg:p-8 xl:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
