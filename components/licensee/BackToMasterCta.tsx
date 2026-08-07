"use client";

import { useEffect, useState, useTransition } from "react";
import { clearLicenseeHandoffBrowserStorage } from "@/lib/licensee/clearHandoffBrowserStorage";

/**
 * Visible only when Master-origin handoff context is active.
 * Ordinary Athena users never see this control.
 */
export function BackToMasterCta() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/licensee/origin", { method: "GET", cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { canReturnToMaster?: boolean }) => {
        if (!cancelled) {
          setVisible(Boolean(payload.canReturnToMaster));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVisible(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            clearLicenseeHandoffBrowserStorage();
            try {
              const response = await fetch("/api/licensee/handoff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "return_to_master" }),
              });
              const payload = (await response.json()) as {
                ok?: boolean;
                redirectTo?: string;
                error?: { message?: string };
              };
              if (!response.ok || !payload.ok) {
                setError(
                  payload.error?.message || "Could not return to Master.",
                );
                return;
              }
              clearLicenseeHandoffBrowserStorage();
              window.location.href = payload.redirectTo || "/licensee";
            } catch {
              setError("Could not return to Master.");
            }
          });
        }}
        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--athena-orange)]/50 bg-[var(--athena-orange)]/10 px-3.5 py-2 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-60"
      >
        {pending ? "Returning…" : "Back to Master"}
      </button>
      {error ? (
        <div className="basis-full text-right text-xs text-red-300">{error}</div>
      ) : null}
    </>
  );
}
