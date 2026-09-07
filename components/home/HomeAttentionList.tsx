import Link from "next/link";
import type { HomeAttentionHref } from "@/lib/home/homeAttention";

export type HomeAttentionListItem = {
  title: string;
  body: string;
  href: HomeAttentionHref;
  cta: string;
};

type HomeAttentionListProps = {
  title: string;
  intro: string;
  items: HomeAttentionListItem[];
  emptyLabel: string;
};

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export function HomeAttentionList({
  title,
  intro,
  items,
  emptyLabel,
}: HomeAttentionListProps) {
  return (
    <section className="mt-10">
      <h2 className="text-3xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">{intro}</p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm leading-6 text-white/50">{emptyLabel}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((item) => (
            <li key={`${item.href}-${item.title}`}>
              <Link
                href={item.href}
                className={`flex flex-col gap-4 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 transition hover:border-[var(--athena-orange)]/60 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between ${focusRingClassName}`}
              >
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    {item.body}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20">
                  {item.cta}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
