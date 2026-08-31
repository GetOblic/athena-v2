"use client";

import { CopyButton, type CopyButtonChrome } from "@/components/deployment/CopyButton";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { en } from "@/lib/tenantI18n/messages/en";
import { getSocialPlannerCopyChrome } from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SocialPlannerProductionSpec } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";

type CopyableFieldProps = {
  label: string;
  value: string | null | undefined;
  chrome?: CopyButtonChrome | null;
};

export function SocialPlannerCopyableField({
  label,
  value,
  chrome = null,
}: CopyableFieldProps) {
  if (!value || !value.trim()) return null;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {label}
        </div>
        <CopyButton
          text={value}
          tracking={null}
          showContinue={false}
          chrome={chrome}
        />
      </div>
      <div className="whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
        {value}
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value || !value.trim()) return null;
  return (
    <div className="min-w-0 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
        {label}
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-white/75">
        {value}
      </div>
    </div>
  );
}

type SocialCalendarProductionSpecProps = {
  spec: SocialPlannerProductionSpec;
  messages?: TenantMessages;
};

export function SocialCalendarProductionSpec({
  spec,
  messages,
}: SocialCalendarProductionSpecProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const chrome = getSocialPlannerCopyChrome(dictionary);

  if (spec.kind === "static") {
    return (
      <div className="space-y-5">
        <SocialPlannerCopyableField
          label={copy.imagePrompt}
          value={spec.imagePrompt}
          chrome={chrome}
        />
        <FieldBlock label={copy.composition} value={spec.composition} />
        <FieldBlock label={copy.setting} value={spec.setting} />
        <FieldBlock label={copy.subjects} value={spec.subjects} />
        <SocialPlannerCopyableField
          label={copy.overlayGuidance}
          value={spec.overlayCopyGuidance}
          chrome={chrome}
        />
        <FieldBlock label={copy.visualTone} value={spec.visualTone} />
      </div>
    );
  }

  if (spec.kind === "carousel") {
    return (
      <div className="space-y-5">
        <FieldBlock label={copy.visualDirection} value={spec.visualDirection} />
        <SocialPlannerCopyableField
          label={copy.designPrompt}
          value={spec.designPrompt}
          chrome={chrome}
        />
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {copy.slides}
          </div>
          <ol className="space-y-3">
            {spec.slides.map((slide) => (
              <li
                key={slide.index}
                className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                    {interpolateTenantMessage(
                      copy.slideN.includes("{n}")
                        ? copy.slideN
                        : en.socialPlanner.slideN,
                      { n: slide.index },
                    )}
                  </div>
                  <CopyButton
                    text={[slide.headline, slide.body, slide.visualNote]
                      .filter(Boolean)
                      .join("\n\n")}
                    tracking={null}
                    showContinue={false}
                    chrome={chrome}
                  />
                </div>
                {slide.headline ? (
                  <h4 className="mt-2 text-base font-semibold">{slide.headline}</h4>
                ) : null}
                {slide.body ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-white/70">
                    {slide.body}
                  </p>
                ) : null}
                {slide.visualNote ? (
                  <p className="mt-2 text-sm leading-6 text-white/45">
                    {slide.visualNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  if (spec.kind === "video") {
    return (
      <div className="space-y-5">
        <SocialPlannerCopyableField
          label={copy.videoConcept}
          value={spec.videoConcept}
          chrome={chrome}
        />
        <FieldBlock label={copy.hook} value={spec.hook} />
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {copy.sceneShotPlan}
          </div>
          <ol className="space-y-3">
            {spec.shotPlan.map((shot) => (
              <li
                key={shot.shot}
                className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                  {interpolateTenantMessage(
                    copy.shotN.includes("{n}")
                      ? copy.shotN
                      : en.socialPlanner.shotN,
                    { n: shot.shot },
                  )}
                </div>
                {shot.action ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-white/75">
                    {shot.action}
                  </p>
                ) : null}
                {shot.framing ? (
                  <p className="mt-2 text-sm leading-6 text-white/45">{shot.framing}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <SocialPlannerCopyableField
          label={copy.dialogue}
          value={spec.dialogue}
          chrome={chrome}
        />
        <FieldBlock label={copy.environment} value={spec.environment} />
        <SocialPlannerCopyableField
          label={copy.productionDirection}
          value={spec.productionDirection}
          chrome={chrome}
        />
      </div>
    );
  }

  if (spec.kind === "document") {
    return (
      <div className="space-y-5">
        <FieldBlock label={copy.documentConcept} value={spec.documentConcept} />
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {copy.sectionPageStructure}
          </div>
          <ol className="space-y-3">
            {spec.sections.map((section, index) => (
              <li
                key={`${section.heading}-${index}`}
                className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <h4 className="text-base font-semibold">{section.heading}</h4>
                {section.content ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-white/70">
                    {section.content}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <SocialPlannerCopyableField
          label={copy.contentInstructions}
          value={spec.sections
            .map((section) => `${section.heading}\n${section.content}`)
            .join("\n\n")}
          chrome={chrome}
        />
        <SocialPlannerCopyableField
          label={copy.designPrompt}
          value={spec.designPrompt}
          chrome={chrome}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SocialPlannerCopyableField
        label={copy.prompt}
        value={spec.prompt}
        chrome={chrome}
      />
      {spec.options && spec.options.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {copy.options}
          </div>
          <ul className="space-y-2">
            {spec.options.map((option) => (
              <li
                key={option}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/75"
              >
                {option}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {spec.visualSupport ? (
        <FieldBlock label={copy.visualSupport} value={spec.visualSupport} />
      ) : null}
    </div>
  );
}
