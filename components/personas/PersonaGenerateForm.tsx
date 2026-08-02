"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PersonaCreationBlock } from "@/components/personas/PersonaCreationBlock";
import {
  PERSONA_ADVANCED_FIELD_GROUPS,
  PERSONA_FORM_FIELD_CLASS,
  personaCandidateToFormState,
} from "@/components/personas/personaFormFields";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type CreateResult = {
  ok: boolean;
  message: string;
  personaId?: string;
};

type GeneratePhase = "idle" | "generating" | "review" | "creating";

function extractErrorMessage(
  payload: { error?: string | { message?: string }; message?: string },
  fallback: string,
): string {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (
    payload.error &&
    typeof payload.error === "object" &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
  ) {
    return payload.error.message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

function candidateHasMeaningfulContent(
  values: Record<string, string> | null,
): boolean {
  if (!values) return false;
  return Object.values(values).some((value) => value.trim().length > 0);
}

export function PersonaGenerateForm() {
  const router = useRouter();
  const requestLockRef = useRef(false);
  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<GeneratePhase>("idle");
  const [candidate, setCandidate] = useState<Record<string, string> | null>(
    null,
  );
  const [portfolioCoverageInsight, setPortfolioCoverageInsight] = useState<
    string | null
  >(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const busy = phase === "generating" || phase === "creating";

  function setCandidateField(key: string, value: string) {
    setCandidate((previous) =>
      previous
        ? {
            ...previous,
            [key]: value,
          }
        : previous,
    );
  }

  function clearCandidate() {
    setCandidate(null);
    setPortfolioCoverageInsight(null);
    setPhase("idle");
    setGenerateError(null);
    setCreateResult(null);
  }

  async function generateCandidate() {
    if (busy || requestLockRef.current) return;

    const previousCandidate = candidate;
    const previousInsight = portfolioCoverageInsight;
    requestLockRef.current = true;
    setPhase("generating");
    setGenerateError(null);
    setCreateResult(null);

    try {
      const response = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
        }),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        candidate?: Record<string, string | null | undefined>;
        portfolioCoverageInsight?: string | null;
        error?: string | { message?: string };
        message?: string;
      }>(response);

      if (!payload.ok || !payload.candidate) {
        // Keep the prior review candidate if Generate Again fails.
        if (previousCandidate) {
          setCandidate(previousCandidate);
          setPortfolioCoverageInsight(previousInsight);
          setPhase("review");
        } else {
          setCandidate(null);
          setPortfolioCoverageInsight(null);
          setPhase("idle");
        }
        setGenerateError(
          extractErrorMessage(
            payload,
            "Athena could not generate a Persona candidate.",
          ),
        );
        return;
      }

      setCandidate(personaCandidateToFormState(payload.candidate));
      setPortfolioCoverageInsight(
        typeof payload.portfolioCoverageInsight === "string" &&
          payload.portfolioCoverageInsight.trim()
          ? payload.portfolioCoverageInsight.trim()
          : null,
      );
      setPhase("review");
    } catch (error) {
      if (previousCandidate) {
        setCandidate(previousCandidate);
        setPortfolioCoverageInsight(previousInsight);
        setPhase("review");
      } else {
        setCandidate(null);
        setPortfolioCoverageInsight(null);
        setPhase("idle");
      }
      setGenerateError(
        error instanceof Error
          ? error.message
          : "Athena could not generate a Persona candidate.",
      );
    } finally {
      requestLockRef.current = false;
    }
  }

  async function createPersona() {
    if (!candidate || busy || requestLockRef.current) return;

    if (!candidateHasMeaningfulContent(candidate)) {
      setCreateResult({
        ok: false,
        message:
          "Add at least one descriptive field before creating this Persona.",
      });
      return;
    }

    requestLockRef.current = true;
    setPhase("creating");
    setCreateResult(null);
    setGenerateError(null);

    try {
      const response = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...candidate,
          source: "generated",
        }),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        message?: string;
        personaId?: string;
        queued?: boolean;
        queueError?: string | null;
        error?: string | { message?: string };
      }>(response);

      const errorMessage = extractErrorMessage(payload, "Create failed.");
      const warning =
        payload.ok && payload.personaId && payload.queued === false
          ? payload.queueError ||
            "Persona was created, but intelligence generation must be retried from the detail page."
          : null;

      setCreateResult({
        ok: Boolean(payload.ok),
        message: warning || payload.message || errorMessage,
        personaId: payload.personaId,
      });

      if (payload.ok && payload.personaId) {
        router.push(`/personas/${payload.personaId}`);
        return;
      }

      setPhase("review");
    } catch (error) {
      setCreateResult({
        ok: false,
        message: error instanceof Error ? error.message : "Create failed.",
      });
      setPhase("review");
    } finally {
      requestLockRef.current = false;
    }
  }

  return (
    <PersonaCreationBlock
      title="Generate Persona"
      panelId="persona-creation-generate"
      summary="Use Athena Brain and your existing business knowledge to generate a new, relevant Persona."
    >
      <div className="space-y-4">
        <label className="block text-sm text-white/50">
          What kind of Persona would you like Athena to generate? (Optional)
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={busy}
            rows={5}
            placeholder={`Examples:
- Generate a skeptical buyer.
- Generate someone likely to purchase premium services.
- Generate a clinic owner in California.
- Surprise me with an underserved audience.`}
            className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
          />
        </label>

        {(phase === "idle" || (phase === "generating" && !candidate)) && (
          <button
            type="button"
            onClick={() => void generateCandidate()}
            disabled={busy}
            aria-busy={phase === "generating"}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {phase === "generating" ? "Athena is generating…" : "Generate Persona"}
          </button>
        )}

        {phase === "generating" && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65"
          >
            Athena is evaluating portfolio coverage, then generating one candidate
            from your Brain, market context, and existing Personas…
          </div>
        )}

        {generateError && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-400/30 bg-rose-950/20 p-4 text-sm text-rose-100/90 whitespace-pre-wrap"
          >
            {generateError}
          </div>
        )}
      </div>

      {candidate && phase !== "idle" && (
        <div className="mt-10 border-t border-white/10 pt-8">
          <h3 className="text-lg font-semibold text-white">Review candidate</h3>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Edit any field before creating. Nothing is saved until you confirm.
            {phase === "generating"
              ? " Athena is generating another candidate — the current one stays until a new response succeeds."
              : ""}
          </p>

          {portfolioCoverageInsight && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
              <h4 className="text-sm font-semibold text-white">
                Portfolio Coverage Insight
              </h4>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Athena selected this Persona because:
              </p>
              <p className="mt-2 text-sm leading-6 text-white/80 whitespace-pre-wrap">
                {portfolioCoverageInsight}
              </p>
            </div>
          )}

          <div className="mt-8 space-y-4">
            <label className="block text-sm text-white/50">
              Persona Name
              <input
                value={candidate.persona_name ?? ""}
                onChange={(event) =>
                  setCandidateField("persona_name", event.target.value)
                }
                disabled={busy}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              Short Description
              <input
                value={candidate.short_description ?? ""}
                onChange={(event) =>
                  setCandidateField("short_description", event.target.value)
                }
                disabled={busy}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              Additional Context
              <textarea
                value={candidate.additional_context ?? ""}
                onChange={(event) =>
                  setCandidateField("additional_context", event.target.value)
                }
                disabled={busy}
                rows={5}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              Reference Website
              <input
                value={candidate.reference_website ?? ""}
                onChange={(event) =>
                  setCandidateField("reference_website", event.target.value)
                }
                disabled={busy}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              Notes
              <textarea
                value={candidate.notes ?? ""}
                onChange={(event) =>
                  setCandidateField("notes", event.target.value)
                }
                disabled={busy}
                rows={3}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              Ads Content
              <textarea
                value={candidate.ads_content ?? ""}
                onChange={(event) =>
                  setCandidateField("ads_content", event.target.value)
                }
                disabled={busy}
                rows={4}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              Category
              <input
                value={candidate.category ?? ""}
                onChange={(event) =>
                  setCandidateField("category", event.target.value)
                }
                disabled={busy}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <div className="space-y-4 pt-2">
              {PERSONA_ADVANCED_FIELD_GROUPS.map((group) => (
                <AthenaCollapsibleSection
                  key={group.title}
                  title={group.title}
                  defaultOpen={false}
                >
                  <div className="grid gap-4">
                    {group.fields.map(([key, label]) => (
                      <label key={key} className="block text-sm text-white/50">
                        {label}
                        <input
                          value={candidate[key] ?? ""}
                          onChange={(event) =>
                            setCandidateField(key, event.target.value)
                          }
                          disabled={busy}
                          className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
                        />
                      </label>
                    ))}
                  </div>
                </AthenaCollapsibleSection>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => void createPersona()}
                disabled={busy}
                className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {phase === "creating" ? "Creating…" : "Create Persona"}
              </button>
              <button
                type="button"
                onClick={() => void generateCandidate()}
                disabled={busy}
                className="rounded-full border border-white/15 px-7 py-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {phase === "generating" ? "Athena is generating…" : "Generate Again"}
              </button>
              <button
                type="button"
                onClick={clearCandidate}
                disabled={busy}
                className="rounded-full border border-white/10 px-7 py-4 text-sm font-semibold text-white/70 disabled:opacity-40"
              >
                Clear Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {createResult && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 whitespace-pre-wrap">
          {createResult.message}
          {createResult.personaId && (
            <div className="mt-3">
              <Link
                href={`/personas/${createResult.personaId}`}
                className="text-[var(--athena-orange)] underline"
              >
                Open Persona
              </Link>
            </div>
          )}
        </div>
      )}
    </PersonaCreationBlock>
  );
}
