"use client";

import {
  AthenaConversationPanel,
  type AthenaConversationChrome,
} from "@/components/conversation/AthenaConversationPanel";
import { UpgradeExhaustedNotice } from "@/components/upgrade/UpgradeExhaustedNotice";
import {
  isFreeHelpAskComposerOpen,
  type FreeHelpAskPresentation,
} from "@/lib/organization/freeHelpAsk";
import type { UpgradeContextualContent } from "@/lib/upgrade/upgradePresentation";
import {
  GETTING_STARTED_CONVERSATION_STORAGE_KEY,
  buildGettingStartedConversationStorageKey,
} from "@/services/athenaConversation/athenaConversationStorageKeys";

export const GETTING_STARTED_CONVERSATION_TITLE = "Ask Athena how to use Athena";

export const GETTING_STARTED_CONVERSATION_DESCRIPTION =
  "Get guidance about Athena Brain, Visibility, Audiences, advertising, social content, Prospects, and how these parts work together.";

export const GETTING_STARTED_CONVERSATION_PLACEHOLDER =
  "Ask a question about Athena…";

export const GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS = [
  "What should I complete first?",
  "What is the difference between an Audience and a Prospect?",
  "How do I teach Athena about my business?",
  "What is Athena Brain?",
  "How do I run a Visibility analysis?",
  "Where did Athena save what it created?",
] as const;

export const GETTING_STARTED_CONVERSATION_ENDPOINT =
  "/api/getting-started/conversation";

export type GettingStartedConversationAskCopy = {
  exhaustedTitle: string;
  exhaustedHelper: string;
};

type GettingStartedConversationPanelProps = {
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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  presentation?: FreeHelpAskPresentation;
  askCopy?: GettingStartedConversationAskCopy;
  upgradeContent?: UpgradeContextualContent | null;
};

function HelpAskStatusNotice({
  title,
  helper,
}: {
  title: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <p className="text-sm leading-6 text-white/85">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/55">{helper}</p>
    </div>
  );
}

export function GettingStartedConversationPanel({
  title = GETTING_STARTED_CONVERSATION_TITLE,
  description = GETTING_STARTED_CONVERSATION_DESCRIPTION,
  placeholder = GETTING_STARTED_CONVERSATION_PLACEHOLDER,
  examplePrompts = GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS,
  inputLabel = "Ask a question about Athena",
  chrome,
  clearLabel,
  submitLabel,
  emptyStateTitle,
  readOnlyNotice,
  open,
  onOpenChange,
  presentation = "available",
  askCopy,
  upgradeContent,
}: GettingStartedConversationPanelProps) {
  const storageKey = buildGettingStartedConversationStorageKey();
  const composerOpen = isFreeHelpAskComposerOpen(presentation);
  const statusNotice =
    presentation === "exhausted" && askCopy ? (
      <HelpAskStatusNotice
        title={askCopy.exhaustedTitle}
        helper={askCopy.exhaustedHelper}
      />
    ) : null;

  return (
    <div className="max-w-4xl">
      <AthenaConversationPanel
        title={title}
        description={description}
        placeholder={placeholder}
        examplePrompts={examplePrompts}
        storageKey={storageKey}
        conversationEndpoint={GETTING_STARTED_CONVERSATION_ENDPOINT}
        defaultOpen={false}
        open={open}
        onOpenChange={onOpenChange}
        panelId="getting-started-conversation"
        inputId="getting-started-conversation-input"
        inputLabel={inputLabel}
        remountKey={GETTING_STARTED_CONVERSATION_STORAGE_KEY}
        chrome={chrome}
        clearLabel={clearLabel}
        submitLabel={submitLabel}
        emptyStateTitle={emptyStateTitle}
        readOnlyNotice={readOnlyNotice}
        hideComposer={!composerOpen}
        suggestionInteraction={
          presentation === "exhausted" ? "static" : "fill"
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
    </div>
  );
}
