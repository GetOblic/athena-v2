/**
 * Calendar opportunity candidates and jurisdiction filtering.
 *
 * L2 records known candidates. It never selects creative anchors.
 * Jurisdiction holidays come from the offline date-holidays wrapper.
 */

import type { SocialPlannerGeography } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import type {
  SocialCalendarDayContext,
  SocialCalendarOpportunity,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import { collectDateHolidaysOpportunities } from "@/services/socialPlanner/calendar/dateHolidaysJurisdictionProvider";

export {
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_STATUS,
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_VERSION,
  resolveSocialCalendarHolidayCoverage,
} from "@/services/socialPlanner/calendar/dateHolidaysJurisdictionProvider";

export function opportunityAppliesToGeography(
  opportunity: SocialCalendarOpportunity,
  geography: SocialPlannerGeography,
): boolean {
  if (opportunity.scope === "global") {
    return true;
  }

  if (opportunity.scope === "hemisphere") {
    return (
      geography.hemisphere !== "unknown" &&
      opportunity.jurisdictionHemisphere === geography.hemisphere
    );
  }

  if (opportunity.scope === "country") {
    return (
      geography.countryCode != null &&
      opportunity.jurisdictionCountryCode === geography.countryCode
    );
  }

  if (opportunity.scope === "region") {
    return (
      geography.countryCode != null &&
      geography.regionCode != null &&
      opportunity.jurisdictionCountryCode === geography.countryCode &&
      opportunity.jurisdictionRegionCode === geography.regionCode
    );
  }

  return false;
}

export function filterOpportunitiesByJurisdiction(
  opportunities: readonly SocialCalendarOpportunity[],
  geography: SocialPlannerGeography,
): SocialCalendarOpportunity[] {
  return opportunities.filter((opportunity) =>
    opportunityAppliesToGeography(opportunity, geography),
  );
}

function candidate(input: {
  ruleId: string;
  label: string;
  date: string;
  category: SocialCalendarOpportunity["category"];
  scope: SocialCalendarOpportunity["scope"];
  jurisdictionCountryCode?: string | null;
  jurisdictionRegionCode?: string | null;
  jurisdictionHemisphere?: SocialCalendarOpportunity["jurisdictionHemisphere"];
}): SocialCalendarOpportunity {
  return {
    id: `${input.ruleId}:${input.date}`,
    label: input.label,
    date: input.date,
    category: input.category,
    scope: input.scope,
    jurisdictionCountryCode: input.jurisdictionCountryCode ?? null,
    jurisdictionRegionCode: input.jurisdictionRegionCode ?? null,
    jurisdictionHemisphere: input.jurisdictionHemisphere ?? null,
    selectionStatus: "candidate",
    ruleId: input.ruleId,
    observedKind: null,
    providerRule: null,
  };
}

export function collectTemporalDayOpportunities(
  day: Omit<SocialCalendarDayContext, "opportunityIds">,
): SocialCalendarOpportunity[] {
  const opportunities: SocialCalendarOpportunity[] = [];

  for (const semantic of day.daySemantics) {
    if (semantic === "start_of_workweek") {
      opportunities.push(
        candidate({
          ruleId: "temporal.weekday.monday_start_of_workweek",
          label: "Monday / start of workweek",
          date: day.date,
          category: "temporal_day_of_week",
          scope: "global",
        }),
      );
    }
    if (semantic === "midweek") {
      opportunities.push(
        candidate({
          ruleId: "temporal.weekday.wednesday_midweek",
          label: "Wednesday / midweek",
          date: day.date,
          category: "temporal_day_of_week",
          scope: "global",
        }),
      );
    }
    if (semantic === "end_of_workweek") {
      opportunities.push(
        candidate({
          ruleId: "temporal.weekday.friday_end_of_workweek",
          label: "Friday / end of workweek",
          date: day.date,
          category: "temporal_day_of_week",
          scope: "global",
        }),
      );
    }
    if (semantic === "weekend") {
      opportunities.push(
        candidate({
          ruleId: "temporal.weekday.weekend",
          label: day.dayOfWeek === "Sunday" ? "Sunday / weekend" : "Saturday / weekend",
          date: day.date,
          category: "temporal_day_of_week",
          scope: "global",
        }),
      );
    }
  }

  return opportunities;
}

export function collectPeriodBoundaryOpportunities(
  day: Omit<SocialCalendarDayContext, "opportunityIds">,
): SocialCalendarOpportunity[] {
  const opportunities: SocialCalendarOpportunity[] = [];

  if (day.isStartOfMonth) {
    opportunities.push(
      candidate({
        ruleId: "temporal.boundary.start_of_month",
        label: "Start of month",
        date: day.date,
        category: "temporal_period_boundary",
        scope: "global",
      }),
    );
  }
  if (day.isEndOfMonth) {
    opportunities.push(
      candidate({
        ruleId: "temporal.boundary.end_of_month",
        label: "End of month",
        date: day.date,
        category: "temporal_period_boundary",
        scope: "global",
      }),
    );
  }
  if (day.isStartOfQuarter) {
    opportunities.push(
      candidate({
        ruleId: "temporal.boundary.start_of_quarter",
        label: "Start of quarter",
        date: day.date,
        category: "temporal_period_boundary",
        scope: "global",
      }),
    );
  }
  if (day.isEndOfQuarter) {
    opportunities.push(
      candidate({
        ruleId: "temporal.boundary.end_of_quarter",
        label: "End of quarter",
        date: day.date,
        category: "temporal_period_boundary",
        scope: "global",
      }),
    );
  }
  if (day.isStartOfYear) {
    opportunities.push(
      candidate({
        ruleId: "temporal.boundary.start_of_year",
        label: "Start of year",
        date: day.date,
        category: "temporal_period_boundary",
        scope: "global",
      }),
    );
  }
  if (day.isEndOfYear) {
    opportunities.push(
      candidate({
        ruleId: "temporal.boundary.end_of_year",
        label: "End of year",
        date: day.date,
        category: "temporal_period_boundary",
        scope: "global",
      }),
    );
  }

  return opportunities;
}

export function collectSeasonalOpportunities(
  day: Omit<SocialCalendarDayContext, "opportunityIds">,
  geography: SocialPlannerGeography,
): SocialCalendarOpportunity[] {
  if (!day.season || geography.hemisphere === "unknown") {
    return [];
  }

  return [
    candidate({
      ruleId: `seasonal.meteorological.${day.season}`,
      label: `${day.season[0].toUpperCase()}${day.season.slice(1)}`,
      date: day.date,
      category: "seasonal_event",
      scope: "hemisphere",
      jurisdictionHemisphere: geography.hemisphere,
    }),
  ];
}

/**
 * Jurisdiction-aware public holidays / observances from date-holidays.
 * Unknown geography returns no country holidays and does not assume US.
 */
export function collectJurisdictionHolidays(
  dates: readonly string[],
  geography: SocialPlannerGeography,
): SocialCalendarOpportunity[] {
  return collectDateHolidaysOpportunities(dates, geography);
}

export function collectSocialCalendarOpportunities(input: {
  days: Array<Omit<SocialCalendarDayContext, "opportunityIds">>;
  geography: SocialPlannerGeography;
}): SocialCalendarOpportunity[] {
  const collected: SocialCalendarOpportunity[] = [];

  for (const day of input.days) {
    collected.push(...collectTemporalDayOpportunities(day));
    collected.push(...collectPeriodBoundaryOpportunities(day));
    collected.push(...collectSeasonalOpportunities(day, input.geography));
  }

  collected.push(
    ...collectJurisdictionHolidays(
      input.days.map((day) => day.date),
      input.geography,
    ),
  );

  const filtered = filterOpportunitiesByJurisdiction(collected, input.geography);
  return filtered.sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return left.id.localeCompare(right.id);
  });
}
