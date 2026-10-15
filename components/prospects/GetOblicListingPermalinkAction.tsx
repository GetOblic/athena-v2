"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { readVerifiedGetOblicListingPermalink } from "@/lib/prospects/getOblicListingPermalinkDisplay";
import { PROSPECT_UTILITY_CYAN_ACTION } from "@/lib/prospects/prospectDetailPresentation";

type GetOblicListingPermalinkActionProps = {
  prospectId: string;
  label: string;
};

async function requestListingPermalink(
  prospectId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(
    `/api/prospects/${encodeURIComponent(prospectId)}/getoblic-listing-permalink`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );
  if (!response.ok) return null;
  return readVerifiedGetOblicListingPermalink(await response.json());
}

export function GetOblicListingPermalinkAction({
  prospectId,
  label,
}: GetOblicListingPermalinkActionProps) {
  const id = prospectId.trim();
  const listingLabel = label.trim();
  const [applied, setApplied] = useState<{
    key: string;
    permalink: string;
  } | null>(null);
  const permalink = applied?.key === id ? applied.permalink : null;

  useEffect(() => {
    if (!id || !listingLabel) return;
    const key = id;
    const controller = new AbortController();
    let cancelled = false;
    void requestListingPermalink(id, controller.signal)
      .then((verified) => {
        if (cancelled || !verified) return;
        setApplied({ key, permalink: verified });
      })
      .catch(() => {
        // Keep the Funnel actions already on the page.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, listingLabel]);

  if (!permalink || !listingLabel) return null;

  return (
    <a
      href={permalink}
      target="_blank"
      rel="noopener noreferrer"
      data-prospect-header-action="getoblic-funnel-view-listing"
      className={PROSPECT_UTILITY_CYAN_ACTION}
    >
      <ExternalLink className="size-4" />
      {listingLabel}
    </a>
  );
}
