import { ExternalLink } from "lucide-react";
import { PROSPECT_UTILITY_CYAN_ACTION } from "@/lib/prospects/prospectDetailPresentation";

type GetOblicFunnelControlsProps = {
  aiAgentsHref: string;
  virtualPhoneHref: string;
  calendarHref: string;
  aiAgentsLabel: string;
  virtualPhoneLabel: string;
  calendarLabel: string;
};

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
  aiAgentsLabel,
  virtualPhoneLabel,
  calendarLabel,
}: GetOblicFunnelControlsProps) {
  return (
    <>
      <FunnelLink
        href={aiAgentsHref}
        label={aiAgentsLabel}
        action="getoblic-funnel-ai-agents"
      />
      <FunnelLink
        href={virtualPhoneHref}
        label={virtualPhoneLabel}
        action="getoblic-funnel-virtual-phone"
      />
      <FunnelLink
        href={calendarHref}
        label={calendarLabel}
        action="getoblic-funnel-calendar"
      />
    </>
  );
}
