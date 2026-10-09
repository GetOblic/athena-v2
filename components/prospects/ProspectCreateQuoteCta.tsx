"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { getLicenseeLocalization } from "@/lib/licensee/getLicenseeLocalization";
import { PROSPECT_PRIMARY_ACTION } from "@/lib/prospects/prospectDetailPresentation";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

/**
 * Shown only after the server has confirmed a Master origin for this
 * Prospect's organization. The click restores that Master session through
 * the existing return path, then opens Estimate. The sub-account session
 * cannot open /licensee/estimate on its own.
 */
export function ProspectCreateQuoteCta({
  href,
  language,
}: {
  href: string;
  language: OrganizationLanguage;
}) {
  const copy = getLicenseeLocalization(language).messages.estimate;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div data-prospect-create-quote="true">
      <button
        type="button"
        data-prospect-header-action="create-quote"
        data-create-quote-href={href}
        title={copy.createQuoteFromProspectHint}
        disabled={pending}
        className={PROSPECT_PRIMARY_ACTION}
        onClick={() => {
          if (pending) return;
          setPending(true);
          setError(null);
          void (async () => {
            try {
              const response = await fetch("/api/licensee/handoff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "return_to_master" }),
              });
              const payload = (await response.json()) as { ok?: boolean };
              if (!response.ok || !payload.ok) {
                setError(copy.createQuoteOpenFailed);
                setPending(false);
                return;
              }
              window.location.assign(href);
            } catch {
              setError(copy.createQuoteOpenFailed);
              setPending(false);
            }
          })();
        }}
      >
        <FileText className="size-4" aria-hidden="true" />
        {pending ? copy.createQuoteOpening : copy.createQuoteFromProspect}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
