import Link from "next/link";
import { Brain, Search, Target, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HomeDomainTone } from "@/components/home/HomeDomainCard";
import { HOME_READINESS_SURFACE_CLASS } from "@/lib/home/homePresentation";

type ReadinessTile = {
  icon: LucideIcon;
  title: string;
  href: "/identity" | "/seo" | "/personas" | "/prospects";
  tone: HomeDomainTone;
  statusLabel: string;
  statusLine: string;
  ctaLabel: string;
};

type HomeBusinessReadinessProps = {
  title: string;
  intro: string;
  tiles: ReadinessTile[];
};

const TONE_STATUS: Record<HomeDomainTone, string> = {
  unknown: "text-white/40",
  progress: "text-[var(--athena-warning)]",
  ready: "text-[var(--athena-success)]",
  attention: "text-[var(--athena-warning)]",
  danger: "text-[var(--athena-danger)]",
  neutral: "text-white/80",
};

const TONE_BAR: Record<HomeDomainTone, string> = {
  unknown: "",
  progress: "border-l-[var(--athena-warning)]",
  ready: "border-l-[var(--athena-success)]",
  attention: "border-l-[var(--athena-warning)]",
  danger: "border-l-[var(--athena-danger)]",
  neutral: "",
};

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export function HomeBusinessReadiness({
  title,
  intro,
  tiles,
}: HomeBusinessReadinessProps) {
  return (
    <section className="mt-10">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
        {title}
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">{intro}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className={`${HOME_READINESS_SURFACE_CLASS} border-l-2 ${TONE_BAR[tile.tone] || "border-l-transparent"} ${focusRingClassName}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-xl border border-white/8 bg-white/[0.04] text-white/60">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  {tile.statusLabel}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-white">
                {tile.title}
              </h3>
              <p className={`mt-2 text-sm leading-6 ${TONE_STATUS[tile.tone]}`}>
                {tile.statusLine}
              </p>
              <div className="mt-4 text-sm font-semibold text-[var(--athena-orange)]">
                {tile.ctaLabel} →
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
