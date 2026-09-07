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
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  groupTenantNav,
  isTenantNavActive,
  localizeTenantNav,
  tenantNavRowClassName,
  type LocalizedTenantNavItem,
  type TenantNavIconName,
} from "@/components/dashboard/tenantNavigation";

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
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className="w-full rounded-2xl border border-[var(--athena-orange)]/25 bg-[var(--athena-orange)]/5 p-4 text-left"
    >
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
    </button>
  );
}

export function TenantNavList({
  currentPath,
  items,
  yourGrowthLabel,
  utilitiesLabel,
  moreToolsLabel,
}: TenantNavListProps) {
  const grouped = groupTenantNav(items);

  return (
    <nav className="text-sm">
      <div className="space-y-1">
        {grouped.home.map((item) => (
          <TenantNavItem key={item.key} item={item} currentPath={currentPath} />
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
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <SectionLabel>{utilitiesLabel}</SectionLabel>
        <div className="space-y-1">
          {grouped.utilities.map((item) => (
            <TenantNavItem
              key={item.key}
              item={item}
              currentPath={currentPath}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <SectionLabel>{moreToolsLabel}</SectionLabel>
        <div className="space-y-1">
          {grouped.more.map((item) => (
            <TenantNavItem
              key={item.key}
              item={item}
              currentPath={currentPath}
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
}: {
  item: LocalizedTenantNavItem;
  currentPath: string;
}) {
  const active = isTenantNavActive(currentPath, item);
  const rowClassName = `${tenantNavRowClassName.base} ${
    item.disabled
      ? tenantNavRowClassName.disabled
      : active
        ? tenantNavRowClassName.active
        : tenantNavRowClassName.inactive
  }`;

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

type TenantSidebarProps = {
  currentPath: string;
  messages?: TenantMessages;
};

export function TenantSidebar({
  currentPath,
  messages = en,
}: TenantSidebarProps) {
  const items = localizeTenantNav(messages);
  const help = groupTenantNav(items).help[0];

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-[var(--athena-border)] bg-[var(--athena-panel)] p-5 lg:flex">
      <Link
        href="/"
        className={`mb-8 inline-block transition hover:opacity-90 ${focusRingClassName}`}
      >
        <div className="text-2xl font-bold tracking-tight">ATHENA</div>
        <div className="mt-1 text-sm text-white/45">{messages.chrome.tagline}</div>
      </Link>

      <TenantNavList
        currentPath={currentPath}
        items={items}
        yourGrowthLabel={messages.nav.yourGrowth}
        utilitiesLabel={messages.nav.utilities}
        moreToolsLabel={messages.nav.moreTools}
      />

      {help ? (
        <div className="mt-6">
          <TenantHelpCard title={help.label} subtitle={help.subtitle ?? ""} />
        </div>
      ) : null}

      <div className="mt-6 text-xs text-white/30">
        {messages.chrome.poweredByGetOblic}
      </div>
    </aside>
  );
}
