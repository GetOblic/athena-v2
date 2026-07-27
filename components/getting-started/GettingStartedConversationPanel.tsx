"use client";

import { AthenaConversationPanel } from "@/components/conversation/AthenaConversationPanel";
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

export function GettingStartedConversationPanel() {
  const storageKey = buildGettingStartedConversationStorageKey();

  return (
    <div className="mb-10 max-w-4xl">
      <AthenaConversationPanel
        title={GETTING_STARTED_CONVERSATION_TITLE}
        description={GETTING_STARTED_CONVERSATION_DESCRIPTION}
        placeholder={GETTING_STARTED_CONVERSATION_PLACEHOLDER}
        examplePrompts={GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS}
        storageKey={storageKey}
        conversationEndpoint={GETTING_STARTED_CONVERSATION_ENDPOINT}
        defaultOpen={false}
        panelId="getting-started-conversation"
        inputId="getting-started-conversation-input"
        inputLabel="Ask a question about Athena"
        remountKey={GETTING_STARTED_CONVERSATION_STORAGE_KEY}
      />
    </div>
  );
}
