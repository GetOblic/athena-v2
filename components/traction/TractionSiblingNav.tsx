import Link from "next/link";

export type TractionSiblingLink = {
  href: string;
  label: string;
  help?: string;
  current?: boolean;
};

type TractionSiblingNavProps = {
  links: TractionSiblingLink[];
};

export function TractionSiblingNav({ links }: TractionSiblingNavProps) {
  return (
    <nav className="mt-6 grid gap-3 sm:grid-cols-2">
      {links.map((link) =>
        link.current ? (
          <div
            key={link.href}
            className="rounded-2xl border border-[var(--athena-orange)]/35 bg-[var(--athena-orange)]/10 px-4 py-3"
          >
            <div className="text-sm font-semibold text-white">{link.label}</div>
            {link.help ? (
              <p className="mt-1 text-sm leading-6 text-white/50">{link.help}</p>
            ) : null}
          </div>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            <div className="text-sm font-semibold text-white">{link.label}</div>
            {link.help ? (
              <p className="mt-1 text-sm leading-6 text-white/50">{link.help}</p>
            ) : null}
          </Link>
        ),
      )}
    </nav>
  );
}
