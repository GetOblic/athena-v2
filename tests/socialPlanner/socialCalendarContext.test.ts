import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeSocialCalendarContext } from "../../services/socialPlanner/calendar/composeSocialCalendarContext";
import {
  SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION,
  SOCIAL_CALENDAR_RESOLVER_VERSION,
  SocialCalendarContextError,
  type SocialCalendarOpportunity,
} from "../../services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  collectJurisdictionHolidays,
  filterOpportunitiesByJurisdiction,
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_STATUS,
} from "../../services/socialPlanner/calendar/socialCalendarOpportunities";
import { validateSocialCalendarContext } from "../../services/socialPlanner/calendar/validateSocialCalendarContext";
import {
  SocialCalendarPeriodError,
  parseSocialCalendarDate,
} from "../../services/socialPlanner/socialCalendarTypes";
import { SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY } from "../../services/socialPlanner/geography/socialPlannerGeographyTypes";

function opportunityIdsOn(
  context: ReturnType<typeof composeSocialCalendarContext>,
  date: string,
): string[] {
  return context.opportunities
    .filter((opportunity) => opportunity.date === date)
    .map((opportunity) => opportunity.id);
}

function usScopedOpportunity(date: string, ruleId: string, label: string): SocialCalendarOpportunity {
  return {
    id: `${ruleId}:${date}`,
    label,
    date,
    category: "public_holiday",
    scope: "country",
    jurisdictionCountryCode: "US",
    jurisdictionRegionCode: null,
    jurisdictionHemisphere: null,
    selectionStatus: "candidate",
    ruleId,
    observedKind: "actual",
    providerRule: "test.fixture",
  };
}

