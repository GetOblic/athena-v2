"use client";

import { useState } from "react";
import { GetOblicOpportunityDiscovery } from "@/components/prospects/GetOblicOpportunityDiscovery";
import { GoogleBusinessDiscovery } from "@/components/prospects/GoogleBusinessDiscovery";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type OpportunityDiscoveryMethod = "directory" | "google";

type OpportunityDiscoveryMethodsProps = {
  messages: TenantMessages;
  notConfigured: boolean;
  listingCapacityReached: boolean;
  authorMappingMissing: boolean;
};

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
          className={
            method === "directory"
              ? "rounded-2xl border border-[var(--athena-orange)]/35 bg-[var(--athena-orange)]/10 px-4 py-3 text-left"
              : "rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
          }
        >
          <div className="text-sm font-semibold text-white">
            {copy.methods.directoryLabel}
          </div>
          <p className="mt-1 text-sm leading-6 text-white/50">
            {copy.methods.directoryDescription}
          </p>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "google"}
          onClick={() => selectMethod("google")}
          className={
            method === "google"
              ? "rounded-2xl border border-[var(--athena-orange)]/35 bg-[var(--athena-orange)]/10 px-4 py-3 text-left"
              : "rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
          }
        >
          <div className="text-sm font-semibold text-white">
            {copy.methods.googleLabel}
          </div>
          <p className="mt-1 text-sm leading-6 text-white/50">
            {copy.methods.googleDescription}
          </p>
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
