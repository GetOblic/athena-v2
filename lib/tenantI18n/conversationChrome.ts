import type { AthenaConversationChrome } from "@/components/conversation/AthenaConversationPanel";
import type { TenantMessages } from "./types";

export function tenantConversationChrome(
  messages: TenantMessages,
): AthenaConversationChrome {
  return {
    you: messages.conversation.you,
    athena: messages.conversation.athena,
    copy: messages.common.copy,
    copied: messages.common.copied,
    thinking: messages.conversation.thinking,
    retry: messages.common.retry,
    asking: messages.conversation.asking,
    enterToSend: messages.conversation.enterToSend,
    supportReference: messages.conversation.supportReference,
    transportFailed: messages.conversation.transportFailed,
  };
}

export function tenantConversationWrapperChrome(messages: TenantMessages) {
  return {
    chrome: tenantConversationChrome(messages),
    clearLabel: messages.conversation.clearConversation,
    submitLabel: messages.conversation.askAthena,
    emptyStateTitle: messages.conversation.tryAsking,
    readOnlyNotice: messages.conversation.readOnlyNotice,
  };
}
