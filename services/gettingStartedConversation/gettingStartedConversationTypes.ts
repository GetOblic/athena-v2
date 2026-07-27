/**
 * Getting Started Conversation types and context limits.
 */

import {
  ATHENA_CONVERSATION_LIMITS,
  ATHENA_CONVERSATION_MODEL,
  type AthenaConversationContextSection,
} from "@/services/athenaConversation/athenaConversationTypes";

export const GETTING_STARTED_CONVERSATION_MODEL = ATHENA_CONVERSATION_MODEL;

export const GETTING_STARTED_CONVERSATION_LIMITS = {
  ...ATHENA_CONVERSATION_LIMITS,
  maxProductContextChars: 20_000,
} as const;

export type GettingStartedConversationAssembledContext = {
  sections: AthenaConversationContextSection[];
  missingNotes: string[];
};

export {
  ATHENA_REQUEST_ID_HEADER,
  AthenaConversationError,
  type AthenaConversationFailureResult,
  type AthenaConversationHistoryMessage,
  type AthenaConversationRequest,
  type AthenaConversationResult,
  type AthenaConversationSuccessResult,
} from "@/services/athenaConversation/athenaConversationTypes";
