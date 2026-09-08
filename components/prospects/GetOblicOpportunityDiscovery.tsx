"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  GetOblicOpportunityResultCard,
  type GetOblicOpportunitySearchHit,
} from "@/components/prospects/GetOblicOpportunityResultCard";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type SearchPayload = {
  ok?: boolean;
  search?: {
    page?: number;
    per_page?: number;
    found_posts?: number;
    max_num_pages?: number;
    results?: GetOblicOpportunitySearchHit[];
  };
  error?: { code?: string; message?: string };
};

type ConvertPayload = {
  ok?: boolean;
  conversion?: {
    outcome?: string;
    prospect_id?: string | null;
    website_ready?: boolean;
    status?: string | null;
    generation_queued?: boolean;
  };
  error?: { code?: string; message?: string };
};

type GetOblicOpportunityDiscoveryProps = {
  messages: TenantMessages;
  notConfigured: boolean;
  allowanceExhausted: boolean;
};

function convertFailureCopy(
  messages: TenantMessages,
  code: string | undefined,
  fallback: string,
): string {
  const copy = messages.prospects.find;
  switch (code) {
    case "GETOBLIC_DIRECTORY_NOT_CONFIGURED":
      return copy.notConfigured;
    case "GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED":
      return copy.allowanceExhausted;
    case "GETOBLIC_NEEDS_BUSINESS_NAME":
      return copy.needsBusinessName;
    case "GETOBLIC_NAME_COLLISION":
      return copy.nameCollision;
    case "GETOBLIC_LISTING_CLAIMED_OTHER_ORG":
      return copy.alreadyBeingPursued;
    default:
      return fallback;
  }
}

export function GetOblicOpportunityDiscovery({
  messages,
  notConfigured,
  allowanceExhausted,
}: GetOblicOpportunityDiscoveryProps) {
  const router = useRouter();
  const copy = messages.prospects.find;
  const [keywords, setKeywords] = useState("");
  const [submittedKeywords, setSubmittedKeywords] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GetOblicOpportunitySearchHit[] | null>(
    null,
  );
  const [maxPages, setMaxPages] = useState(0);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  async function runSearch(nextPage: number, query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        keywords: trimmed,
        page: String(nextPage),
      });
      const response = await fetch(
        `/api/getoblic-directory/search?${params.toString()}`,
        { method: "GET", credentials: "same-origin" },
      );
      const payload = await parseJsonResponse<SearchPayload>(response);
      if (!response.ok || !payload?.ok || !payload.search) {
        setResults(null);
        setError(copy.error);
        return;
      }
      setSubmittedKeywords(trimmed);
      setPage(payload.search.page ?? nextPage);
      setMaxPages(payload.search.max_num_pages ?? 0);
      setResults(payload.search.results ?? []);
    } catch {
      setResults(null);
      setError(copy.error);
    } finally {
      setLoading(false);
    }
  }

  async function convertHit(hit: GetOblicOpportunitySearchHit) {
    setConvertingId(hit.wordpress_listing_id);
    setFailedId(null);
    setFailureMessage(null);
    try {
      const response = await fetch("/api/prospects/from-getoblic", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordpress_listing_id: hit.wordpress_listing_id,
          observed: {
            title: hit.title,
            permalink: hit.permalink,
            listing_type: hit.listing_type,
            category: hit.category,
            location_display: hit.location_display,
            google_id: hit.google_id,
            image: hit.image,
          },
        }),
      });
      const payload = await parseJsonResponse<ConvertPayload>(response);
      const prospectId = payload?.conversion?.prospect_id;
      if (
        prospectId &&
        (payload?.ok ||
          payload?.conversion?.outcome === "claim_incomplete" ||
          payload?.conversion?.outcome === "remote_missing" ||
          payload?.conversion?.outcome === "allowance_exceeded")
      ) {
        router.push(`/prospects/${prospectId}`);
        return;
      }
      if (payload?.ok && prospectId) {
        router.push(`/prospects/${prospectId}`);
        return;
      }
      setFailedId(hit.wordpress_listing_id);
      setFailureMessage(
        convertFailureCopy(
          messages,
          payload?.error?.code,
          copy.addFailed,
        ),
      );
    } catch {
      setFailedId(hit.wordpress_listing_id);
      setFailureMessage(copy.addFailed);
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {notConfigured ? (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/70">
          {copy.notConfigured}
        </div>
      ) : null}
      {allowanceExhausted ? (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/70">
          {copy.allowanceExhausted}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(0, keywords);
        }}
      >
        <label className="block min-w-0 flex-1 text-sm text-white/50">
          {copy.keywords}
          <input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder={copy.keywordsPlaceholder}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !keywords.trim()}
          className="inline-flex items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? copy.searching : copy.submit}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-white/50">{copy.searching}</p>
      ) : null}
      {error ? (
        <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-5 text-sm leading-6 text-rose-100/80">
          {error}
        </div>
      ) : null}
      {results && results.length === 0 && !loading && !error ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-8">
          <p className="text-sm leading-7 text-white/55">{copy.empty}</p>
        </div>
      ) : null}

      {results && results.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {results.map((hit) => (
            <GetOblicOpportunityResultCard
              key={hit.wordpress_listing_id}
              hit={hit}
              messages={messages}
              inFlight={convertingId === hit.wordpress_listing_id}
              failed={failedId === hit.wordpress_listing_id}
              failureMessage={
                failedId === hit.wordpress_listing_id ? failureMessage : null
              }
              addDisabled={notConfigured}
              onAdd={(item) => void convertHit(item)}
              onOpen={(item) => void convertHit(item)}
            />
          ))}
        </div>
      ) : null}

      {results && maxPages > 1 ? (
        <div className="flex gap-3">
          <button
            type="button"
            disabled={loading || page <= 0}
            onClick={() => void runSearch(page - 1, submittedKeywords)}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 disabled:opacity-30"
          >
            {messages.prospects.list.previous}
          </button>
          <button
            type="button"
            disabled={loading || page + 1 >= maxPages}
            onClick={() => void runSearch(page + 1, submittedKeywords)}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 disabled:opacity-30"
          >
            {messages.prospects.list.next}
          </button>
        </div>
      ) : null}

      <p className="text-sm text-white/45">
        <Link
          href="/prospects/import"
          className="text-[var(--athena-orange)] underline underline-offset-2"
        >
          {copy.addYourself}
        </Link>
      </p>
    </div>
  );
}
