"use client";

import { Building2 } from "lucide-react";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  PROSPECT_STATUS_CHIP_FAILED,
  PROSPECT_STATUS_CHIP_PROGRESS,
  PROSPECT_STATUS_CHIP_READY,
  PROSPECT_STATUS_CHIP_SAVED,
} from "@/lib/prospects/prospectDetailPresentation";
import {
  PROSPECT_CARD_ICON_WELL_CLASS,
  PROSPECT_CARD_SURFACE_CLASS,
  PROSPECT_LIBRARY_PRIMARY_ACTION,
  PROSPECT_LIBRARY_SECONDARY_ACTION,
} from "@/lib/prospects/prospectLibraryPresentation";

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
  athena_claim_status:
    | "AVAILABLE"
    | "OWNED_BY_THIS_ORG"
    | "INCOMPLETE_FOR_THIS_ORG"
    | "UNAVAILABLE";
};

export type GetOblicOpportunityCardPhase =
  | "available"
  | "owned"
  | "incomplete"
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
  if (input.claimStatus === "INCOMPLETE_FOR_THIS_ORG") {
    return input.inFlight ? "in_progress" : "incomplete";
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

function phaseChipClass(phase: GetOblicOpportunityCardPhase): string {
  if (phase === "owned") return PROSPECT_STATUS_CHIP_READY;
  if (phase === "incomplete" || phase === "in_progress") {
    return PROSPECT_STATUS_CHIP_PROGRESS;
  }
  if (phase === "failed") return PROSPECT_STATUS_CHIP_FAILED;
  return PROSPECT_STATUS_CHIP_SAVED;
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
  const meta = [category, location].filter(Boolean).join(" · ");
  const permalink = String(hit.permalink ?? "").trim();
  const phaseLabel =
    phase === "owned"
      ? copy.alreadyInMyOpportunities
      : phase === "incomplete"
        ? copy.needsFinishing
        : phase === "unavailable"
          ? copy.alreadyBeingPursued
          : phase === "in_progress"
            ? copy.adding
            : copy.available;

  return (
    <article className={PROSPECT_CARD_SURFACE_CLASS}>
      <div className="flex items-start gap-3">
        <div className={PROSPECT_CARD_ICON_WELL_CLASS} aria-hidden="true">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold text-white sm:text-lg">
            {title}
          </h3>
          {meta ? (
            <p className="mt-0.5 truncate text-xs text-white/45">{meta}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <span className={phaseChipClass(phase)}>{phaseLabel}</span>
      </div>
      {phase === "failed" ? (
        <p className="mt-2 text-sm text-rose-200/80">
          {failureMessage ?? copy.addFailed}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {phase === "available" || phase === "failed" || phase === "incomplete" ? (
          <button
            type="button"
            disabled={inFlight || addDisabled}
            onClick={() => onAdd(hit)}
            className={`${PROSPECT_LIBRARY_PRIMARY_ACTION} disabled:opacity-40`}
          >
            {phase === "failed"
              ? copy.tryAgain
              : phase === "incomplete"
                ? copy.finishAdding
                : copy.addToOpportunities}
          </button>
        ) : null}
        {phase === "owned" ? (
          <button
            type="button"
            disabled={inFlight}
            onClick={() => onOpen(hit)}
            className={`${PROSPECT_LIBRARY_PRIMARY_ACTION} disabled:opacity-40`}
          >
            {copy.open}
          </button>
        ) : null}
        {phase === "in_progress" ? (
          <button
            type="button"
            disabled
            className={`${PROSPECT_LIBRARY_PRIMARY_ACTION} opacity-40`}
          >
            {copy.adding}
          </button>
        ) : null}
        {permalink ? (
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            className={PROSPECT_LIBRARY_SECONDARY_ACTION}
          >
            {copy.viewListing}
          </a>
        ) : null}
      </div>
    </article>
  );
}
