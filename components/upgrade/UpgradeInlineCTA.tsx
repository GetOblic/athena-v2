"use client";

import {
  resolveUpgradeCtaAction,
  type UpgradeCtaAction,
  type UpgradeCtaTone,
} from "@/lib/upgrade/upgradePresentation";
import {
  UPGRADE_CTA_TONE_CLASS,
  UPGRADE_FOCUS_RING_CLASS,
} from "@/components/upgrade/upgradeVisual";

export type UpgradeInlineCTAProps = {
  label?: string;
  tone?: UpgradeCtaTone;
  action?: UpgradeCtaAction;
  describedBy?: string;
};

export function UpgradeInlineCTA({
  label,
  tone = "medium",
  action,
  describedBy,
}: UpgradeInlineCTAProps) {
  const resolved = resolveUpgradeCtaAction(action);
  if (!label || resolved.kind === "none") {
    return null;
  }

  const className = `${UPGRADE_CTA_TONE_CLASS[tone]} ${UPGRADE_FOCUS_RING_CLASS}`;

  if (resolved.kind === "href") {
    return (
      <a
        href={resolved.href}
        className={className}
        aria-describedby={describedBy}
        data-upgrade-cta-tone={tone}
        data-upgrade-cta-kind="href"
      >
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={resolved.onContinue}
      aria-describedby={describedBy}
      data-upgrade-cta-tone={tone}
      data-upgrade-cta-kind="handler"
    >
      {label}
    </button>
  );
}
