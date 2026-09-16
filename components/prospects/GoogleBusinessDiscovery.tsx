"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { flattenGoogleBusinessPlace } from "@/lib/googlePlaces/flattenGoogleBusiness";
import {
  GOOGLE_PLACES_AUTOCOMPLETE_FIELDS,
  type GoogleAutocomplete,
  type GoogleBusinessPayload,
} from "@/lib/googlePlaces/googlePlacesTypes";
import { loadGoogleMapsPlaces } from "@/lib/googlePlaces/loadGoogleMapsPlaces";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  PROSPECT_CARD_ICON_WELL_CLASS,
  PROSPECT_CARD_SURFACE_CLASS,
  PROSPECT_CAPACITY_SURFACE_CLASS,
  PROSPECT_LIBRARY_PRIMARY_ACTION,
  PROSPECT_TOOLBAR_FIELD_CLASS,
  PROSPECT_TOOLBAR_SURFACE_CLASS,
} from "@/lib/prospects/prospectLibraryPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type GoogleLoaderStatus = "loading" | "ready" | "missing_key" | "unavailable";

type AddResponse = {
  ok?: boolean;
  result?: {
    wordpress_listing_id?: number;
    google_id?: string;
  };
  conversion?: {
    outcome?: string;
    prospect_id?: string | null;
    generation_queued?: boolean;
  };
  error?: { code?: string; message?: string };
};

type GoogleBusinessDiscoveryProps = {
  messages: TenantMessages;
  authorMappingMissing: boolean;
  listingCapacityReached: boolean;
  prospectCapacityReached: boolean;
};

function readGoogleMapsBrowserKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function googleFailureCopy(
  messages: TenantMessages,
  code: string | undefined,
  fallback: string,
): string {
  const copy = messages.prospects.find.google;
  const find = messages.prospects.find;
  switch (code) {
    case "GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING":
      return copy.authorMappingMissing;
    case "GOOGLE_BUSINESS_WEBHOOK_NOT_CONFIGURED":
      return copy.unavailable;
    case "PROSPECT_CAPACITY_EXCEEDED":
      return find.prospectCapacityReached;
    case "GETOBLIC_LISTING_CAPACITY_EXCEEDED":
      return find.listingCapacityReached;
    case "GETOBLIC_NEEDS_BUSINESS_NAME":
      return find.needsBusinessName;
    case "GETOBLIC_NAME_COLLISION":
      return find.nameCollision;
    case "GETOBLIC_LISTING_CLAIMED_OTHER_ORG":
    case "GETOBLIC_LISTING_NOT_CLAIMABLE":
    case "GOOGLE_BUSINESS_AUTHOR_MISMATCH":
      return find.alreadyBeingPursued;
    default:
      return fallback;
  }
}

