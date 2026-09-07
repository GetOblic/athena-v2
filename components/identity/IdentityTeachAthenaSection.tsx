import type { ReactNode } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  TrainAthenaForm,
  TrainAthenaSubmitButton,
} from "@/components/identity/TrainAthenaSubmitButton";
import { IDENTITY_FIELD_ANCHORS } from "@/components/identity/identityPagePresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { AthenaIdentity } from "@/services/identity/identityService";

type IdentityCopy = TenantMessages["identity"];

const fieldClassName =
  "rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/90 shadow-inner shadow-black/20 outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

type IdentityTeachAthenaSectionProps = {
  identity: AthenaIdentity | null;
  messages: IdentityCopy;
  action: (formData: FormData) => Promise<void>;
  defaultOpen: boolean;
  trainLabel: string;
  pendingLabel: string;
};

export function IdentityTeachAthenaSection({
  identity,
  messages,
  action,
  defaultOpen,
  trainLabel,
  pendingLabel,
}: IdentityTeachAthenaSectionProps) {
  const page = messages.page;
  const trainedHelper = Boolean(
    identity?.brain_status === "ready" ||
      identity?.master_profile ||
      identity?.brain_last_updated,
  );

  return (
    <AthenaCollapsibleSection
      title={page.teachTitle}
      defaultOpen={defaultOpen}
    >
      <TrainAthenaForm action={action} className="grid gap-8">
        <p className="text-sm leading-6 text-white/50">
          {trainedHelper ? page.teachTrainedHelper : page.teachUntrainedHelper}
        </p>

        <FieldGroup title={page.teachAddressing}>
          <label className="grid gap-3">
            <span className="text-xl font-semibold">{messages.greetingLabel}</span>
            <span className="max-w-3xl text-sm leading-6 text-white/45">
              {messages.greetingHelp}
            </span>
            <input
              name="greeting_name"
              defaultValue={identity?.greeting_name ?? ""}
              className={`w-full ${fieldClassName}`}
              placeholder={messages.greetingPlaceholder}
            />
          </label>
        </FieldGroup>

        <FieldGroup title={page.teachFacts}>
          <label
            id={IDENTITY_FIELD_ANCHORS.voice}
            className="grid scroll-mt-24 gap-3"
          >
            <span className="text-xl font-semibold">{messages.voiceLabel}</span>
            <span className="max-w-3xl text-sm leading-6 text-white/45">
              {messages.voiceHelp}
            </span>
            <textarea
              name="about_you"
              rows={6}
              defaultValue={identity?.about_you ?? ""}
              className={`w-full resize-y leading-6 ${fieldClassName}`}
              placeholder={messages.voicePlaceholder}
            />
          </label>

          <label
            id={IDENTITY_FIELD_ANCHORS.knowledge}
            className="grid scroll-mt-24 gap-3"
          >
            <span className="text-xl font-semibold">
              {messages.knowledgeLabel}
            </span>
            <span className="max-w-3xl text-sm leading-6 text-white/45">
              {messages.knowledgeHelp}
            </span>
            <textarea
              name="expertise"
              rows={8}
              defaultValue={identity?.expertise ?? ""}
              className={`w-full resize-y leading-6 ${fieldClassName}`}
              placeholder={messages.knowledgePlaceholder}
            />
          </label>
        </FieldGroup>

        <FieldGroup title={page.teachWebsite}>
          <label
            id={IDENTITY_FIELD_ANCHORS.website}
            className="grid scroll-mt-24 gap-3"
          >
            <span className="text-xl font-semibold">{messages.websiteLabel}</span>
            <span className="max-w-3xl text-sm leading-6 text-white/45">
              {messages.websiteHelp}
            </span>
            <input
              name="website"
              defaultValue={identity?.website ?? ""}
              className={`w-full ${fieldClassName}`}
              placeholder={messages.websitePlaceholder}
            />
          </label>
        </FieldGroup>

        <TrainAthenaSubmitButton label={trainLabel} pendingLabel={pendingLabel} />
      </TrainAthenaForm>
    </AthenaCollapsibleSection>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
        {title}
      </h3>
      {children}
    </div>
  );
}
