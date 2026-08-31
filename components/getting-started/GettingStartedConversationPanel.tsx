"use client";

import {
  AthenaConversationPanel,
  type AthenaConversationChrome,
} from "@/components/conversation/AthenaConversationPanel";
import {
  GETTING_STARTED_CONVERSATION_STORAGE_KEY,
  buildGettingStartedConversationStorageKey,
} from "@/services/athenaConversation/athenaConversationStorageKeys";

export const GETTING_STARTED_CONVERSATION_TITLE = "Ask Athena how it works";

export const GETTING_STARTED_CONVERSATION_DESCRIPTION =
  "Get guidance about Athena’s workflow, business profile, knowledge, discussions, opportunities, intelligence, and deployment assets.";

export const GETTING_STARTED_CONVERSATION_PLACEHOLDER =
  "Ask a question about Athena…";

export const GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS = [
  "What should I complete first?",
  "What is the difference between Voice and Business Knowledge?",
  "How does Athena use my website?",
  "How does Athena identify opportunities?",
  "What is Executive Intelligence?",
  "What happens after I import a discussion?",
] as const;

export const GETTING_STARTED_CONVERSATION_ENDPOINT =
  "/api/getting-started/conversation";

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
};

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
}: GettingStartedConversationPanelProps) {
  const storageKey = buildGettingStartedConversationStorageKey();

  return (
    <div className="mb-10 max-w-4xl">
      <AthenaConversationPanel
        title={title}
        description={description}
        placeholder={placeholder}
        examplePrompts={examplePrompts}
        storageKey={storageKey}
        conversationEndpoint={GETTING_STARTED_CONVERSATION_ENDPOINT}
        defaultOpen={false}
        panelId="getting-started-conversation"
        inputId="getting-started-conversation-input"
        inputLabel={inputLabel}
        remountKey={GETTING_STARTED_CONVERSATION_STORAGE_KEY}
        chrome={chrome}
        clearLabel={clearLabel}
        submitLabel={submitLabel}
        emptyStateTitle={emptyStateTitle}
        readOnlyNotice={readOnlyNotice}
      />
    </div>
  );
}
