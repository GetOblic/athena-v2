"use client";

import { useEffect, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

const STAGES = [
  "Profile Created",
  "Queued",
  "Processing",
  "Generating Executive Intelligence",
  "Analysis Generated",
] as const;

type PersonaGenerationProgressProps = {
  personaId: string;
  initialStatus: string;
};

type StatusPayload = {
  ok?: boolean;
  status?: string;
  regenerationInFlight?: boolean;
};

function stageIndex(status: string): number {
  if (/fail/i.test(status)) return -1;
  if (/analysis generated/i.test(status)) return 4;
  if (/generat|analyz/i.test(status)) return 3;
  if (/process/i.test(status)) return 2;
  if (/queued/i.test(status)) return 1;
  return 0;
}

export function PersonaGenerationProgress({
  personaId,
  initialStatus,
}: PersonaGenerationProgressProps) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(`/api/personas/${personaId}/status`, {
          cache: "no-store",
        });
        const payload = await parseJsonResponse<StatusPayload>(response);
        if (!cancelled && payload.ok && payload.status) {
          setStatus(payload.status);
        }
      } catch {
        /* ignore */
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [personaId]);

  const failed = /fail/i.test(status);
  const current = stageIndex(status);

  return (
    <div className="mt-6">
      <div className="text-xs uppercase tracking-[0.16em] text-white/35">
        Generation progress
      </div>
      <ol className="mt-4 space-y-2">
        {STAGES.map((stage, index) => {
          const active = !failed && index === current;
          const done = !failed && index < current;
          return (
            <li
              key={stage}
              className={[
                "text-sm",
                active
                  ? "text-[var(--athena-orange)]"
                  : done
                    ? "text-white/70"
                    : "text-white/30",
              ].join(" ")}
            >
              {done ? "✓ " : active ? "→ " : "○ "}
              {stage}
            </li>
          );
        })}
      </ol>
      {failed ? (
        <p className="mt-3 text-sm text-red-300">Processing Failed</p>
      ) : null}
      <p className="mt-3 text-sm text-white/50">Current: {status}</p>
    </div>
  );
}
