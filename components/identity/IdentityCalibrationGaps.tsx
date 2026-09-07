import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { IdentityCalibrationGap } from "@/services/identity/identityExecutiveIntelligence";
import {
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
    <section
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-6 sm:p-8`}
    >
      <h2 className="text-2xl font-semibold tracking-tight">{page.gapsTitle}</h2>

      {materialGaps.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-white/55">{page.gapsEmpty}</p>
      ) : (
        <ul className="mt-6 space-y-4">
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
    </section>
  );
}
