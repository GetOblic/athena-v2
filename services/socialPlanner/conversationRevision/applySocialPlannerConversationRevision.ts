/**
 * Apply Athena's Suggestions — freeze revision context and enqueue a derivative.
 */

import { composeSocialPlannerRevisionBrief } from "@/services/socialPlanner/conversationRevision/composeSocialPlannerRevisionBrief";
import { ConversationRevisionSourceError } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import { SocialPlannerConversationError } from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";
import { listSocialPlannerConversationMessages } from "@/services/socialPlanner/conversation/socialPlannerMessageService";
import { createConversationRevisionCalendarWithJob } from "@/services/socialPlanner/socialCalendarOrchestration";
import {
  tryParsePersistedSocialCalendarContext,
  tryParsePersistedSocialCalendarPackage,
} from "@/services/socialPlanner/socialCalendarPersistedPackage";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";
import type { SocialCalendar } from "@/services/socialPlanner/socialCalendarTypes";
import type { AthenaSocialCalendarGenerationJob } from "@/services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { SocialPlannerRevisionBriefError } from "@/services/socialPlanner/conversationRevision/validateSocialPlannerRevisionBrief";
import { generateReview } from "@/services/aiService";

export type ApplySocialPlannerConversationRevisionDeps = {
  getCalendar?: typeof getSocialCalendarById;
  listMessages?: typeof listSocialPlannerConversationMessages;
  composeBrief?: typeof composeSocialPlannerRevisionBrief;
  createDerivative?: typeof createConversationRevisionCalendarWithJob;
  generateReview?: typeof generateReview;
};

export async function applySocialPlannerConversationRevision(input: {
  organizationId: string;
  userId: string | null;
  calendarId: string;
  deps?: ApplySocialPlannerConversationRevisionDeps;
}): Promise<{
  calendar: SocialCalendar;
  job: AthenaSocialCalendarGenerationJob;
}> {
  const getCalendar = input.deps?.getCalendar ?? getSocialCalendarById;
  const listMessages =
    input.deps?.listMessages ?? listSocialPlannerConversationMessages;
  const composeBrief =
    input.deps?.composeBrief ?? composeSocialPlannerRevisionBrief;
  const createDerivative =
    input.deps?.createDerivative ?? createConversationRevisionCalendarWithJob;

  const source = await getCalendar(input.calendarId, input.organizationId);
  if (!source) {
    throw new SocialPlannerConversationError(
      "NOT_FOUND",
      "Social Calendar not found.",
      404,
    );
  }

  const socialPackage = tryParsePersistedSocialCalendarPackage(source.package_json);
  const calendarContext = tryParsePersistedSocialCalendarContext(
    source.calendar_context_json,
  );
  if (source.status !== "Ready") {
    throw new ConversationRevisionSourceError(
      "NOT_READY",
      "Apply Athena's Suggestions is only available for a Ready Social Calendar.",
      409,
    );
  }
  if (!socialPackage || !calendarContext) {
    throw new ConversationRevisionSourceError(
      "SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be used as a conversation revision source.",
      400,
    );
  }

  const messages = await listMessages({
    organizationId: input.organizationId,
    socialCalendarId: source.id,
  });
  if (messages.length === 0) {
    throw new ConversationRevisionSourceError(
      "NO_MESSAGES",
      "Ask Athena about this calendar before applying suggestions.",
      409,
    );
  }

  let revisionContext;
  try {
    revisionContext = await composeBrief({
      sourceCalendarId: source.id,
      sourcePackage: socialPackage,
      messages,
      deps: input.deps?.generateReview
        ? { generateReview: input.deps.generateReview }
        : undefined,
    });
  } catch (error) {
    if (error instanceof SocialPlannerRevisionBriefError) {
      throw new ConversationRevisionSourceError(
        "NO_ACTIONABLE_REVISION",
        error.message,
        409,
      );
    }
    throw error;
  }

  if (!revisionContext.brief.actionable) {
    throw new ConversationRevisionSourceError(
      "NO_ACTIONABLE_REVISION",
      "This conversation does not contain an actionable revision.",
      409,
    );
  }

  return createDerivative({
    organizationId: input.organizationId,
    userId: input.userId,
    source,
    revisionContext,
  });
}
