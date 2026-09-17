"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { GetOblicOpportunityDiscovery } from "@/components/prospects/GetOblicOpportunityDiscovery";
import { GoogleBusinessDiscovery } from "@/components/prospects/GoogleBusinessDiscovery";
import { defaultOpportunityDiscoveryMethod } from "@/lib/prospects/freeConvertPresentation";
import { PROSPECT_CARD_ICON_WELL_CLASS } from "@/lib/prospects/prospectLibraryPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { UpgradeUnavailableCard } from "@/components/upgrade/UpgradeUnavailableCard";
import { getoblicDirectoryUpgradeContent } from "@/lib/upgrade/freeFeatureUpgradePresentation";

export type OpportunityDiscoveryMethod = "directory" | "google";

type OpportunityDiscoveryMethodsProps = {
  messages: TenantMessages;
  prospectCapacityReached: boolean;
  listingCapacityReached: boolean;
  authorMappingMissing: boolean;
  canAddProspect?: boolean;
  directoryAvailable?: boolean;
  googleAvailable?: boolean;
};

function methodCardClass(selected: boolean): string {
  return selected
    ? "rounded-[24px] border border-[rgba(56,189,248,0.36)] bg-[linear-gradient(180deg,rgba(56,189,248,0.10),transparent_72%)] px-4 py-3 text-left shadow-[0_0_16px_rgba(56,189,248,0.06)]"
    : "rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]";
}

function unavailableMethodCardClass(): string {
  return "rounded-[24px] border border-dashed border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_72%)] px-4 py-3 text-left";
}

function MethodIconWell({
  selected,
  children,
}: {
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`${PROSPECT_CARD_ICON_WELL_CLASS} ${selected ? "" : "opacity-50"}`}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

export function OpportunityDiscoveryMethods({
  messages,
  prospectCapacityReached,
  listingCapacityReached,
  authorMappingMissing,
  canAddProspect = true,
  directoryAvailable = true,
  googleAvailable = true,
}: OpportunityDiscoveryMethodsProps) {
  const copy = messages.prospects.find;
  const directoryUnavailableId = useId();
  const googleUnavailableId = useId();
  const [method, setMethod] = useState<OpportunityDiscoveryMethod>(
    defaultOpportunityDiscoveryMethod(directoryAvailable),
  );
  const [googleVisited, setGoogleVisited] = useState(
    googleAvailable && !directoryAvailable,
  );

  function selectMethod(next: OpportunityDiscoveryMethod) {
    if (next === "directory" && !directoryAvailable) {
      return;
    }
    if (next === "google" && !googleAvailable) {
      return;
    }
    setMethod(next);
    if (next === "google") {
      setGoogleVisited(true);
    }
  }

  return (
    <div className="space-y-6">
      <div
        className="grid gap-3 sm:grid-cols-2"
        role={directoryAvailable ? "tablist" : undefined}
      >
        {directoryAvailable ? (
          <button
            type="button"
            role="tab"
            data-discovery-source="directory"
            data-discovery-available="true"
            aria-selected={method === "directory"}
            onClick={() => selectMethod("directory")}
            className={methodCardClass(method === "directory")}
          >
            <div className="flex items-start gap-3">
              <MethodIconWell selected={method === "directory"}>
                <Building2 className="size-4" />
              </MethodIconWell>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  {copy.methods.directoryLabel}
                </div>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  {copy.methods.directoryDescription}
                </p>
              </div>
            </div>
          </button>
        ) : (
          <div
            data-discovery-source="directory"
            data-discovery-available="false"
            aria-disabled="true"
            aria-describedby={directoryUnavailableId}
          >
            <UpgradeUnavailableCard
              {...getoblicDirectoryUpgradeContent({
                continuation: copy.methods.directoryContinuation,
                upgrade: messages.upgrade,
                availabilityLabel: copy.methods.directoryUnavailable,
              })}
              headingLevel={3}
            />
            <p id={directoryUnavailableId} className="sr-only">
              {copy.methods.directoryUnavailable}
            </p>
          </div>
        )}
        {googleAvailable ? (
          <button
            type="button"
            role={directoryAvailable ? "tab" : undefined}
            data-discovery-source="google"
            data-discovery-available="true"
            aria-selected={method === "google"}
            onClick={() => selectMethod("google")}
            className={methodCardClass(method === "google")}
          >
            <div className="flex items-start gap-3">
              <MethodIconWell selected={method === "google"}>
                <MapPin className="size-4" />
              </MethodIconWell>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  {copy.methods.googleLabel}
                </div>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  {copy.methods.googleDescription}
                </p>
              </div>
            </div>
          </button>
        ) : (
          <div
            data-discovery-source="google"
            data-discovery-available="false"
            aria-disabled="true"
            aria-describedby={googleUnavailableId}
            className={unavailableMethodCardClass()}
          >
            <div className="flex items-start gap-3">
              <MethodIconWell selected={false}>
                <MapPin className="size-4" />
              </MethodIconWell>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  {copy.methods.googleLabel}
                </div>
                <p
                  id={googleUnavailableId}
                  className="mt-1 text-sm leading-6 text-sky-200/85"
                >
                  {copy.methods.googleUnavailable}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {directoryAvailable ? (
        <div className={method === "directory" ? "" : "hidden"}>
          <GetOblicOpportunityDiscovery
            messages={messages}
            prospectCapacityReached={prospectCapacityReached}
            canAddProspect={canAddProspect}
          />
        </div>
      ) : null}

      {googleAvailable && googleVisited ? (
        <div className={method === "google" ? "" : "hidden"}>
          <GoogleBusinessDiscovery
            messages={messages}
            authorMappingMissing={authorMappingMissing}
            listingCapacityReached={listingCapacityReached}
            prospectCapacityReached={prospectCapacityReached}
            canAddProspect={canAddProspect}
          />
        </div>
      ) : null}
    </div>
  );
}
