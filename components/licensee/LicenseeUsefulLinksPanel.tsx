import type { ReactNode } from "react";
import { Bot, Calendar, ExternalLink, Phone } from "lucide-react";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  LICENSEE_CARD_SURFACE,
  LICENSEE_EMPTY_STATE_CLASS,
  LICENSEE_ICON_WELL,
  LICENSEE_WARNING_NOTICE_CLASS,
  type LicenseeDashboardAccent,
} from "@/lib/licensee/licenseeDashboardPresentation";
import type { LicenseeUsefulLinks } from "@/lib/licensee/licenseeUsefulLinksPresentation";

export type LicenseeUsefulLinksPanelState =
  | { status: "ready"; links: LicenseeUsefulLinks }
  | { status: "no_own_company" }
  | { status: "unavailable" };

export function LicenseeUsefulLinksPanel({
  messages,
  state,
}: {
  messages: LicenseeMessages;
  state: LicenseeUsefulLinksPanelState;
}) {
  if (state.status === "no_own_company") {
    return (
      <div className={LICENSEE_WARNING_NOTICE_CLASS}>
        <h2 className="text-base font-semibold text-white">
          {messages.usefulLinks.noOwnCompanyTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/60">
          {messages.usefulLinks.noOwnCompanyBody}
        </p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className={LICENSEE_EMPTY_STATE_CLASS}>
        <h2 className="text-base font-semibold text-white">
          {messages.usefulLinks.unavailableTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/55">
          {messages.usefulLinks.unavailableBody}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ExternalToolCard
        accent="orange"
        icon={<Bot size={18} />}
        title={messages.usefulLinks.aiAgents}
        href={state.links.aiAgentsHref}
        openLabel={messages.common.open}
      />
      <ExternalToolCard
        accent="blue"
        icon={<Phone size={18} />}
        title={messages.usefulLinks.virtualPhone}
        href={state.links.virtualPhoneHref}
        openLabel={messages.common.open}
      />
      <ExternalToolCard
        accent="violet"
        icon={<Calendar size={18} />}
        title={messages.usefulLinks.calendar}
        href={state.links.calendarHref}
        openLabel={messages.common.open}
      />
    </div>
  );
}

function ExternalToolCard({
  accent,
  icon,
  title,
  href,
  openLabel,
}: {
  accent: LicenseeDashboardAccent;
  icon: ReactNode;
  title: string;
  href: string;
  openLabel: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] px-5 py-5 transition ${LICENSEE_CARD_SURFACE[accent]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl ${LICENSEE_ICON_WELL[accent]}`}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="text-base font-semibold text-white">{title}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--athena-orange)]">
          {openLabel}
          <ExternalLink className="size-4" aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}
