import Link from "next/link";
import { Brain } from "lucide-react";
import { CLIENT_PROSPECT_INTELLIGENCE_HREF } from "@/lib/clientProspectIntelligence/clientProspectIntelligencePath";

const rowClassName =
  "flex items-start gap-3 rounded-2xl px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export function ClientProspectIntelligenceNavLink({
  label,
  currentPath,
}: {
  label: string;
  currentPath: string;
}) {
  const active =
    currentPath === CLIENT_PROSPECT_INTELLIGENCE_HREF ||
    currentPath.startsWith(`${CLIENT_PROSPECT_INTELLIGENCE_HREF}/`);
  const stateClassName = active
    ? "bg-[var(--athena-orange)]/15 text-white border border-[var(--athena-orange)]/35"
    : "text-white/60 hover:bg-white/5 hover:text-white";

  return (
    <Link
      href={CLIENT_PROSPECT_INTELLIGENCE_HREF}
      className={`${rowClassName} ${stateClassName}`}
      aria-current={active ? "page" : undefined}
      data-client-prospect-intelligence-nav="true"
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-xl ${
          active
            ? "bg-[var(--athena-orange)]/20 text-[var(--athena-orange)]"
            : "bg-white/5 text-white/55"
        }`}
      >
        <Brain size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-5">{label}</span>
      </span>
    </Link>
  );
}
