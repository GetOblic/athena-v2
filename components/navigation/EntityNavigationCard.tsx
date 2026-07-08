import Link from "next/link";

type EntityNavigationCardProps = {
  title: string;
  description: string;
  href: string;
};

export function EntityNavigationCard({
  title,
  description,
  href,
}: EntityNavigationCardProps) {
  return (
    <Link
      href={href}
      className="group block cursor-pointer rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--athena-orange)]/60 hover:bg-white/[0.03] hover:shadow-lg hover:shadow-black/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-lg font-semibold text-white group-hover:text-[var(--athena-orange)]">
          {title}
        </div>
        <span className="text-lg text-white/20 transition group-hover:text-[var(--athena-orange)]">
          →
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-white/50 group-hover:text-white/60">
        {description}
      </p>
    </Link>
  );
}
