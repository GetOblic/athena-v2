"use client";

import type { TenantMessages } from "@/lib/tenantI18n/types";

export type GetOblicOpportunitySearchHit = {
  wordpress_listing_id: number;
  title: string | null;
  permalink: string | null;
  status: string | null;
  listing_type: string | null;
  category: { term_id: number; slug: string; name: string }[];
  location_display: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  google_id: string | null;
  athena_claim_status: "AVAILABLE" | "OWNED_BY_THIS_ORG" | "UNAVAILABLE";
};

export type GetOblicOpportunityCardPhase =
  | "available"
  | "owned"
  | "unavailable"
  | "in_progress"
  | "failed";

export function resolveGetOblicOpportunityCardPhase(input: {
  claimStatus: string;
  inFlight: boolean;
  failed: boolean;
}): GetOblicOpportunityCardPhase {
  if (input.claimStatus === "OWNED_BY_THIS_ORG") {
    return input.inFlight ? "in_progress" : "owned";
  }
  if (input.claimStatus === "UNAVAILABLE") {
    return "unavailable";
  }
  if (input.inFlight) return "in_progress";
  if (input.failed) return "failed";
  return "available";
}

export function firstGetOblicOpportunityCategoryName(
  categories: GetOblicOpportunitySearchHit["category"] | null | undefined,
): string | null {
  for (const category of categories ?? []) {
    const name = String(category?.name ?? "").trim();
    if (name) return name;
  }
  return null;
}

type GetOblicOpportunityResultCardProps = {
  hit: GetOblicOpportunitySearchHit;
  messages: TenantMessages;
  inFlight: boolean;
  failed: boolean;
  failureMessage?: string | null;
  addDisabled?: boolean;
  onAdd: (hit: GetOblicOpportunitySearchHit) => void;
  onOpen: (hit: GetOblicOpportunitySearchHit) => void;
};

export function GetOblicOpportunityResultCard({
  hit,
  messages,
  inFlight,
  failed,
  failureMessage,
  addDisabled = false,
  onAdd,
  onOpen,
}: GetOblicOpportunityResultCardProps) {
  const copy = messages.prospects.find;
  const phase = resolveGetOblicOpportunityCardPhase({
    claimStatus: hit.athena_claim_status,
    inFlight,
    failed,
  });
  const title = String(hit.title ?? "").trim() || copy.imageAlt;
  const category = firstGetOblicOpportunityCategoryName(hit.category);
  const location = String(hit.location_display ?? "").trim();
  const permalink = String(hit.permalink ?? "").trim();

  return (
    <article className="flex min-w-0 flex-col rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {hit.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.image}
            alt={title}
            className="h-40 w-full object-cover"
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-white/30">
            {copy.imageAlt}
          </div>
        )}
      </div>

      <h3 className="mt-4 break-words text-lg font-semibold text-white">
        {title}
      </h3>
      {category ? (
        <p className="mt-2 break-words text-sm text-white/50">{category}</p>
      ) : null}
      {location ? (
        <p className="mt-1 break-words text-sm text-white/45">{location}</p>
      ) : null}
      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/35">
        {copy.sourceGetOblic}
      </p>
      <p className="mt-2 text-sm text-[var(--athena-orange)]">
        {phase === "owned"
          ? copy.alreadyInMyOpportunities
          : phase === "unavailable"
            ? copy.alreadyBeingPursued
            : phase === "in_progress"
              ? copy.adding
              : copy.available}
      </p>
      {phase === "failed" ? (
        <p className="mt-2 text-sm text-rose-200/80">
          {failureMessage ?? copy.addFailed}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {phase === "available" || phase === "failed" ? (
          <button
            type="button"
            disabled={inFlight || addDisabled}
            onClick={() => onAdd(hit)}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {phase === "failed" ? copy.tryAgain : copy.addToOpportunities}
          </button>
        ) : null}
        {phase === "owned" ? (
          <button
            type="button"
            disabled={inFlight}
            onClick={() => onOpen(hit)}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {copy.open}
          </button>
        ) : null}
        {phase === "in_progress" ? (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white opacity-40"
          >
            {copy.adding}
          </button>
        ) : null}
        {permalink ? (
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/70"
          >
            {copy.viewListing}
          </a>
        ) : null}
      </div>
    </article>
  );
}
