import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { IdentityTeachAthenaDisclosure } from "@/components/identity/identityTeachAthenaDeepLink";
import {
  TrainAthenaForm,
  TrainAthenaSubmitButton,
} from "@/components/identity/TrainAthenaSubmitButton";
import {
  IDENTITY_CARD_ICON_CLASS,
  IDENTITY_FIELD_ANCHORS,
  IDENTITY_SUCCESS_SECTION_CONTOUR_CLASS,
} from "@/components/identity/identityPagePresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { AthenaIdentity } from "@/services/identity/identityService";

type IdentityCopy = TenantMessages["identity"];

const fieldClassName =
  "rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/90 shadow-inner shadow-black/20 outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

type IdentityTeachAthenaSectionProps = {
  identity: AthenaIdentity | null;
  messages: IdentityCopy;
  action: (formData: FormData) => Promise<void>;
  trainLabel: string;
  pendingLabel: string;
  generationLocked?: boolean;
};

export function IdentityTeachAthenaSection({
  identity,
  messages,
  action,
  trainLabel,
  pendingLabel,
  generationLocked = false,
}: IdentityTeachAthenaSectionProps) {
  const page = messages.page;
  const trainedHelper = Boolean(
    identity?.brain_status === "ready" ||
      identity?.master_profile ||
      identity?.brain_last_updated,
  );
  const summary = generationLocked
    ? page.teachLearned
    : trainedHelper
      ? page.teachTrainedHelper
      : page.teachUntrainedHelper;

  return (
    <IdentityTeachAthenaDisclosure
      title={page.teachTitle}
      summary={summary}
      defaultOpen={false}
      icon={<GraduationCap size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.green}
      className={`${IDENTITY_SUCCESS_SECTION_CONTOUR_CLASS} scroll-mt-24`}
    >
      {generationLocked ? (
        <div className="grid gap-8">
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-white/80">
              {page.teachLearned}
            </p>
            <p className="text-sm leading-6 text-white/50">
              {page.teachLearnedHelper}
            </p>
          </div>

          <FieldGroup title={page.teachAddressing}>
            <ReadOnlyFact
              label={messages.greetingLabel}
              value={identity?.greeting_name}
            />
          </FieldGroup>

          <FieldGroup title={page.teachFacts}>
            <ReadOnlyFact
              id={IDENTITY_FIELD_ANCHORS.voice}
              label={messages.voiceLabel}
              value={identity?.about_you}
            />
            <ReadOnlyFact
              id={IDENTITY_FIELD_ANCHORS.knowledge}
              label={messages.knowledgeLabel}
              value={identity?.expertise}
            />
          </FieldGroup>

          <FieldGroup title={page.teachWebsite}>
            <ReadOnlyFact
              id={IDENTITY_FIELD_ANCHORS.website}
              label={messages.websiteLabel}
              value={identity?.website}
            />
          </FieldGroup>
        </div>
      ) : (
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

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <TrainAthenaSubmitButton
              label={trainLabel}
              pendingLabel={pendingLabel}
            />
            <a
              href={`#${IDENTITY_FIELD_ANCHORS.websiteKnowledge}`}
              className="inline-flex w-full items-center justify-center rounded-full border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-8 py-4 text-sm font-semibold text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 sm:w-auto"
            >
              {messages.deepScrape.button}
            </a>
          </div>
        </TrainAthenaForm>
      )}
    </IdentityTeachAthenaDisclosure>
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

function ReadOnlyFact({
  id,
  label,
  value,
}: {
  id?: string;
  label: string;
  value?: string | null;
}) {
  const display = value?.trim() || "—";
  return (
    <div id={id} className="grid scroll-mt-24 gap-3">
      <span className="text-xl font-semibold">{label}</span>
      <div className={`w-full whitespace-pre-wrap leading-6 ${fieldClassName}`}>
        {display}
      </div>
    </div>
  );
}
