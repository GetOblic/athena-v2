import Link from "next/link";
import {
  Brain,
  House,
  Inbox,
  MessageCircleQuestionMark,
  Search,
  Settings,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DefineKind } from "@/lib/home/homeDomainState";
import {
  applyFreeUntrainedNavPresentation,
  freeUntrainedLockedNavCopy,
} from "@/lib/organization/freeUntrained";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  athenaPlanBadgeLabel,
  type AthenaPlan,
} from "@/services/athenaPlan";
import {
  groupTenantNav,
  isTenantNavActive,
  localizeTenantNav,
  lockedGrowthNavGuidanceClassName,
  tenantNavItems,
  tenantNavRowClassName,
  tenantChromeAfterNavClassName,
  tenantSidebarFrameClassName,
  type LocalizedTenantNavItem,
  type TenantNavIconName,
} from "@/components/dashboard/tenantNavigation";
import { IdentityTeachAthenaLink } from "@/components/identity/identityTeachAthenaDeepLink";
import { UpgradeSidebarInvite } from "@/components/upgrade/UpgradeSidebarInvite";
import { resolveGlobalFullAthenaInvite } from "@/lib/upgrade/upgradeChromePresentation";
import type { UpgradeSidebarContent } from "@/lib/upgrade/upgradePresentation";

const NAV_ICONS: Record<TenantNavIconName, LucideIcon> = {
  home: House,
  brain: Brain,
  visibility: Search,
  traction: Target,
  convert: Users,
  inbox: Inbox,
  settings: Settings,
  help: MessageCircleQuestionMark,
};

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

type TenantNavListProps = {
  currentPath: string;
  items: LocalizedTenantNavItem[];
  yourGrowthLabel: string;
  utilitiesLabel: string;
  moreToolsLabel: string;
  showLockedGuidance?: boolean;
};

function IconMark({
  name,
  active,
}: {
  name: TenantNavIconName;
  active: boolean;
}) {
  const Icon = NAV_ICONS[name];
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-xl ${
        active
          ? "bg-[var(--athena-orange)]/20 text-[var(--athena-orange)]"
          : "bg-white/5 text-white/55"
      }`}
    >
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

function StageMark({
  number,
  active,
}: {
  number: number;
  active: boolean;
}) {
  return (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        active
          ? "bg-[var(--athena-orange)] text-white"
          : "border border-white/15 text-white/50"
      }`}
    >
      {number}
    </span>
  );
}

