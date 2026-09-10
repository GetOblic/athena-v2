import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Megaphone, MessagesSquare, Users } from "lucide-react";

export type TractionSiblingFamily = "audiences" | "advertising" | "social";

export type TractionSiblingLink = {
  href: string;
  label: string;
  help?: string;
  current?: boolean;
  family?: TractionSiblingFamily;
};

type TractionSiblingNavProps = {
  links: TractionSiblingLink[];
};

const FAMILY_FROM_HREF: Record<string, TractionSiblingFamily> = {
  "/personas": "audiences",
  "/ads": "advertising",
  "/social-planner": "social",
};

const FAMILY_ICON: Record<TractionSiblingFamily, LucideIcon> = {
  audiences: Users,
  advertising: Megaphone,
  social: MessagesSquare,
};

const FAMILY_SURFACE: Record<
  TractionSiblingFamily,
  { idle: string; current: string; icon: string; iconCurrent: string }
> = {
  audiences: {
    idle: "rounded-2xl border border-[rgba(167,139,250,0.22)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_72%)] px-4 py-3 transition hover:border-[rgba(167,139,250,0.40)] hover:bg-white/[0.04]",
    current:
      "rounded-2xl border border-[rgba(167,139,250,0.48)] bg-[linear-gradient(180deg,rgba(167,139,250,0.14),transparent_70%)] px-4 py-3 shadow-[0_0_18px_rgba(167,139,250,0.10)]",
    icon: "grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(167,139,250,0.28)] bg-[rgba(167,139,250,0.10)] text-violet-300",
    iconCurrent:
      "grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(167,139,250,0.42)] bg-[rgba(167,139,250,0.18)] text-violet-200 shadow-[0_0_12px_rgba(167,139,250,0.16)]",
  },
  advertising: {
    idle: "rounded-2xl border border-[rgba(251,191,36,0.22)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_72%)] px-4 py-3 transition hover:border-[rgba(255,102,0,0.40)] hover:bg-white/[0.04]",
    current:
      "rounded-2xl border border-[rgba(255,102,0,0.48)] bg-[linear-gradient(180deg,rgba(255,102,0,0.14),transparent_70%)] px-4 py-3 shadow-[0_0_18px_rgba(255,102,0,0.10)]",
    icon: "grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(255,102,0,0.28)] bg-[rgba(255,102,0,0.10)] text-amber-200",
    iconCurrent:
      "grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(255,102,0,0.42)] bg-[rgba(255,102,0,0.16)] text-orange-200 shadow-[0_0_12px_rgba(255,102,0,0.16)]",
  },
  social: {
    idle: "rounded-2xl border border-[rgba(56,189,248,0.22)] bg-[linear-gradient(180deg,rgba(56,189,248,0.07),rgba(232,121,189,0.05)_58%,transparent_82%)] px-4 py-3 transition hover:border-[rgba(56,189,248,0.40)] hover:bg-white/[0.04]",
    current:
      "rounded-2xl border border-[rgba(56,189,248,0.46)] bg-[linear-gradient(180deg,rgba(56,189,248,0.14),rgba(232,121,189,0.08)_58%,transparent_82%)] px-4 py-3 shadow-[0_0_18px_rgba(56,189,248,0.10)]",
    icon: "grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.10)] text-sky-300",
    iconCurrent:
      "grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(56,189,248,0.42)] bg-[rgba(56,189,248,0.16)] text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.16)]",
  },
};

function resolveFamily(link: TractionSiblingLink): TractionSiblingFamily | null {
  return link.family ?? FAMILY_FROM_HREF[link.href] ?? null;
}

export function TractionSiblingNav({ links }: TractionSiblingNavProps) {
  return (
    <nav className="mt-6 grid gap-3 sm:grid-cols-3">
      {links.map((link) => {
        const family = resolveFamily(link);
        const Icon = family ? FAMILY_ICON[family] : null;
        const chrome = family ? FAMILY_SURFACE[family] : null;
        const surface = chrome
          ? link.current
            ? chrome.current
            : chrome.idle
          : link.current
            ? "rounded-2xl border border-[var(--athena-orange)]/35 bg-[var(--athena-orange)]/10 px-4 py-3"
            : "rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.05]";
        const content = (
          <div className="flex items-start gap-3">
            {Icon && chrome ? (
              <div
                className={link.current ? chrome.iconCurrent : chrome.icon}
                aria-hidden="true"
              >
                <Icon className="size-4" />
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{link.label}</div>
              {link.help ? (
                <p className="mt-1 text-sm leading-6 text-white/50">{link.help}</p>
              ) : null}
            </div>
          </div>
        );

        return link.current ? (
          <div key={link.href} className={surface}>
            {content}
          </div>
        ) : (
          <Link key={link.href} href={link.href} className={surface}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
