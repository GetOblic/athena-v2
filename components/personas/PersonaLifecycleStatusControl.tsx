"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getPersonaLifecycleColor,
  normalizePersonaLifecycleStatus,
  PERSONA_LIFECYCLE_STATUSES,
  type PersonaLifecycleStatus,
} from "@/services/personas/personaLifecycle";
import type { Persona } from "@/services/personas/personaService";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { getLocalizedPersonaLifecycleLabel } from "@/lib/tenantI18n/personaPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type PersonaLifecycleStatusControlProps = {
  persona: Persona;
  messages?: TenantMessages;
};

export function PersonaLifecycleStatusControl({
  persona,
  messages,
}: PersonaLifecycleStatusControlProps) {
  const router = useRouter();
  const [lifecycleStatus, setLifecycleStatus] = useState<PersonaLifecycleStatus>(
    normalizePersonaLifecycleStatus(persona.lifecycle_status),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleChange(nextStatus: string) {
    if (
      !PERSONA_LIFECYCLE_STATUSES.includes(nextStatus as PersonaLifecycleStatus)
    ) {
      return;
    }

    setLifecycleStatus(nextStatus as PersonaLifecycleStatus);
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/personas/${persona.id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle_status: nextStatus }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message ||
              (messages?.personas.lifecycle.updateFailed ??
                "Failed to update Persona status.");
        throw new Error(message);
      }

      setSuccess(
        messages?.personas.lifecycle.updated ?? "Persona status updated.",
      );
      router.refresh();
    } catch (saveError) {
      setLifecycleStatus(
        normalizePersonaLifecycleStatus(persona.lifecycle_status),
      );
      setError(
        saveError instanceof Error
          ? saveError.message
          : (messages?.personas.lifecycle.updateFailed ??
            "Failed to update Persona status."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={`rounded-[20px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-5`}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {messages?.personas.lifecycle.label ?? "Persona Status"}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={lifecycleStatus}
          onChange={(event) => void handleChange(event.target.value)}
          disabled={isSaving}
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
        >
          {PERSONA_LIFECYCLE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {messages
                ? getLocalizedPersonaLifecycleLabel(messages, option)
                : option}
            </option>
          ))}
        </select>

        <span
          className={`text-sm font-medium ${getPersonaLifecycleColor(lifecycleStatus)}`}
        >
          {messages
            ? getLocalizedPersonaLifecycleLabel(messages, lifecycleStatus)
            : lifecycleStatus}
        </span>
      </div>

      {success && <div className="mt-3 text-xs text-emerald-300">{success}</div>}
      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
    </div>
  );
}
