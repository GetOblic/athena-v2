/**
 * Compose the versioned Social Calendar Context from a seven-date period
 * and trusted organization geography evidence.
 *
 * No persistence, API, worker, or LLM. Returns a frozen-ready object.
 */

import { normalizeSocialCalendarPeriod } from "@/services/socialPlanner/socialCalendarTypes";
import { resolveSocialPlannerGeography } from "@/services/socialPlanner/geography/resolveSocialPlannerGeography";
import type { SocialPlannerGeographyEvidence } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import {
  SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION,
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME,
  SOCIAL_CALENDAR_RESOLVER_VERSION,
  type SocialCalendarContext,
  type SocialCalendarDayContext,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  collectSocialCalendarOpportunities,
  resolveSocialCalendarHolidayCoverage,
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_VERSION,
} from "@/services/socialPlanner/calendar/socialCalendarOpportunities";
import {
  buildSocialCalendarDayContext,
  listSocialCalendarPeriodDates,
} from "@/services/socialPlanner/calendar/socialCalendarTemporal";
import { validateSocialCalendarContext } from "@/services/socialPlanner/calendar/validateSocialCalendarContext";

export type ComposeSocialCalendarContextInput = {
  periodStart: string;
  periodEnd: string;
  geographyEvidence?: SocialPlannerGeographyEvidence;
};

export function composeSocialCalendarContext(
  input: ComposeSocialCalendarContextInput,
): SocialCalendarContext {
  const period = normalizeSocialCalendarPeriod(input.periodStart, input.periodEnd);
  const dates = listSocialCalendarPeriodDates(period.periodStart, period.periodEnd);
  const geography = resolveSocialPlannerGeography(input.geographyEvidence ?? {});

  const dayBases = dates.map((date, index) =>
    buildSocialCalendarDayContext({
      date,
      positionInSelectedWeek: index + 1,
      hemisphere: geography.hemisphere,
    }),
  );

  const opportunities = collectSocialCalendarOpportunities({
    days: dayBases,
    geography,
  });

  const dayContexts: SocialCalendarDayContext[] = dayBases.map((day) => ({
    ...day,
    opportunityIds: opportunities
      .filter((opportunity) => opportunity.date === day.date)
      .map((opportunity) => opportunity.id),
  }));

  const opportunityRuleIds = Array.from(
    new Set(opportunities.map((opportunity) => opportunity.ruleId)),
  ).sort((left, right) => left.localeCompare(right));

  const context: SocialCalendarContext = {
    schemaVersion: SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION,
    geography,
    period: {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dates,
    },
    dayContexts,
    opportunities,
    provenance: {
      resolverVersion: SOCIAL_CALENDAR_RESOLVER_VERSION,
      schemaVersion: SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION,
      holidayCoverage: resolveSocialCalendarHolidayCoverage(geography),
      holidayProvider: SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME,
      holidayProviderVersion: SOCIAL_CALENDAR_HOLIDAY_PROVIDER_VERSION,
      geographySource: geography.source,
      opportunityRuleIds,
    },
  };

  return validateSocialCalendarContext(context);
}
