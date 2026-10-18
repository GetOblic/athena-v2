"use client";

import { useEffect, useState } from "react";
import { ClientProspectIntelligenceNavLink } from "@/components/dashboard/ClientProspectIntelligenceNavLink";

/**
 * Hidden until the session client organization has exactly one active
 * conversion. A failed or ambiguous lookup stays hidden.
 */
export function ClientProspectIntelligenceNavGate({
  label,
  currentPath,
}: {
  label: string;
  currentPath: string;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/client-prospect-intelligence/availability", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          return false;
        }
        return (payload as { available?: unknown }).available === true;
      })
      .then((next) => {
        if (!controller.signal.aborted) setAvailable(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });

    return () => controller.abort();
  }, []);

  if (!available) return null;

  return (
    <ClientProspectIntelligenceNavLink label={label} currentPath={currentPath} />
  );
}
