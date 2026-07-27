"use client";

import { AthenaConversationPanel } from "@/components/conversation/AthenaConversationPanel";
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

type IdentityConversationPanelProps = {
  /** Deterministic opaque fingerprint from the server page (browser-session namespacing). */
  opaqueScope: string;
};

export function IdentityConversationPanel({
  opaqueScope,
}: IdentityConversationPanelProps) {
  const storageKey = buildIdentityConversationStorageKey(opaqueScope);

  return (
    <div className="mb-10">
      <AthenaConversationPanel
        title={IDENTITY_CONVERSATION_TITLE}
        description={IDENTITY_CONVERSATION_DESCRIPTION}
        placeholder={IDENTITY_CONVERSATION_PLACEHOLDER}
        examplePrompts={IDENTITY_CONVERSATION_EXAMPLE_PROMPTS}
        storageKey={storageKey}
        conversationEndpoint={IDENTITY_CONVERSATION_ENDPOINT}
        defaultOpen={false}
        panelId="identity-conversation"
        inputId="identity-conversation-input"
        inputLabel="Ask a question about your business or Athena"
        remountKey={`identity-conversation-${opaqueScope}`}
      />
    </div>
  );
}
