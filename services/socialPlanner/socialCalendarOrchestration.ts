/**
 * Create Social Calendars with failure-safe job enqueue.
 */

import {
  createConversationRevisionSocialCalendar,
  createSocialCalendar,
  createThinkDifferentlySocialCalendar,
  markSocialCalendarEnqueueFailed,
  type SocialCalendar,
} from "@/services/socialPlanner/socialCalendarService";
import {
  tryParsePersistedSocialCalendarContext,
  tryParsePersistedSocialCalendarPackage,
} from "@/services/socialPlanner/socialCalendarPersistedPackage";
import { ThinkDifferentlySourceError } from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import { ConversationRevisionSourceError } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import type { SocialPlannerConversationRevisionContextV1 } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  ActiveSocialCalendarGenerationJobConflictError,
  enqueueSocialCalendarGenerationJob,
} from "@/services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobService";
import type { AthenaSocialCalendarGenerationJob } from "@/services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";

export { ActiveSocialCalendarGenerationJobConflictError };

export async function createSocialCalendarWithJob(input: {
  organizationId: string;
  userId: string | null;
  periodStart: string;
  periodEnd: string;
  userGuidance: string | null;
}): Promise<{
  calendar: SocialCalendar;
  job: AthenaSocialCalendarGenerationJob;
}> {
  const calendar = await createSocialCalendar({
    organizationId: input.organizationId,
    userId: input.userId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    userGuidance: input.userGuidance,
  });

  try {
    const { job } = await enqueueSocialCalendarGenerationJob({
      organizationId: input.organizationId,
      calendarId: calendar.id,
      requestedBy: input.userId,
      allowExisting: false,
    });
    return { calendar, job };
  } catch (error) {
    await markSocialCalendarEnqueueFailed({
      calendarId: calendar.id,
      organizationId: input.organizationId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to enqueue Social Calendar generation job.",
    });
    throw error;
  }
}

export function assertThinkDifferentlySourceEligible(
  source: SocialCalendar,
): void {
  if (source.status !== "Ready") {
    throw new ThinkDifferentlySourceError(
      "THINK_DIFFERENTLY_SOURCE_NOT_READY",
      "Think Differently is only available for a Ready Social Calendar.",
      409,
    );
  }
  if (!tryParsePersistedSocialCalendarPackage(source.package_json)) {
    throw new ThinkDifferentlySourceError(
      "THINK_DIFFERENTLY_SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be used as a Think Differently source.",
      400,
    );
  }
  if (!tryParsePersistedSocialCalendarContext(source.calendar_context_json)) {
    throw new ThinkDifferentlySourceError(
      "THINK_DIFFERENTLY_SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be used as a Think Differently source.",
      400,
    );
  }
}

export async function createThinkDifferentlyCalendarWithJob(input: {
  organizationId: string;
  userId: string | null;
  source: SocialCalendar;
}): Promise<{
  calendar: SocialCalendar;
  job: AthenaSocialCalendarGenerationJob;
}> {
  assertThinkDifferentlySourceEligible(input.source);

  const calendar = await createThinkDifferentlySocialCalendar({
    organizationId: input.organizationId,
    userId: input.userId,
    source: input.source,
  });

  try {
    const { job } = await enqueueSocialCalendarGenerationJob({
      organizationId: input.organizationId,
      calendarId: calendar.id,
      requestedBy: input.userId,
      allowExisting: false,
    });
    return { calendar, job };
  } catch (error) {
    await markSocialCalendarEnqueueFailed({
      calendarId: calendar.id,
      organizationId: input.organizationId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to enqueue Think Differently generation job.",
    });
    throw error;
  }
}

export function assertConversationRevisionSourceEligible(
  source: SocialCalendar,
): void {
  if (source.status !== "Ready") {
    throw new ConversationRevisionSourceError(
      "NOT_READY",
      "Apply Athena's Suggestions is only available for a Ready Social Calendar.",
      409,
    );
  }
  if (!tryParsePersistedSocialCalendarPackage(source.package_json)) {
    throw new ConversationRevisionSourceError(
      "SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be used as a conversation revision source.",
      400,
    );
  }
  if (!tryParsePersistedSocialCalendarContext(source.calendar_context_json)) {
    throw new ConversationRevisionSourceError(
      "SOURCE_PACKAGE_INVALID",
      "This Social Calendar cannot be used as a conversation revision source.",
      400,
    );
  }
}

export async function createConversationRevisionCalendarWithJob(input: {
  organizationId: string;
  userId: string | null;
  source: SocialCalendar;
  revisionContext: SocialPlannerConversationRevisionContextV1;
}): Promise<{
  calendar: SocialCalendar;
  job: AthenaSocialCalendarGenerationJob;
}> {
  assertConversationRevisionSourceEligible(input.source);

  const calendar = await createConversationRevisionSocialCalendar({
    organizationId: input.organizationId,
    userId: input.userId,
    source: input.source,
    revisionContext: input.revisionContext,
  });

  try {
    const { job } = await enqueueSocialCalendarGenerationJob({
      organizationId: input.organizationId,
      calendarId: calendar.id,
      requestedBy: input.userId,
      allowExisting: false,
    });
    return { calendar, job };
  } catch (error) {
    await markSocialCalendarEnqueueFailed({
      calendarId: calendar.id,
      organizationId: input.organizationId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to enqueue Conversation Revision generation job.",
    });
    throw error;
  }
}
