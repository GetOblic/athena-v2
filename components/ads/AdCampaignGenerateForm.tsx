"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type AdCampaignGenerateFormProps = {
  messages?: TenantMessages;
};

export function AdCampaignGenerateForm({
  messages,
}: AdCampaignGenerateFormProps) {
  const copy = messages?.ads.new ?? en.ads.new;
  const router = useRouter();
  const submittingRef = useRef(false);
  const [name, setName] = useState("");
  const [guidance, setGuidance] = useState("");
  const [objective, setObjective] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [geography, setGeography] = useState("");
  const [landingPage, setLandingPage] = useState("");
  const [constraints, setConstraints] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          guidance: guidance.trim() || undefined,
          objective: objective.trim() || undefined,
          offer: offer.trim() || undefined,
          audience: audience.trim() || undefined,
          geography: geography.trim() || undefined,
          landingPage: landingPage.trim() || undefined,
          constraints: constraints.trim() || undefined,
        }),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        campaign?: { id?: string };
        error?: { message?: string };
      }>(response);

      if (!payload.ok || !payload.campaign?.id) {
        setError(payload.error?.message || copy.generateFailed);
        return;
      }

      router.push(`/ads/${payload.campaign.id}`);
      router.refresh();
    } catch {
      setError(copy.generateFailed);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const advancedFields = [
    [copy.nameLabel, name, setName, 120, "input"],
    [copy.geographyLabel, geography, setGeography, 200, "textarea"],
    [copy.landingPageLabel, landingPage, setLandingPage, 500, "textarea"],
    [copy.constraintsLabel, constraints, setConstraints, 1000, "textarea"],
  ] as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
        <p className="text-sm leading-7 text-white/60">{copy.briefOptional}</p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.objectiveLabel}
        </span>
        <textarea
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          maxLength={500}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.offerLabel}
        </span>
        <textarea
          value={offer}
          onChange={(event) => setOffer(event.target.value)}
          className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          maxLength={500}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.audienceLabel}
        </span>
        <textarea
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
          className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          maxLength={500}
        />
        <p className="text-xs leading-5 text-white/40">
          {messages?.ads.traction.audienceHelp ??
            en.ads.traction.audienceHelp}
        </p>
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.guidanceLabel}
        </span>
        <textarea
          value={guidance}
          onChange={(event) => setGuidance(event.target.value)}
          className="min-h-[160px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          placeholder={copy.guidancePlaceholder}
          maxLength={4000}
        />
      </label>

      <AthenaCollapsibleSection title={copy.moreDetail} defaultOpen={false}>
        <div className="space-y-4">
          {advancedFields.map(([label, value, setter, max, kind]) => (
            <label key={label} className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                {label}
              </span>
              {kind === "input" ? (
                <input
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
                  placeholder={
                    label === copy.nameLabel ? copy.namePlaceholder : undefined
                  }
                  maxLength={max}
                />
              ) : (
                <textarea
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
                  maxLength={max}
                />
              )}
            </label>
          ))}
        </div>
      </AthenaCollapsibleSection>

      {error ? <p className="text-sm text-rose-200">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? copy.starting : copy.generate}
      </button>
    </form>
  );
}
