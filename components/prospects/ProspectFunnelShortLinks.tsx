"use client";

import { useEffect, useState } from "react";
import { GetOblicFunnelControls } from "@/components/prospects/GetOblicFunnelControls";
import {
  applyProspectFunnelShortLinkHrefs,
  readProspectFunnelShortLinkMap,
  type ProspectFunnelHttpsHrefs,
} from "@/lib/prospects/prospectFunnelShortLinkDisplay";

type ProspectFunnelShortLinksProps = {
  prospectId: string;
  aiAgentsHref?: string | null;
  virtualPhoneHref?: string | null;
  calendarHref?: string | null;
  callHref?: string | null;
  claimHref?: string | null;
  aiAgentsLabel?: string | null;
  virtualPhoneLabel?: string | null;
  calendarLabel?: string | null;
  callLabel?: string | null;
  claimLabel?: string | null;
};

async function requestProspectFunnelShortLinks(
  prospectId: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/prospects/${encodeURIComponent(prospectId)}/funnel-links`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: "{}",
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );
  if (!response.ok) return null;
  return readProspectFunnelShortLinkMap(await response.json());
}

export function ProspectFunnelShortLinkEnsure({
  prospectId,
}: {
  prospectId: string;
}) {
  useEffect(() => {
    const id = prospectId.trim();
    if (!id) return;
    const controller = new AbortController();
    void requestProspectFunnelShortLinks(id, controller.signal).catch(() => {
      // The page already rendered its long-URL fallback.
    });
    return () => controller.abort();
  }, [prospectId]);

  return null;
}

export function ProspectFunnelShortLinks({
  prospectId,
  aiAgentsHref,
  virtualPhoneHref,
  calendarHref,
  callHref,
  claimHref,
  aiAgentsLabel,
  virtualPhoneLabel,
  calendarLabel,
  callLabel,
  claimLabel,
}: ProspectFunnelShortLinksProps) {
  const baseline: ProspectFunnelHttpsHrefs = {
    aiAgentsHref: aiAgentsHref ?? null,
    virtualPhoneHref: virtualPhoneHref ?? null,
    calendarHref: calendarHref ?? null,
    claimHref: claimHref ?? null,
  };
  const canonicalKey = JSON.stringify([
    prospectId,
    baseline.aiAgentsHref,
    baseline.virtualPhoneHref,
    baseline.calendarHref,
    baseline.claimHref,
  ]);
  const [applied, setApplied] = useState<{
    key: string;
    hrefs: ProspectFunnelHttpsHrefs;
  } | null>(null);
  const hrefs = applied?.key === canonicalKey ? applied.hrefs : baseline;

  useEffect(() => {
    const id = prospectId.trim();
    if (!id) return;
    const key = canonicalKey;
    const canonical = baseline;
    const controller = new AbortController();
    let cancelled = false;
    void requestProspectFunnelShortLinks(id, controller.signal)
      .then((links) => {
        if (cancelled || !links) return;
        setApplied({
          key,
          hrefs: applyProspectFunnelShortLinkHrefs(canonical, links),
        });
      })
      .catch(() => {
        // Keep the canonical long URLs already on the page.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // baseline is derived from the same values as canonicalKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonicalKey, prospectId]);

  return (
    <GetOblicFunnelControls
      aiAgentsHref={hrefs.aiAgentsHref}
      virtualPhoneHref={hrefs.virtualPhoneHref}
      calendarHref={hrefs.calendarHref}
      callHref={callHref}
      claimHref={hrefs.claimHref}
      aiAgentsLabel={aiAgentsLabel}
      virtualPhoneLabel={virtualPhoneLabel}
      calendarLabel={calendarLabel}
      callLabel={callLabel}
      claimLabel={claimLabel}
    />
  );
}
