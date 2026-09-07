import Link from "next/link";
import { Brain, Search, Target, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type HomeDomainIconName = "brain" | "visibility" | "traction" | "convert";

export type HomeDomainTone =
  | "unknown"
  | "progress"
  | "ready"
  | "attention"
  | "danger"
  | "neutral";

type HomeDomainCardProps = {
  stageNumber: 1 | 2 | 3 | 4;
  icon: HomeDomainIconName;
  title: string;
  question: string;
  tone: HomeDomainTone;
  statusLabel: string;
  statusLine: string;
  details: string[];
  ctaLabel: string;
  href: "/identity" | "/seo" | "/personas" | "/prospects";
};

const ICONS: Record<HomeDomainIconName, LucideIcon> = {
  brain: Brain,
  visibility: Search,
  traction: Target,
  convert: Users,
};

const TONE_CARD: Record<HomeDomainTone, string> = {
  unknown: "",
  progress: "",
  ready: "",
  attention: "border-l-2 border-l-[var(--athena-warning)]",
  danger: "border-l-2 border-l-[var(--athena-danger)]",
  neutral: "",
};

const TONE_STATUS: Record<HomeDomainTone, string> = {
  unknown: "text-white/40",
  progress: "text-[var(--athena-warning)]",
  ready: "text-[var(--athena-success)]",
  attention: "text-[var(--athena-warning)]",
  danger: "text-[var(--athena-danger)]",
  neutral: "text-white/80",
};

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export function HomeDomainCard({
  stageNumber,
  icon,
  title,
  question,
  tone,
  statusLabel,
  statusLine,
  details,
  ctaLabel,
  href,
}: HomeDomainCardProps) {
  const Icon = ICONS[icon];

  return (
    <Link
      href={href}
      className={`group block rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-7 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--athena-orange)]/60 hover:bg-white/[0.03] hover:shadow-lg hover:shadow-black/30 ${TONE_CARD[tone]} ${focusRingClassName}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-xl ${
              tone === "ready"
                ? "bg-[var(--athena-orange)]/20 text-[var(--athena-orange)]"
                : "bg-white/5 text-white/55"
            }`}
          >
            <Icon size={16} aria-hidden="true" />
          </span>
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              tone === "ready"
                ? "bg-[var(--athena-orange)] text-white"
                : "border border-white/15 text-white/50"
            }`}
          >
            {stageNumber}
          </span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
          {statusLabel}
        </span>
      </div>

      <h2 className="mt-5 text-xl font-semibold text-white group-hover:text-[var(--athena-orange)]">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-white/45">{question}</p>
      <p className={`mt-5 text-base leading-6 ${TONE_STATUS[tone]}`}>
        {statusLine}
      </p>
      {details.map((detail) => (
        <p key={detail} className="mt-2 text-sm tabular-nums text-white/45">
          {detail}
        </p>
      ))}
      <div className="mt-6 text-sm font-semibold text-[var(--athena-orange)]">
        {ctaLabel} →
      </div>
    </Link>
  );
}
