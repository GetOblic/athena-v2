import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-[var(--athena-border)] bg-[#0f0f14] px-10 py-8">
      <div className="flex items-start justify-between gap-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Institutional Intelligence Platform
          </div>

          <h1 className="mt-4 text-5xl font-semibold tracking-tight">
            Athena
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            Monitor communities. Analyze discussions. Generate executive briefings.
          </p>
        </div>

        <Link
          href="/discussions"
          className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          View Discussions
        </Link>
      </div>
    </header>
  );
}
