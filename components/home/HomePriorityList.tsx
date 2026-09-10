import Link from "next/link";
import {
  AlertTriangle,
  Bookmark,
  Brain,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Gauge,
  ListTodo,
  Search,
  SearchX,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HomePriorityAccent, HomePriorityId } from "@/lib/home/homeAttention";
import {
  HOME_FEATURED_PRIORITY_SURFACE_CLASS,
  HOME_PRIORITY_ACCENT,
  HOME_PRIORITY_SURFACE_CLASS,
} from "@/lib/home/homePresentation";

export type HomePriorityListItem = {
  id: HomePriorityId;
  title: string;
  body: string;
  href: string;
  cta: string;
  countLabel?: string | null;
  accent: HomePriorityAccent;
  featured?: boolean;
};

type HomePriorityListProps = {
  title: string;
  intro: string;
  items: HomePriorityListItem[];
  emptyLabel: string;
};

const ICONS: Record<HomePriorityId, LucideIcon> = {
  trainAthena: Brain,
  reviewReadyOpportunities: CircleCheck,
  advanceStrongProspects: TrendingUp,
  workingItemsNeedingAttention: ListTodo,
  failedIntelligence: AlertTriangle,
  missingIntelligence: CircleDashed,
  emptyPipelineAvailableCapacity: Search,
  capacityFull: Gauge,
  heldWithoutReadyIntelligence: Bookmark,
  completeDefinition: ClipboardList,
  reviewFailedVisibility: SearchX,
  establishVisibility: Search,
  defineFirstAudience: Users,
};

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export function HomePriorityList({
  title,
  intro,
  items,
  emptyLabel,
}: HomePriorityListProps) {
  return (
    <section>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
        {title}
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">{intro}</p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm leading-6 text-white/50">{emptyLabel}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item, index) => {
            const Icon = ICONS[item.id];
            const accent = HOME_PRIORITY_ACCENT[item.accent];
            const featured = Boolean(item.featured) || index === 0;
            return (
              <li key={`${item.id}-${item.href}`}>
                <Link
                  href={item.href}
                  className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${
                    featured
                      ? HOME_FEATURED_PRIORITY_SURFACE_CLASS
                      : HOME_PRIORITY_SURFACE_CLASS
                  } ${featured ? accent.featuredBorder : accent.border} ${focusRingClassName}`}
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-2xl border ${accent.iconWell}`}
                    >
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-white">
                          {item.title}
                        </div>
                        {item.countLabel ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white/65">
                            {item.countLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm leading-6 text-white/48">
                        {item.body}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20">
                    {item.cta}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
