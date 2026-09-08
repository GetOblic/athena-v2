"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";

type GetOblicWebsiteCompletionCardProps = {
  prospectId: string;
  messages: TenantMessages;
};

export function GetOblicWebsiteCompletionCard({
  prospectId,
  messages,
}: GetOblicWebsiteCompletionCardProps) {
  const router = useRouter();
  const copy = messages.prospects.websiteCompletion;
  const [website, setWebsite] = useState("");
  const [deferred, setDeferred] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deferred) {
    return (
      <div className="mb-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm leading-6 text-white/55">{copy.laterNote}</p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-[24px] border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 p-5">
      <h2 className="text-lg font-semibold text-white">{copy.heading}</h2>
      <p className="mt-2 text-sm leading-6 text-white/60">{copy.body}</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const normalized = normalizeWebsiteUrl(website);
          if (!normalized) {
            setError(copy.invalidWebsite);
            return;
          }
          setSaving(true);
          setError(null);
          try {
            const response = await fetch(`/api/prospects/${prospectId}`, {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ website: normalized }),
            });
            const payload = await parseJsonResponse<{ ok?: boolean }>(response);
            if (!response.ok || !payload?.ok) {
              setError(copy.failed);
              return;
            }
            router.refresh();
          } catch {
            setError(copy.failed);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="block text-sm text-white/50">
          {copy.website}
          <input
            value={website}
            onChange={(event) => {
              setWebsite(event.target.value);
              setError(null);
            }}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
          />
        </label>
        {error ? <p className="text-sm text-rose-200/80">{error}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? copy.researching : copy.researchCta}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setDeferred(true);
              setError(null);
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/70 disabled:opacity-40"
          >
            {copy.notNow}
          </button>
        </div>
      </form>
    </div>
  );
}