describe("Social Planner L2 calendar context", () => {
  it("resolves exactly seven ordered dates for a selected period", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-08-19",
      periodEnd: "2026-08-25",
    });

    assert.equal(context.schemaVersion, SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION);
    assert.deepEqual(context.period.dates, [
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
    assert.equal(context.dayContexts.length, 7);
    assert.deepEqual(
      context.dayContexts.map((day) => day.date),
      context.period.dates,
    );
    assert.deepEqual(
      context.dayContexts.map((day) => day.positionInSelectedWeek),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(context.provenance.resolverVersion, SOCIAL_CALENDAR_RESOLVER_VERSION);
    assert.equal(context.provenance.holidayCoverage, "none");
    assert.equal(context.provenance.holidayProvider, "date-holidays");
    assert.equal(typeof context.provenance.holidayProviderVersion, "string");
    assert.ok(context.provenance.holidayProviderVersion.length > 0);
  });

  it("calculates Sunday Monday Wednesday Friday Saturday week semantics", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-08-16",
      periodEnd: "2026-08-22",
    });

    const byDate = Object.fromEntries(
      context.dayContexts.map((day) => [day.date, day]),
    );

    assert.equal(byDate["2026-08-16"]?.dayOfWeek, "Sunday");
    assert.equal(byDate["2026-08-16"]?.isoWeekday, 7);
    assert.equal(byDate["2026-08-16"]?.isWeekend, true);
    assert.deepEqual(byDate["2026-08-16"]?.daySemantics, ["weekend"]);

    assert.equal(byDate["2026-08-17"]?.dayOfWeek, "Monday");
    assert.equal(byDate["2026-08-17"]?.isoWeekday, 1);
    assert.deepEqual(byDate["2026-08-17"]?.daySemantics, ["start_of_workweek"]);
    assert.ok(
      opportunityIdsOn(context, "2026-08-17").includes(
        "temporal.weekday.monday_start_of_workweek:2026-08-17",
      ),
    );

    assert.equal(byDate["2026-08-19"]?.dayOfWeek, "Wednesday");
    assert.deepEqual(byDate["2026-08-19"]?.daySemantics, ["midweek"]);
    assert.equal(byDate["2026-08-19"]?.selectedWeekPosition, "middle");

    assert.equal(byDate["2026-08-21"]?.dayOfWeek, "Friday");
    assert.deepEqual(byDate["2026-08-21"]?.daySemantics, ["end_of_workweek"]);

    assert.equal(byDate["2026-08-22"]?.dayOfWeek, "Saturday");
    assert.equal(byDate["2026-08-22"]?.isWeekend, true);
    assert.deepEqual(byDate["2026-08-22"]?.daySemantics, ["weekend"]);
    assert.equal(byDate["2026-08-22"]?.selectedWeekPosition, "end");
  });

  it("marks month-boundary days across an end/start-of-month span", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-07-26",
      periodEnd: "2026-08-01",
    });
    const jul31 = context.dayContexts.find((day) => day.date === "2026-07-31");
    const aug1 = context.dayContexts.find((day) => day.date === "2026-08-01");

    assert.equal(jul31?.isEndOfMonth, true);
    assert.equal(jul31?.month, 7);
    assert.equal(aug1?.isStartOfMonth, true);
    assert.equal(aug1?.month, 8);
    assert.ok(
      opportunityIdsOn(context, "2026-07-31").includes(
        "temporal.boundary.end_of_month:2026-07-31",
      ),
    );
    assert.ok(
      opportunityIdsOn(context, "2026-08-01").includes(
        "temporal.boundary.start_of_month:2026-08-01",
      ),
    );
  });

  it("marks quarter-boundary days", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-03-29",
      periodEnd: "2026-04-04",
    });
    const mar31 = context.dayContexts.find((day) => day.date === "2026-03-31");
    const apr1 = context.dayContexts.find((day) => day.date === "2026-04-01");

    assert.equal(mar31?.quarter, 1);
    assert.equal(mar31?.isEndOfQuarter, true);
    assert.equal(mar31?.isEndOfMonth, true);
    assert.equal(apr1?.quarter, 2);
    assert.equal(apr1?.isStartOfQuarter, true);
    assert.equal(apr1?.isStartOfMonth, true);
  });

  it("marks year-boundary days across Dec 31 / Jan 1", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-12-28",
      periodEnd: "2027-01-03",
    });
    const dec31 = context.dayContexts.find((day) => day.date === "2026-12-31");
    const jan1 = context.dayContexts.find((day) => day.date === "2027-01-01");

    assert.equal(dec31?.isEndOfYear, true);
    assert.equal(dec31?.isEndOfQuarter, true);
    assert.equal(dec31?.year, 2026);
    assert.equal(jan1?.isStartOfYear, true);
    assert.equal(jan1?.isStartOfQuarter, true);
    assert.equal(jan1?.year, 2027);
  });

  it("keeps leap-year Feb 29 as a real calendar date", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2024-02-26",
      periodEnd: "2024-03-03",
    });
    assert.ok(context.period.dates.includes("2024-02-29"));
    const leap = context.dayContexts.find((day) => day.date === "2024-02-29");
    assert.equal(leap?.month, 2);
    assert.equal(leap?.dayOfWeek, "Thursday");
    assert.equal(parseSocialCalendarDate("2024-02-29"), "2024-02-29");
    assert.throws(
      () => parseSocialCalendarDate("2023-02-29"),
      SocialCalendarPeriodError,
    );
  });

  it("resolves northern-hemisphere summer for a July week in France", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-07-06",
      periodEnd: "2026-07-12",
      geographyEvidence: { executiveGeographicReach: "France" },
    });
    assert.equal(context.geography.hemisphere, "northern");
    assert.ok(context.dayContexts.every((day) => day.season === "summer"));
    assert.ok(
      context.opportunities.some(
        (opportunity) =>
          opportunity.ruleId === "seasonal.meteorological.summer" &&
          opportunity.scope === "hemisphere" &&
          opportunity.jurisdictionHemisphere === "northern",
      ),
    );
  });

  it("resolves the opposite southern-hemisphere season for Australia", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-07-06",
      periodEnd: "2026-07-12",
      geographyEvidence: { structuredCountry: "Australia" },
    });
    assert.equal(context.geography.hemisphere, "southern");
    assert.ok(context.dayContexts.every((day) => day.season === "winter"));
    assert.ok(
      context.opportunities.some(
        (opportunity) =>
          opportunity.ruleId === "seasonal.meteorological.winter" &&
          opportunity.jurisdictionHemisphere === "southern",
      ),
    );
  });

  it("keeps unknown geography valid and does not fall back to the United States", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
    });

    assert.deepEqual(context.geography, SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY);
    assert.ok(context.dayContexts.every((day) => day.season === null));
    assert.equal(
      context.opportunities.some(
        (opportunity) =>
          opportunity.jurisdictionCountryCode === "US" ||
          opportunity.scope === "country",
      ),
      false,
    );
    assert.equal(
      context.opportunities.some((opportunity) => opportunity.scope === "hemisphere"),
      false,
    );
  });

  it("does not leak US-scoped opportunities into a non-US or unknown jurisdiction", () => {
    const france = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "France" },
    });
    const unknown = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
    });
    const us = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "United States" },
    });

    const fixtures = [
      usScopedOpportunity("2026-06-19", "test.public_holiday.juneteenth", "Juneteenth"),
      usScopedOpportunity("2026-04-15", "test.commercial.tax_day", "US Tax Day"),
    ];

    assert.deepEqual(filterOpportunitiesByJurisdiction(fixtures, france.geography), []);
    assert.deepEqual(filterOpportunitiesByJurisdiction(fixtures, unknown.geography), []);
    assert.deepEqual(
      filterOpportunitiesByJurisdiction(
        [usScopedOpportunity("2026-06-19", "test.public_holiday.juneteenth", "Juneteenth")],
        us.geography,
      ).map((opportunity) => opportunity.ruleId),
      ["test.public_holiday.juneteenth"],
    );

    assert.equal(SOCIAL_CALENDAR_HOLIDAY_PROVIDER_STATUS, "date_holidays");
    assert.deepEqual(
      collectJurisdictionHolidays(france.period.dates, france.geography),
      [],
    );
    assert.equal(
      france.opportunities.some((opportunity) =>
        /juneteenth|tax.?day|memorial|independence/i.test(opportunity.id),
      ),
      false,
    );
  });

  it("allows multiple candidate opportunities to coexist on one date", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-07-26",
      periodEnd: "2026-08-01",
      geographyEvidence: { structuredCountry: "France" },
    });
    const friday = context.dayContexts.find((day) => day.date === "2026-07-31");
    const ids = friday?.opportunityIds ?? [];

    assert.equal(friday?.dayOfWeek, "Friday");
    assert.equal(friday?.isEndOfMonth, true);
    assert.ok(ids.includes("temporal.weekday.friday_end_of_workweek:2026-07-31"));
    assert.ok(ids.includes("temporal.boundary.end_of_month:2026-07-31"));
    assert.ok(ids.includes("seasonal.meteorological.summer:2026-07-31"));
    assert.ok((friday?.opportunityIds.length ?? 0) >= 3);
    assert.ok(context.opportunities.every((opportunity) => opportunity.selectionStatus === "candidate"));
  });

  it("rejects a context that would attach a foreign-jurisdiction opportunity", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "France" },
    });
    const leaked: typeof context = {
      ...context,
      opportunities: [
        ...context.opportunities,
        usScopedOpportunity("2026-06-19", "test.public_holiday.juneteenth", "Juneteenth"),
      ],
    };

    assert.throws(
      () => validateSocialCalendarContext(leaked),
      SocialCalendarContextError,
    );
  });
});
