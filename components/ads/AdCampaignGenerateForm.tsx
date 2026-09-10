"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Brain, SlidersHorizontal, Target } from "lucide-react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  AD_CREATE_ADVANCED_ICON,
  AD_CREATE_ADVANCED_SURFACE,
  AD_CREATE_BRIEF_ICON,
  AD_CREATE_BRIEF_SURFACE,
  AD_CREATE_CARD_SHELL,
  AD_CREATE_CONTEXT_ICON,
  AD_CREATE_CONTEXT_SURFACE,
  AD_CREATE_ERROR_CLASS,
  AD_CREATE_FIELD_CLASS,
  AD_CREATE_FIELD_HELP_CLASS,
  AD_CREATE_FIELD_LABEL_CLASS,
  AD_CREATE_PRIMARY_CLASS,
  AD_CREATE_TEXTAREA_CLASS,
} from "@/lib/ads/adCampaignCreatePresentation";
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
  const audienceHelp =
    messages?.ads.traction.audienceHelp ?? en.ads.traction.audienceHelp;
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

  const contextSources = [
    copy.contextSourceBrain,
    copy.contextSourceAudiences,
    copy.contextSourceProspects,
    copy.contextSourceWebsite,
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className={`${AD_CREATE_CARD_SHELL} ${AD_CREATE_CONTEXT_SURFACE}`}>
        <div className="flex items-start gap-4">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-2xl ${AD_CREATE_CONTEXT_ICON}`}
            aria-hidden="true"
          >
            <Brain className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              {copy.contextTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              {copy.briefOptional}
            </p>
          </div>
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {copy.contextSourcesLead}
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-6 text-white/55">
          {contextSources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-white/40">
          {copy.contextSourcesNote}
        </p>
      </section>

      <section className={`${AD_CREATE_CARD_SHELL} ${AD_CREATE_BRIEF_SURFACE}`}>
        <div className="flex items-start gap-4">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-2xl ${AD_CREATE_BRIEF_ICON}`}
            aria-hidden="true"
          >
            <Target className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              {copy.briefTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              {copy.briefHelper}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <label className="block space-y-2">
            <span className={AD_CREATE_FIELD_LABEL_CLASS}>
              {copy.objectiveLabel}
            </span>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              className={`${AD_CREATE_TEXTAREA_CLASS} min-h-[88px]`}
              maxLength={500}
            />
          </label>

          <label className="block space-y-2">
            <span className={AD_CREATE_FIELD_LABEL_CLASS}>{copy.offerLabel}</span>
            <textarea
              value={offer}
              onChange={(event) => setOffer(event.target.value)}
              className={`${AD_CREATE_TEXTAREA_CLASS} min-h-[88px]`}
              maxLength={500}
            />
          </label>

          <label className="block space-y-2">
            <span className={AD_CREATE_FIELD_LABEL_CLASS}>
              {copy.audienceLabel}
            </span>
            <textarea
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className={`${AD_CREATE_TEXTAREA_CLASS} min-h-[88px]`}
              maxLength={500}
            />
            <p className={AD_CREATE_FIELD_HELP_CLASS}>{audienceHelp}</p>
          </label>

          <label className="block space-y-2">
            <span className={AD_CREATE_FIELD_LABEL_CLASS}>
              {copy.guidanceLabel}
            </span>
            <textarea
              value={guidance}
              onChange={(event) => setGuidance(event.target.value)}
              className={`${AD_CREATE_TEXTAREA_CLASS} min-h-[160px]`}
              placeholder={copy.guidancePlaceholder}
              maxLength={4000}
            />
          </label>
        </div>
      </section>

      <AthenaCollapsibleSection
        title={copy.moreDetail}
        defaultOpen={false}
        tone="intelligence"
        icon={<SlidersHorizontal aria-hidden="true" />}
        iconClassName={AD_CREATE_ADVANCED_ICON}
        className={AD_CREATE_ADVANCED_SURFACE}
      >
        <div className="space-y-5">
          {advancedFields.map(([label, value, setter, max, kind]) => (
            <label key={label} className="block space-y-2">
              <span className={AD_CREATE_FIELD_LABEL_CLASS}>{label}</span>
              {kind === "input" ? (
                <input
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className={AD_CREATE_FIELD_CLASS}
                  placeholder={
                    label === copy.nameLabel ? copy.namePlaceholder : undefined
                  }
                  maxLength={max}
                />
              ) : (
                <textarea
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className={`${AD_CREATE_TEXTAREA_CLASS} min-h-[88px]`}
                  maxLength={max}
                />
              )}
            </label>
          ))}
        </div>
      </AthenaCollapsibleSection>

      {error ? (
        <div className={AD_CREATE_ERROR_CLASS} role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className={AD_CREATE_PRIMARY_CLASS}
      >
        {submitting ? copy.starting : copy.generate}
      </button>
    </form>
  );
}
