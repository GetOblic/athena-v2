"use client";

import { useFormStatus } from "react-dom";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import {
  AI_WORKSPACE_OPTIONS,
  IMAGE_GENERATOR_OPTIONS,
  type AiWorkspaceId,
  type ImageGeneratorId,
} from "@/services/assetContinuation/destinationRegistry";

const fieldClassName =
  "rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/90 shadow-inner shadow-black/20 outline-none focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

type WorkspaceMessages = {
  eyebrow: string;
  title: string;
  description: string;
  saved: string;
  preferredWorkspace: string;
  preferredImageGenerator: string;
  save: string;
  saving: string;
};

const DEFAULT_WORKSPACE_MESSAGES: WorkspaceMessages = {
  eyebrow: "AI Workspace",
  title: "Preferred continuation destinations",
  description:
    "When you select Continue on an asset, Athena copies the content and opens your preferred workspace. No API integration — paste to continue.",
  saved: "AI Workspace preferences saved.",
  preferredWorkspace: "Preferred AI Workspace",
  preferredImageGenerator: "Preferred Image Generator",
  save: "Save AI Workspace",
  saving: "Saving…",
};

type AiWorkspacePreferencesSectionProps = {
  initialPreferredAiWorkspace: AiWorkspaceId;
  initialPreferredImageGenerator: ImageGeneratorId;
  saveAiWorkspacePreferences: (formData: FormData) => Promise<void>;
  saved?: boolean;
  error?: string | null;
  messages?: WorkspaceMessages;
};

function SaveButton({
  saveLabel,
  savingLabel,
}: {
  saveLabel: string;
  savingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-fit items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? savingLabel : saveLabel}
    </button>
  );
}

export function AiWorkspacePreferencesSection({
  initialPreferredAiWorkspace,
  initialPreferredImageGenerator,
  saveAiWorkspacePreferences,
  saved = false,
  error = null,
  messages = DEFAULT_WORKSPACE_MESSAGES,
}: AiWorkspacePreferencesSectionProps) {
  return (
    <section
      className={`mt-10 rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {messages.eyebrow}
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">
        {messages.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-white/50">
        {messages.description}
      </p>

      {saved ? (
        <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {messages.saved}
        </div>
      ) : null}
      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <form action={saveAiWorkspacePreferences} className="mt-8 grid gap-6">
        <label className="grid gap-3">
          <span className="text-sm font-medium text-white/80">
            {messages.preferredWorkspace}
          </span>
          <select
            name="preferred_ai_workspace"
            defaultValue={initialPreferredAiWorkspace}
            className={fieldClassName}
          >
            {AI_WORKSPACE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-3">
          <span className="text-sm font-medium text-white/80">
            {messages.preferredImageGenerator}
          </span>
          <select
            name="preferred_image_generator"
            defaultValue={initialPreferredImageGenerator}
            className={fieldClassName}
          >
            {IMAGE_GENERATOR_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <SaveButton saveLabel={messages.save} savingLabel={messages.saving} />
      </form>
    </section>
  );
}
