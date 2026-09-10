import { Target } from "lucide-react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { IdentityCalibrationGap } from "@/services/identity/identityExecutiveIntelligence";
import {
  IDENTITY_CARD_ICON_CLASS,
  IDENTITY_CARD_SURFACE_CLASS,
  IDENTITY_UPDATE_LOCATION_HREFS,
  localizeUpdateLocation,
} from "@/components/identity/identityPagePresentation";

type IdentityCopy = TenantMessages["identity"];

type IdentityCalibrationGapsProps = {
  gaps: IdentityCalibrationGap[];
  messages: IdentityCopy;
};

export function IdentityCalibrationGaps({
  gaps,
  messages,
}: IdentityCalibrationGapsProps) {
  const copy = messages.executive;
  const page = messages.page;
  const materialGaps = gaps.filter((gap) => gap.what_is_unclear.trim());

  return (
    <AthenaCollapsibleSection
      title={page.gapsTitle}
      summary={copy.calibrationTitle}
      defaultOpen={false}
      tone="identity"
      icon={<Target size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.blue}
      className={IDENTITY_CARD_SURFACE_CLASS.blue}
    >
      {materialGaps.length === 0 ? (
        <p className="text-sm leading-7 text-white/55">{page.gapsEmpty}</p>
      ) : (
        <ul className="space-y-4">
          {materialGaps.map((gap) => {
            const href = IDENTITY_UPDATE_LOCATION_HREFS[gap.update_location];
            const locationLabel = localizeUpdateLocation(
              gap.update_location,
              page,
            );
            return (
              <li
                key={`${gap.what_is_unclear}:${gap.update_location}`}
                className="rounded-2xl border border-white/10 bg-black/20 p-5"
              >
                <div className="text-sm font-semibold text-white/85">
                  {copy.whatIsUnclearPrefix} {gap.what_is_unclear}
                </div>
                <div className="mt-2 text-sm leading-6 text-white/60">
                  {copy.whyItMattersPrefix} {gap.why_it_matters}
                </div>
                <div className="mt-2 text-sm text-[var(--athena-orange)]">
                  {copy.updatePrefix} {locationLabel}
                </div>
                <a
                  href={href}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-[var(--athena-orange)]/40 bg-black/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/30 sm:w-auto"
                >
                  {page.gapsGoToField}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </AthenaCollapsibleSection>
  );
}
