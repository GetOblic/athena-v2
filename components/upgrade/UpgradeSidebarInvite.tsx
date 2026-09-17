"use client";

import { Sparkles } from "lucide-react";
import { useId } from "react";
import {
  defaultUpgradeCtaTone,
  isUpgradeCtaActionInteractive,
  type UpgradeCtaAction,
  type UpgradeSidebarContent,
} from "@/lib/upgrade/upgradePresentation";
import { UpgradeInlineCTA } from "@/components/upgrade/UpgradeInlineCTA";
import {
  UPGRADE_ACCENT_ICON,
  UPGRADE_ACCENT_SURFACE,
  UPGRADE_SIDEBAR_BASE_CLASS,
} from "@/components/upgrade/upgradeVisual";

export type UpgradeSidebarInviteProps = UpgradeSidebarContent & {
  action?: UpgradeCtaAction;
};

export function UpgradeSidebarInvite({
  eyebrow,
  headline,
  supportingText,
  ctaLabel,
  ctaTone = "quiet",
  action,
}: UpgradeSidebarInviteProps) {
  const headingId = useId();
  const supportingId = useId();
  const resolvedTone = ctaTone ?? defaultUpgradeCtaTone("sidebar");

  return (
    <div
      role="note"
      aria-labelledby={headingId}
      className={`${UPGRADE_SIDEBAR_BASE_CLASS} ${UPGRADE_ACCENT_SURFACE.chrome}`}
      data-upgrade-feature="chrome"
      data-upgrade-accent="chrome"
      data-upgrade-variant="sidebar"
      data-upgrade-cta-tone={resolvedTone}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${UPGRADE_ACCENT_ICON.chrome}`}
        >
          <Sparkles size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            {eyebrow}
          </p>
          <p
            id={headingId}
            className="mt-1 text-sm font-semibold leading-5 text-white/85"
          >
            {headline}
          </p>
        </div>
      </div>
      {supportingText ? (
        <p id={supportingId} className="mt-3 text-sm leading-6 text-white/50">
          {supportingText}
        </p>
      ) : null}
      {isUpgradeCtaActionInteractive(action) ? (
        <div className="mt-3">
          <UpgradeInlineCTA
            label={ctaLabel}
            tone={resolvedTone}
            action={action}
            describedBy={supportingText ? `${headingId} ${supportingId}` : headingId}
          />
        </div>
      ) : ctaLabel ? (
        <p
          className="mt-3 text-sm font-semibold leading-5 text-white/70"
          data-upgrade-cta-tone={resolvedTone}
          data-upgrade-cta-kind="none"
        >
          {ctaLabel}
        </p>
      ) : null}
    </div>
  );
}