export function GoogleBusinessDiscovery({
  messages,
  authorMappingMissing,
  listingCapacityReached,
  prospectCapacityReached,
}: GoogleBusinessDiscoveryProps) {
  const router = useRouter();
  const copy = messages.prospects.find.google;
  const find = messages.prospects.find;
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<GoogleAutocomplete | null>(null);
  const [loaderStatus, setLoaderStatus] = useState<GoogleLoaderStatus>(() =>
    readGoogleMapsBrowserKey() ? "loading" : "missing_key",
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GoogleBusinessPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = readGoogleMapsBrowserKey();
    if (!apiKey) {
      return;
    }

    let cancelled = false;
    let listener: { remove: () => void } | null = null;

    loadGoogleMapsPlaces(apiKey)
      .then((google) => {
        if (cancelled || !inputRef.current) return;

        const autocomplete = new google.maps.places.Autocomplete(
          inputRef.current,
          {
            types: ["establishment"],
            fields: [...GOOGLE_PLACES_AUTOCOMPLETE_FIELDS],
          },
        );

        autocompleteRef.current = autocomplete;
        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const payload = flattenGoogleBusinessPlace(place);
          if (!payload) {
            setSelected(null);
            setError(copy.choosePlace);
            return;
          }
          setSelected(payload);
          setQuery(payload.company_name);
          setError(null);
        });

        setLoaderStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoaderStatus("unavailable");
      });

    return () => {
      cancelled = true;
      listener?.remove();
      autocompleteRef.current = null;
    };
  }, [copy.choosePlace]);

  async function addSelectedBusiness() {
    if (!selected || submitting || authorMappingMissing) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/prospects/from-google-business", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      const payload = await parseJsonResponse<AddResponse>(response);
      const prospectId = payload?.conversion?.prospect_id;
      if (
        prospectId &&
        (payload?.ok ||
          payload?.conversion?.outcome === "claim_incomplete" ||
          payload?.conversion?.outcome === "remote_missing")
      ) {
        router.push(`/prospects/${prospectId}`);
        return;
      }
      setError(
        googleFailureCopy(messages, payload?.error?.code, copy.addFailed),
      );
    } catch {
      setError(copy.addFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const googleUnavailable =
    loaderStatus === "missing_key" || loaderStatus === "unavailable";
  const inputDisabled =
    googleUnavailable ||
    loaderStatus === "loading" ||
    submitting ||
    authorMappingMissing;
  const canSubmit =
    Boolean(selected) &&
    !submitting &&
    !authorMappingMissing &&
    !prospectCapacityReached &&
    loaderStatus === "ready";

  return (
    <div className="space-y-6">
      {authorMappingMissing ? (
        <div className={`${PROSPECT_CAPACITY_SURFACE_CLASS} text-sm leading-6 text-white/70`}>
          {copy.authorMappingMissing}
        </div>
      ) : null}
      {listingCapacityReached ? (
        <div className={`${PROSPECT_CAPACITY_SURFACE_CLASS} text-sm leading-6 text-white/70`}>
          {find.listingCapacityReached}
        </div>
      ) : null}
      {prospectCapacityReached ? (
        <div className={`${PROSPECT_CAPACITY_SURFACE_CLASS} text-sm leading-6 text-white/70`}>
          {find.prospectCapacityReached}
        </div>
      ) : null}
      {loaderStatus === "missing_key" ? (
        <div className={`${PROSPECT_CAPACITY_SURFACE_CLASS} text-sm leading-6 text-white/70`}>
          {copy.missingKey}
        </div>
      ) : null}
      {loaderStatus === "unavailable" ? (
        <div className={`${PROSPECT_CAPACITY_SURFACE_CLASS} text-sm leading-6 text-white/70`}>
          {copy.unavailable}
        </div>
      ) : null}

      <div className={`${PROSPECT_TOOLBAR_SURFACE_CLASS} gap-2`}>
        <label className="block min-w-0 text-sm text-white/50 sm:col-span-3">
          <span className="inline-flex items-center gap-1.5">
            <Search className="size-3.5" aria-hidden="true" />
            {copy.inputLabel}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder={copy.inputPlaceholder}
            autoComplete="off"
            disabled={inputDisabled}
            aria-describedby={statusId}
            className={`mt-2 ${PROSPECT_TOOLBAR_FIELD_CLASS} disabled:opacity-40`}
          />
        </label>
        <p
          id={statusId}
          className="text-sm text-white/50 sm:col-span-3"
          role="status"
          aria-live="polite"
        >
          {loaderStatus === "loading"
            ? copy.loading
            : selected
              ? copy.selected
              : copy.startTyping}
        </p>
      </div>

      {selected ? (
        <div className={PROSPECT_CARD_SURFACE_CLASS}>
          <div className="flex items-start gap-3">
            <div className={PROSPECT_CARD_ICON_WELL_CLASS} aria-hidden="true">
              <MapPin className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-base font-semibold text-white sm:text-lg">
                {selected.company_name}
              </p>
              {selected.address ? (
                <p className="mt-1 text-xs leading-5 text-white/45">
                  {selected.address}
                </p>
              ) : null}
              {selected.business_phone ? (
                <p className="mt-0.5 text-xs text-white/45">
                  {selected.business_phone}
                </p>
              ) : null}
              {selected.website ? (
                <p className="mt-0.5 text-xs text-white/45">{selected.website}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void addSelectedBusiness()}
        className={`${PROSPECT_LIBRARY_PRIMARY_ACTION} disabled:opacity-40`}
      >
        {submitting ? copy.adding : copy.addCta}
      </button>

      {error ? (
        <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-4 text-sm leading-6 text-rose-100/80">
          {error}
        </div>
      ) : null}
    </div>
  );
}
