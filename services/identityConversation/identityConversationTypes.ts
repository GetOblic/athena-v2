/**
 * Identity Conversation types and context limits.
 */

import {
  ATHENA_CONVERSATION_LIMITS,
  ATHENA_CONVERSATION_MODEL,
  type AthenaConversationContextSection,
} from "@/services/athenaConversation/athenaConversationTypes";

export const IDENTITY_CONVERSATION_MODEL = ATHENA_CONVERSATION_MODEL;

export const IDENTITY_CONVERSATION_LIMITS = {
  ...ATHENA_CONVERSATION_LIMITS,
  maxVoiceChars: 8_000,
  maxBusinessKnowledgeChars: 8_000,
  maxHomepageLearningChars: 12_000,
  maxDeepWebsiteChars: 12_000,
  maxKnowledgeAssetsChars: 8_000,
  maxKnowledgeAssetCount: 20,
  maxIdentityExecutiveIntelligenceChars: 12_000,
  maxBasicIdentityChars: 2_000,
} as const;

export type IdentityConversationSourceType =
  | "BASIC_BUSINESS_IDENTITY"
  | "ORGANIZATION_VOICE"
  | "BUSINESS_KNOWLEDGE"
  | "IDENTITY_EXECUTIVE_INTELLIGENCE"
  | "HOMEPAGE_LEARNING_UNTRUSTED"
  | "DEEP_WEBSITE_INTELLIGENCE_UNTRUSTED"
  | "ORGANIZATION_KNOWLEDGE_ASSETS_UNTRUSTED";

export type IdentityConversationAssembledContext = {
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
