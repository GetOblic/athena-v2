import Link from "next/link";
import { PenLine, Search, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const IDENTITY_HREF = "/identity";

const VALUE_PREVIEWS: ReadonlyArray<{
  title: string;
  body: string;
  icon: LucideIcon;
  iconWell: string;
  border: string;
}> = [
  {
    title: "Create content",
    body: "Personalized social and evergreen ideas built from your business.",
    icon: PenLine,
    iconWell:
      "border-[rgba(167,139,250,0.28)] bg-[rgba(167,139,250,0.1)] text-violet-300",
    border: "border-[rgba(167,139,250,0.2)]",
  },
  {
    title: "Build visibility",
    body: "Understand and improve how customers discover your business.",
    icon: Search,
    iconWell:
      "border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.1)] text-sky-300",
    border: "border-[rgba(56,189,248,0.18)]",
  },
  {
    title: "Find opportunities",
    body: "Turn business intelligence into actionable growth opportunities.",
    icon: Target,
    iconWell:
      "border-[rgba(0,208,132,0.32)] bg-[rgba(0,208,132,0.12)] text-[var(--athena-success)]",
    border: "border-[rgba(0,208,132,0.22)]",
  },
];

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export function FreeFirstSessionHome() {
  return (
    <div data-home-surface="free-first-session">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Athena Free
      </div>

      <h1 className="mt-4 text-5xl font-semibold tracking-tight">Meet Athena.</h1>

      <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
        Athena learns how your business works, who you serve, and how you
        communicate — then uses that understanding to help you grow.
      </p>

      <div className="mt-8">
        <Link
          href={IDENTITY_HREF}
          data-free-first-session-cta="identity"
          className={`inline-flex rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 ${focusRingClassName}`}
        >
          Teach Athena about my business
        </Link>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/45">
          This begins by teaching Athena about your business.
        </p>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {VALUE_PREVIEWS.map((preview) => {
          const Icon = preview.icon;
          return (
            <article
              key={preview.title}
              className={`rounded-[24px] border bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_58%)] p-6 shadow-[0_0_22px_rgba(0,0,0,0.18)] ${preview.border}`}
            >
              <span
                className={`grid size-11 place-items-center rounded-2xl border ${preview.iconWell}`}
              >
                <Icon size={18} aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-white">
                {preview.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/48">
                {preview.body}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
