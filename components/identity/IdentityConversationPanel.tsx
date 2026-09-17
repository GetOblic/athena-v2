"use client";

import {
  AthenaConversationPanel,
  type AthenaConversationChrome,
} from "@/components/conversation/AthenaConversationPanel";
import { IdentityTeachAthenaLink } from "@/components/identity/identityTeachAthenaDeepLink";
import { IDENTITY_TEACH_ATHENA_HREF } from "@/components/identity/identityPagePresentation";
import { UpgradeExhaustedNotice } from "@/components/upgrade/UpgradeExhaustedNotice";
import {
  isFreeIdentityAskComposerOpen,
  type FreeIdentityAskPresentation,
} from "@/lib/organization/freeIdentityAsk";
import type { UpgradeContextualContent } from "@/lib/upgrade/upgradePresentation";
import { buildIdentityConversationStorageKey } from "@/services/athenaConversation/athenaConversationStorageKeys";

export const IDENTITY_CONVERSATION_TITLE = "Ask Athena about your business";

export const IDENTITY_CONVERSATION_DESCRIPTION =
  "Explore what Athena currently understands about your business, positioning, audience, voice, services, and how Athena uses this information.";

export const IDENTITY_CONVERSATION_PLACEHOLDER =
  "Ask a question about your business or Athena…";

export const IDENTITY_CONVERSATION_EXAMPLE_PROMPTS = [
  "What does Athena currently understand about my business?",
  "How would you describe my positioning and strongest differentiators?",
  "Is anything important missing from my Business Knowledge?",
  "Does my current Voice match how I want clients to perceive the business?",
  "What has Athena learned from my website?",
  "How does Athena use this information?",
] as const;

export const IDENTITY_CONVERSATION_ENDPOINT = "/api/identity/conversation";

export type IdentityConversationAskCopy = {
  untrainedTitle: string;
  untrainedHelper: string;
  untrainedActionLabel: string;
  exhaustedTitle: string;
  exhaustedHelper: string;
};

type IdentityConversationPanelProps = {
  /** Deterministic opaque fingerprint from the server page (browser-session namespacing). */
  opaqueScope: string;
  title?: string;
  description?: string;
  placeholder?: string;
  examplePrompts?: readonly string[];
  inputLabel?: string;
  chrome?: AthenaConversationChrome;
  clearLabel?: string;
  submitLabel?: string;
  emptyStateTitle?: string;
  readOnlyNotice?: string;
  presentation?: FreeIdentityAskPresentation;
  askCopy?: IdentityConversationAskCopy;
  upgradeContent?: UpgradeContextualContent | null;
};

function IdentityAskStatusNotice({
  title,
  helper,
  actionLabel,
  actionHref,
}: {
  title: string;
  helper: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <p className="text-sm leading-6 text-white/85">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/55">{helper}</p>
      {actionLabel && actionHref ? (
        <IdentityTeachAthenaLink
          href={actionHref}
          className="mt-4 inline-flex items-center justify-center rounded-xl border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/15 px-4 py-2 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
        >
          {actionLabel}
        </IdentityTeachAthenaLink>
      ) : null}
    </div>
  );
}

export function IdentityConversationPanel({
  opaqueScope,
  title = IDENTITY_CONVERSATION_TITLE,
  description = IDENTITY_CONVERSATION_DESCRIPTION,
  placeholder = IDENTITY_CONVERSATION_PLACEHOLDER,
  examplePrompts = IDENTITY_CONVERSATION_EXAMPLE_PROMPTS,
  inputLabel = "Ask a question about your business or Athena",
  chrome,
  clearLabel,
  submitLabel,
  emptyStateTitle,
  readOnlyNotice,
  presentation = "available",
  askCopy,
  upgradeContent,
}: IdentityConversationPanelProps) {
  const storageKey = buildIdentityConversationStorageKey(opaqueScope);
  const composerOpen = isFreeIdentityAskComposerOpen(presentation);
  const statusNotice =
    presentation === "untrained" && askCopy ? (
      <IdentityAskStatusNotice
        title={askCopy.untrainedTitle}
        helper={askCopy.untrainedHelper}
        actionLabel={askCopy.untrainedActionLabel}
        actionHref={IDENTITY_TEACH_ATHENA_HREF}
      />
    ) : presentation === "exhausted" && askCopy ? (
      <IdentityAskStatusNotice
        title={askCopy.exhaustedTitle}
        helper={askCopy.exhaustedHelper}
      />
    ) : null;

  return (
    <AthenaConversationPanel
      title={title}
      description={description}
      placeholder={placeholder}
      examplePrompts={examplePrompts}
      storageKey={storageKey}
      conversationEndpoint={IDENTITY_CONVERSATION_ENDPOINT}
      embedded
      panelId="identity-conversation"
      inputId="identity-conversation-input"
      inputLabel={inputLabel}
      remountKey={`identity-conversation-${opaqueScope}`}
      chrome={chrome}
      clearLabel={clearLabel}
      submitLabel={submitLabel}
      emptyStateTitle={emptyStateTitle}
      readOnlyNotice={readOnlyNotice}
      hideComposer={!composerOpen}
      suggestionInteraction={
        presentation === "untrained"
          ? "hidden"
          : presentation === "exhausted"
            ? "static"
            : "fill"
      }
      statusNotice={statusNotice}
      afterValue={
        presentation === "exhausted" && upgradeContent ? (
          <UpgradeExhaustedNotice
            {...upgradeContent}
            headingLevel={3}
            action={{ kind: "none" }}
          />
        ) : null
      }
    />
  );
}
