import { ExternalLink, Phone } from "lucide-react";
import { PROSPECT_UTILITY_CYAN_ACTION } from "@/lib/prospects/prospectDetailPresentation";

type GetOblicFunnelControlsProps = {
  aiAgentsHref?: string | null;
  virtualPhoneHref?: string | null;
  calendarHref?: string | null;
  callHref?: string | null;
  claimHref?: string | null;
  aiAgentsLabel?: string | null;
  virtualPhoneLabel?: string | null;
  calendarLabel?: string | null;
  callLabel?: string | null;
  claimLabel?: string | null;
};

function isHttpsHref(href: string | null | undefined): href is string {
  return typeof href === "string" && href.startsWith("https://");
}

function isTelHref(href: string | null | undefined): href is string {
  return typeof href === "string" && href.startsWith("tel:+");
}

function hasLabel(label: string | null | undefined): label is string {
  return typeof label === "string" && label.trim().length > 0;
}

function FunnelLink({
  href,
  label,
  action,
}: {
  href: string;
  label: string;
  action: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-prospect-header-action={action}
      className={PROSPECT_UTILITY_CYAN_ACTION}
    >
      <ExternalLink className="size-4" />
      {label}
    </a>
  );
}

export function GetOblicFunnelControls({
  aiAgentsHref,
  virtualPhoneHref,
  calendarHref,
  callHref,
  claimHref,
  aiAgentsLabel,
  virtualPhoneLabel,
  calendarLabel,
  callLabel,
  claimLabel,
}: GetOblicFunnelControlsProps) {
  return (
    <>
      {isHttpsHref(aiAgentsHref) && hasLabel(aiAgentsLabel) ? (
        <FunnelLink
          href={aiAgentsHref}
          label={aiAgentsLabel}
          action="getoblic-funnel-ai-agents"
        />
      ) : null}
      {isHttpsHref(virtualPhoneHref) && hasLabel(virtualPhoneLabel) ? (
        <FunnelLink
          href={virtualPhoneHref}
          label={virtualPhoneLabel}
          action="getoblic-funnel-virtual-phone"
        />
      ) : null}
      {isHttpsHref(calendarHref) && hasLabel(calendarLabel) ? (
        <FunnelLink
          href={calendarHref}
          label={calendarLabel}
          action="getoblic-funnel-calendar"
        />
      ) : null}
      {isTelHref(callHref) && hasLabel(callLabel) ? (
        <a
          href={callHref}
          data-prospect-header-action="getoblic-funnel-call-your-ai"
          className={PROSPECT_UTILITY_CYAN_ACTION}
        >
          <Phone className="size-4" aria-hidden="true" />
          {callLabel}
        </a>
      ) : null}
      {isHttpsHref(claimHref) && hasLabel(claimLabel) ? (
        <FunnelLink
          href={claimHref}
          label={claimLabel}
          action="getoblic-funnel-claim-your-ai"
        />
      ) : null}
    </>
  );
}
