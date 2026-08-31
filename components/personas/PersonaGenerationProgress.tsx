"use client";

import { useEffect, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { getLocalizedPersonaReadinessLabel } from "@/lib/tenantI18n/personaPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type PersonaGenerationProgressProps = {
  personaId: string;
  initialStatus?: string | null;
  messages?: TenantMessages;
};

const ACTIVE_STATUSES = new Set([
  "Queued",
  "Processing",
  "Generating Executive Intelligence",
]);

export function PersonaGenerationProgress({
  personaId,
  initialStatus = null,
  messages,
}: PersonaGenerationProgressProps) {
  const [status, setStatus] = useState(initialStatus);
  const [inFlight, setInFlight] = useState(
    ACTIVE_STATUSES.has(String(initialStatus ?? "")),
  );

  useEffect(() => {
    setStatus(initialStatus);
    setInFlight(ACTIVE_STATUSES.has(String(initialStatus ?? "")));
  }, [initialStatus]);

  useEffect(() => {
    if (!inFlight) return;

    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/personas/${personaId}/status`, {
            cache: "no-store",
          });
          const payload = await parseJsonResponse<{
            ok?: boolean;
            status?: string;
            regenerationInFlight?: boolean;
          }>(response);
          if (cancelled || !response.ok || !payload.ok) return;

          if (payload.status) setStatus(payload.status);
          const flying = Boolean(payload.regenerationInFlight);
          setInFlight(flying);
          if (!flying) {
            clearInterval(timer);
          }
        } catch {
          /* keep last known */
        }
      })();
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [inFlight, personaId]);

  if (!status || status === "Profile Created") {
    return null;
  }

  const failed = status === "Processing Failed";
  const ready = status === "Ready";

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
      <div className="text-xs uppercase tracking-[0.16em] text-white/35">
        {messages?.personas.generation.statusLabel ?? "Generation status"}
      </div>
      <div
        className={`mt-2 text-sm font-medium ${
          failed
            ? "text-red-300"
            : ready
              ? "text-[var(--athena-success)]"
              : "text-white/75"
        }`}
      >
        {messages
          ? getLocalizedPersonaReadinessLabel(messages, status)
          : status}
      </div>
      {inFlight ? (
        <p className="mt-2 text-sm leading-6 text-white/45">
          {messages?.personas.generation.inFlightHelp ??
            "Athena is generating Persona Executive Intelligence in the background. Blueprint and Deployment Assets publish when the run completes."}
        </p>
      ) : null}
    </div>
  );
}
