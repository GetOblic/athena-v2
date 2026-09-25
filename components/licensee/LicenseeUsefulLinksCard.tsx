import Link from "next/link";
import { Link2 } from "lucide-react";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  LICENSEE_ICON_WELL,
  LICENSEE_USEFUL_LINKS_CARD_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";

export function LicenseeUsefulLinksCard({
  messages,
}: {
  messages: LicenseeMessages;
}) {
  return (
    <Link href="/licensee/useful-links" className={LICENSEE_USEFUL_LINKS_CARD_CLASS}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl ${LICENSEE_ICON_WELL.orange}`}
            aria-hidden="true"
          >
            <Link2 size={18} />
          </span>
          <div>
            <div className="text-base font-semibold text-white">
              {messages.dashboard.usefulLinksTitle}
            </div>
            <p className="mt-1 text-sm leading-6 text-white/50">
              {messages.dashboard.usefulLinksDescription}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-[var(--athena-orange)]">
          {messages.common.open}
        </span>
      </div>
    </Link>
  );
}
