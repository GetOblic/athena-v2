"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { GetOblicOpportunityDiscovery } from "@/components/prospects/GetOblicOpportunityDiscovery";
import { GoogleBusinessDiscovery } from "@/components/prospects/GoogleBusinessDiscovery";
import { PROSPECT_CARD_ICON_WELL_CLASS } from "@/lib/prospects/prospectLibraryPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type OpportunityDiscoveryMethod = "directory" | "google";

type OpportunityDiscoveryMethodsProps = {
  messages: TenantMessages;
  notConfigured: boolean;
  listingCapacityReached: boolean;
  authorMappingMissing: boolean;
};

function methodCardClass(selected: boolean): string {
  return selected
    ? "rounded-[24px] border border-[rgba(56,189,248,0.36)] bg-[linear-gradient(180deg,rgba(56,189,248,0.10),transparent_72%)] px-4 py-3 text-left shadow-[0_0_16px_rgba(56,189,248,0.06)]"
    : "rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]";
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
  notConfigured,
  listingCapacityReached,
  authorMappingMissing,
}: OpportunityDiscoveryMethodsProps) {
  const copy = messages.prospects.find;
  const [method, setMethod] = useState<OpportunityDiscoveryMethod>("directory");
  const [googleVisited, setGoogleVisited] = useState(false);

  function selectMethod(next: OpportunityDiscoveryMethod) {
    setMethod(next);
    if (next === "google") {
      setGoogleVisited(true);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2" role="tablist">
        <button
          type="button"
          role="tab"
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
        <button
          type="button"
          role="tab"
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
      </div>

      <div className={method === "directory" ? "" : "hidden"}>
        <GetOblicOpportunityDiscovery
          messages={messages}
          notConfigured={notConfigured}
          listingCapacityReached={listingCapacityReached}
        />
      </div>

      {googleVisited ? (
        <div className={method === "google" ? "" : "hidden"}>
          <GoogleBusinessDiscovery
            messages={messages}
            authorMappingMissing={authorMappingMissing}
            listingCapacityReached={listingCapacityReached}
          />
        </div>
      ) : null}
    </div>
  );
}
