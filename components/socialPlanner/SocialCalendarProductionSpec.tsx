"use client";

import { CopyButton } from "@/components/deployment/CopyButton";
import type { SocialPlannerProductionSpec } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";

type CopyableFieldProps = {
  label: string;
  value: string | null | undefined;
};

export function SocialPlannerCopyableField({ label, value }: CopyableFieldProps) {
  if (!value || !value.trim()) return null;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {label}
        </div>
        <CopyButton text={value} tracking={null} showContinue={false} />
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
};

export function SocialCalendarProductionSpec({
  spec,
}: SocialCalendarProductionSpecProps) {
  if (spec.kind === "static") {
    return (
      <div className="space-y-5">
        <SocialPlannerCopyableField label="Image Prompt" value={spec.imagePrompt} />
        <FieldBlock label="Composition" value={spec.composition} />
        <FieldBlock label="Setting" value={spec.setting} />
        <FieldBlock label="Subjects" value={spec.subjects} />
        <SocialPlannerCopyableField
          label="Overlay Guidance"
          value={spec.overlayCopyGuidance}
        />
        <FieldBlock label="Visual Tone" value={spec.visualTone} />
      </div>
    );
  }

  if (spec.kind === "carousel") {
    return (
      <div className="space-y-5">
        <FieldBlock label="Visual Direction" value={spec.visualDirection} />
        <SocialPlannerCopyableField label="Design Prompt" value={spec.designPrompt} />
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            Slides
          </div>
          <ol className="space-y-3">
            {spec.slides.map((slide) => (
              <li
                key={slide.index}
                className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                    Slide {slide.index}
                  </div>
                  <CopyButton
                    text={[slide.headline, slide.body, slide.visualNote]
                      .filter(Boolean)
                      .join("\n\n")}
                    tracking={null}
                    showContinue={false}
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
        <SocialPlannerCopyableField label="Video Concept" value={spec.videoConcept} />
        <FieldBlock label="Hook" value={spec.hook} />
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            Scene / Shot Plan
          </div>
          <ol className="space-y-3">
            {spec.shotPlan.map((shot) => (
              <li
                key={shot.shot}
                className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                  Shot {shot.shot}
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
        <SocialPlannerCopyableField label="Dialogue" value={spec.dialogue} />
        <FieldBlock label="Environment" value={spec.environment} />
        <SocialPlannerCopyableField
          label="Production Direction"
          value={spec.productionDirection}
        />
      </div>
    );
  }

  if (spec.kind === "document") {
    return (
      <div className="space-y-5">
        <FieldBlock label="Document Concept" value={spec.documentConcept} />
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            Section / Page Structure
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
          label="Content Instructions"
          value={spec.sections
            .map((section) => `${section.heading}\n${section.content}`)
            .join("\n\n")}
        />
        <SocialPlannerCopyableField label="Design Prompt" value={spec.designPrompt} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SocialPlannerCopyableField label="Prompt" value={spec.prompt} />
      {spec.options && spec.options.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            Options
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
        <FieldBlock label="Visual Support" value={spec.visualSupport} />
      ) : null}
    </div>
  );
}
