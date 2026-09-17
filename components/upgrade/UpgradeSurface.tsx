"use client";

import { Sparkles } from "lucide-react";
import { useId } from "react";
import {
  defaultUpgradeCtaTone,
  isUpgradeCtaActionInteractive,
  resolveUpgradeAccent,
  type UpgradeCtaAction,
  type UpgradeContextualContent,
  type UpgradeContextualVariant,
} from "@/lib/upgrade/upgradePresentation";
import { UpgradeCapabilitiesList } from "@/components/upgrade/UpgradeCapabilities";
import { UpgradeInlineCTA } from "@/components/upgrade/UpgradeInlineCTA";
import {
  UPGRADE_ACCENT_ICON,
  UPGRADE_ACCENT_SURFACE,
  UPGRADE_CARD_BASE_CLASS,
  UPGRADE_CTA_STATIC_CLASS,
} from "@/components/upgrade/upgradeVisual";

export type UpgradeSurfaceProps = UpgradeContextualContent & {
  variant: UpgradeContextualVariant;
  action?: UpgradeCtaAction;
  headingLevel?: 2 | 3;
};

export function UpgradeSurface({
  variant,
  feature,
  headline,
  capabilities,
  eyebrow,
  supportingText,
  ctaLabel,
  accent,
  ctaTone,
  action,
  headingLevel = 2,
}: UpgradeSurfaceProps) {
  const headingId = useId();
  const capabilitiesId = useId();
  const supportingId = useId();
  const resolvedAccent = resolveUpgradeAccent(feature, accent);
  const resolvedTone = ctaTone ?? defaultUpgradeCtaTone(variant);
  const HeadingTag = headingLevel === 3 ? "h3" : "h2";
  const describedBy = supportingText
    ? `${capabilitiesId} ${supportingId}`
    : capabilitiesId;

  return (
    <section
      role={variant === "completion" ? "region" : "note"}
      aria-labelledby={headingId}
      className={`${UPGRADE_CARD_BASE_CLASS} ${UPGRADE_ACCENT_SURFACE[resolvedAccent]}`}
      data-upgrade-feature={feature}
      data-upgrade-accent={resolvedAccent}
      data-upgrade-variant={variant}
      data-upgrade-cta-tone={resolvedTone}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${UPGRADE_ACCENT_ICON[resolvedAccent]}`}
        >
          <Sparkles size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              {eyebrow}
            </p>
          ) : null}
          <HeadingTag
            id={headingId}
            className="mt-1 text-lg font-semibold tracking-tight text-white"
          >
            {headline}
          </HeadingTag>
        </div>
      </div>

      <UpgradeCapabilitiesList
        id={capabilitiesId}
        capabilities={capabilities}
        accent={resolvedAccent}
      />

      {supportingText ? (
        <p id={supportingId} className="mt-3 text-sm leading-6 text-white/50">
          {supportingText}
        </p>
      ) : null}

      <div className="mt-5">
        {isUpgradeCtaActionInteractive(action) ? (
          <UpgradeInlineCTA
            label={ctaLabel}
            tone={resolvedTone}
            action={action}
            describedBy={describedBy}
          />
        ) : ctaLabel ? (
          <p
            className={UPGRADE_CTA_STATIC_CLASS[resolvedTone]}
            data-upgrade-cta-tone={resolvedTone}
            data-upgrade-cta-kind="none"
          >
            {ctaLabel}
          </p>
        ) : null}
      </div>
    </section>
  );
}
