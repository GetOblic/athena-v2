"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdCampaignHeaderDeleteButton } from "@/components/ads/AdCampaignHeaderDeleteButton";
import { ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS } from "@/components/ui/athenaIntelligenceRow";
import type { PublicAdCampaignSummary } from "@/services/ads/adCampaignPublic";

type AdsLibraryClientProps = {
  campaigns: PublicAdCampaignSummary[];
  loadError?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdsLibraryClient({
  campaigns,
  loadError = null,
}: AdsLibraryClientProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return campaigns;
    return campaigns.filter((campaign) => {
      const haystack = [
        campaign.name,
        campaign.status,
        campaign.objective,
        campaign.campaignTheme,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [campaigns, query]);

  if (loadError) {
    return (
      <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-10 text-center">
        <h2 className="text-2xl font-semibold text-rose-100">
          Unable to load Ads
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-rose-100/70">
          {loadError}
        </p>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
        <h2 className="text-2xl font-semibold">No Ads campaigns yet</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/50">
          Generate organization-level advertising campaigns from Athena&apos;s
          accumulated intelligence. A brief is optional.
        </p>
        <Link
          href="/ads/new"
          className="mt-8 inline-flex rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white"
        >
          Generate Ads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search campaigns"
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none md:max-w-md"
        />
        <Link
          href="/ads/new"
          className="inline-flex rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white"
        >
          Generate Ads
        </Link>
      </div>

      <div className="space-y-3">
        {filtered.map((campaign) => (
          <div
            key={campaign.id}
            className={`${ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS} flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between`}
          >
            <Link href={`/ads/${campaign.id}`} className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{campaign.name}</div>
              <div className="mt-2 text-sm text-white/50">
                {campaign.objective ||
                  campaign.campaignTheme ||
                  "Campaign package pending"}
              </div>
              <div className="mt-2 text-xs text-white/35">
                {formatDate(campaign.createdAt)} · {campaign.status}
              </div>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/ads/${campaign.id}`}
                className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white/80"
              >
                Open
              </Link>
              <AdCampaignHeaderDeleteButton campaignId={campaign.id} />
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/50">No campaigns match your search.</p>
      ) : null}
    </div>
  );
}