function NavRowContent({
  item,
  active,
}: {
  item: LocalizedTenantNavItem;
  active: boolean;
}) {
  return (
    <>
      {item.icon ? <IconMark name={item.icon} active={active} /> : null}
      {item.stageNumber ? (
        <StageMark number={item.stageNumber} active={active} />
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-5">{item.label}</span>
        {item.subtitle ? (
          <span className="mt-0.5 block text-xs leading-4 text-white/40">
            {item.subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/35">
      {children}
    </div>
  );
}

export function TenantHelpCard({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string;
  href?: string;
}) {
  const destination = href ?? helpHrefFromNav();
  const className =
    "block w-full rounded-2xl border border-[var(--athena-orange)]/25 bg-[var(--athena-orange)]/5 p-4 text-left";
  const content = (
    <span className="flex items-start gap-3">
      <IconMark name="help" active={false} />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-5 text-white">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-4 text-white/45">
          {subtitle}
        </span>
      </span>
    </span>
  );

  if (!destination) {
    return (
      <button type="button" disabled aria-disabled="true" className={className}>
        {content}
      </button>
    );
  }

  return (
    <Link href={destination} className={className}>
      {content}
    </Link>
  );
}

function helpHrefFromNav(): string | undefined {
  return tenantNavItems.find((item) => item.key === "needHelp")?.href;
}

export function TenantChromeAfterNav({
  help,
  poweredByGetOblic,
  invite,
}: {
  help?: {
    title: string;
    subtitle: string;
    href?: string;
  };
  poweredByGetOblic: string;
  invite?: UpgradeSidebarContent | null;
}) {
  return (
    <div className={tenantChromeAfterNavClassName}>
      {help ? (
        <div className="mt-6">
          <TenantHelpCard
            title={help.title}
            subtitle={help.subtitle}
            href={help.href}
          />
        </div>
      ) : null}

      {invite ? (
        <div className="mt-6">
          <UpgradeSidebarInvite {...invite} />
        </div>
      ) : null}

      <div className="mt-6 text-xs text-white/30">{poweredByGetOblic}</div>
    </div>
  );
}

export function TenantNavList({
  currentPath,
  items,
  yourGrowthLabel,
  showLockedGuidance = false,
}: TenantNavListProps) {
  const grouped = groupTenantNav(items);

  return (
    <nav className="shrink-0 text-sm">
      <div className="space-y-1">
        {grouped.home.map((item) => (
          <TenantNavItem
            key={item.key}
            item={item}
            currentPath={currentPath}
            showLockedGuidance={showLockedGuidance}
          />
        ))}
      </div>

      <div className="mt-6">
        <SectionLabel>{yourGrowthLabel}</SectionLabel>
        <div className="space-y-1">
          {grouped.growth.map((item) => (
            <TenantNavItem
              key={item.key}
              item={item}
              currentPath={currentPath}
              showLockedGuidance={showLockedGuidance}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}

function TenantNavItem({
  item,
  currentPath,
  showLockedGuidance,
}: {
  item: LocalizedTenantNavItem;
  currentPath: string;
  showLockedGuidance: boolean;
}) {
  const active = isTenantNavActive(currentPath, item);
  const rowClassName = `${tenantNavRowClassName.base} ${
    item.disabled
      ? tenantNavRowClassName.disabled
      : active
        ? tenantNavRowClassName.active
        : tenantNavRowClassName.inactive
  }`;

  if (showLockedGuidance && item.lockedExplanation) {
    return <LockedGrowthNavItem item={item} rowClassName={rowClassName} />;
  }

  if (item.disabled || !item.href) {
    return (
      <div aria-disabled="true" className={rowClassName}>
        <NavRowContent item={item} active={false} />
      </div>
    );
  }

  return (
    <Link href={item.href} className={rowClassName} aria-current={active ? "page" : undefined}>
      <NavRowContent item={item} active={active} />
    </Link>
  );
}

function LockedGrowthNavItem({
  item,
  rowClassName,
}: {
  item: LocalizedTenantNavItem;
  rowClassName: string;
}) {
  const explanationId = `locked-growth-${item.key}`;

  return (
    <div className={lockedGrowthNavGuidanceClassName.group}>
      <div
        aria-disabled="true"
        aria-describedby={explanationId}
        tabIndex={0}
        className={rowClassName}
      >
        <NavRowContent item={item} active={false} />
      </div>
      <div
        id={explanationId}
        role="note"
        className={lockedGrowthNavGuidanceClassName.panel}
      >
        <div className={lockedGrowthNavGuidanceClassName.card}>
          <p className="text-xs font-semibold leading-4 text-white">
            {item.lockedHeading}
          </p>
          <p className="mt-1 text-xs leading-4 text-white/65">
            {item.lockedExplanation}
          </p>
          {item.lockedActionHref && item.lockedActionLabel ? (
            <IdentityTeachAthenaLink
              href={item.lockedActionHref}
              className={`mt-2 inline-flex text-xs font-medium text-[var(--athena-orange)] hover:text-white ${focusRingClassName}`}
            >
              {item.lockedActionLabel}
            </IdentityTeachAthenaLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type TenantSidebarProps = {
  currentPath: string;
  messages?: TenantMessages;
  athenaPlan?: AthenaPlan;
  defineKind?: DefineKind;
};

export function TenantAthenaWordmark({
  titleClassName,
  athenaPlan,
}: {
  titleClassName: string;
  athenaPlan?: AthenaPlan;
}) {
  const title = <div className={titleClassName}>ATHENA</div>;
  if (athenaPlan !== "free") {
    return title;
  }

  return (
    <div className="flex items-center gap-2">
      {title}
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">
        {athenaPlanBadgeLabel(athenaPlan)}
      </span>
    </div>
  );
}

export function TenantSidebar({
  currentPath,
  messages = en,
  athenaPlan,
  defineKind,
}: TenantSidebarProps) {
  const items = applyFreeUntrainedNavPresentation(
    localizeTenantNav(messages),
    { athenaPlan, defineKind },
    freeUntrainedLockedNavCopy(messages.nav),
  );
  const help = groupTenantNav(items).help[0];
  const invite = resolveGlobalFullAthenaInvite(
    { athenaPlan, defineKind },
    messages.upgrade,
  );

  return (
    <aside className={tenantSidebarFrameClassName}>
      <Link
        href="/"
        className={`mb-8 inline-block shrink-0 transition hover:opacity-90 ${focusRingClassName}`}
      >
        <TenantAthenaWordmark
          titleClassName="text-2xl font-bold tracking-tight"
          athenaPlan={athenaPlan}
        />
        <div className="mt-1 text-sm text-white/45">{messages.chrome.tagline}</div>
      </Link>

      <TenantNavList
        currentPath={currentPath}
        items={items}
        yourGrowthLabel={messages.nav.yourGrowth}
        utilitiesLabel={messages.nav.utilities}
        moreToolsLabel={messages.nav.moreTools}
        showLockedGuidance
      />

      <TenantChromeAfterNav
        help={
          help
            ? {
                title: help.label,
                subtitle: help.subtitle ?? "",
                href: help.href,
              }
            : undefined
        }
        poweredByGetOblic={messages.chrome.poweredByGetOblic}
        invite={invite}
      />
    </aside>
  );
}
