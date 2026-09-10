import type { GetOblicListingCapacityResult } from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  PROSPECT_CAPACITY_LABEL_CLASS,
  PROSPECT_CAPACITY_SURFACE_CLASS,
} from "@/lib/prospects/prospectLibraryPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type GetOblicListingCapacitySummaryProps = {
  capacity: GetOblicListingCapacityResult;
  messages: TenantMessages["prospects"]["list"];
};

export function GetOblicListingCapacitySummary({
  capacity,
  messages,
}: GetOblicListingCapacitySummaryProps) {
  if (!capacity.configured) {
    return (
      <div
        className={PROSPECT_CAPACITY_SURFACE_CLASS}
        data-getoblic-capacity="unconfigured"
      >
        <p className={PROSPECT_CAPACITY_LABEL_CLASS}>
          {messages.capacityTitle}
        </p>
        <p className="mt-2 text-sm leading-6 text-white/50">
          {messages.capacityUnconfigured}
        </p>
      </div>
    );
  }

  return (
    <div
      className={PROSPECT_CAPACITY_SURFACE_CLASS}
      data-getoblic-capacity="configured"
      data-getoblic-capacity-available={capacity.available}
    >
      <p className={PROSPECT_CAPACITY_LABEL_CLASS}>{messages.capacityTitle}</p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-[11px] text-white/40">{messages.capacityLabel}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
            {capacity.listingCapacity}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-white/40">
            {messages.currentlyHeldLabel}
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
            {capacity.currentlyHeld}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-white/40">
            {messages.availableLabel}
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-sky-200">
            {capacity.available}
          </dd>
        </div>
      </dl>
    </div>
  );
}
