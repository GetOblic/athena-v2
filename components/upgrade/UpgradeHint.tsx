"use client";

import { useId } from "react";
import {
  defaultUpgradeCtaTone,
  resolveUpgradeAccent,
  type UpgradeCtaAction,
  type UpgradeContextualContent,
} from "@/lib/upgrade/upgradePresentation";
import { UpgradeCapabilitiesList } from "@/components/upgrade/UpgradeCapabilities";
import { UpgradeInlineCTA } from "@/components/upgrade/UpgradeInlineCTA";
import { UPGRADE_HINT_BASE_CLASS } from "@/components/upgrade/upgradeVisual";

export type UpgradeHintProps = UpgradeContextualContent & {
  action?: UpgradeCtaAction;
};

export function UpgradeHint({
  feature,
  headline,
  capabilities,
  eyebrow,
  supportingText,
  ctaLabel,
  accent,
  ctaTone,
  action,
}: UpgradeHintProps) {
  const headingId = useId();
  const capabilitiesId = useId();
  const supportingId = useId();
  const resolvedAccent = resolveUpgradeAccent(feature, accent);
  const resolvedTone = ctaTone ?? defaultUpgradeCtaTone("hint");
  const describedBy = supportingText
    ? `${capabilitiesId} ${supportingId}`
    : capabilitiesId;

  return (
    <div
      role="note"
      aria-labelledby={headingId}
      className={UPGRADE_HINT_BASE_CLASS}
      data-upgrade-feature={feature}
      data-upgrade-accent={resolvedAccent}
      data-upgrade-variant="hint"
      data-upgrade-cta-tone={resolvedTone}
    >
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {eyebrow}
        </p>
      ) : null}
      <p
        id={headingId}
        className="mt-1 text-sm font-semibold text-white/85"
      >
        {headline}
      </p>
      <UpgradeCapabilitiesList
        id={capabilitiesId}
        capabilities={capabilities}
        accent={resolvedAccent}
      />
      {supportingText ? (
        <p id={supportingId} className="mt-2 text-sm leading-6 text-white/50">
          {supportingText}
        </p>
      ) : null}
      <div className="mt-3">
        <UpgradeInlineCTA
          label={ctaLabel}
          tone={resolvedTone}
          action={action}
          describedBy={describedBy}
        />
      </div>
    </div>
  );
}
