import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { composeSocialCalendarContext } from "../../services/socialPlanner/calendar/composeSocialCalendarContext";
import {
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME,
  SOCIAL_CALENDAR_RESOLVER_VERSION,
  SocialCalendarContextError,
  type SocialCalendarOpportunity,
} from "../../services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  collectJurisdictionHolidays,
  filterOpportunitiesByJurisdiction,
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_STATUS,
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_VERSION,
  resolveSocialCalendarHolidayCoverage,
} from "../../services/socialPlanner/calendar/socialCalendarOpportunities";
import { validateSocialCalendarContext } from "../../services/socialPlanner/calendar/validateSocialCalendarContext";
import {
  SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY,
  type SocialPlannerGeography,
} from "../../services/socialPlanner/geography/socialPlannerGeographyTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function installedHolidayProviderVersion(): string {
  const pkg = JSON.parse(
    read("node_modules/date-holidays/package.json"),
  ) as { version: string };
  return pkg.version;
}

function countryGeography(
  country: string,
  countryCode: string,
  overrides: Partial<SocialPlannerGeography> = {},
): SocialPlannerGeography {
  return {
    ...SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY,
    status: "resolved",
    country,
    countryCode,
    hemisphere: "northern",
    source: "structured_country",
    confidence: "high",
    ...overrides,
  };
}

function holidayOpportunities(
  opportunities: readonly SocialCalendarOpportunity[],
): SocialCalendarOpportunity[] {
  return opportunities.filter((opportunity) =>
    opportunity.ruleId.startsWith("holiday.date_holidays."),
  );
}

function findHoliday(
  opportunities: readonly SocialCalendarOpportunity[],
  matcher: RegExp,
): SocialCalendarOpportunity | undefined {
  return holidayOpportunities(opportunities).find(
    (opportunity) =>
      matcher.test(opportunity.label) || matcher.test(opportunity.id),
  );
}

describe("Social Planner L2B jurisdiction holiday provider", () => {
  it("records the installed date-holidays version and stays offline on bundled data", () => {
    assert.equal(SOCIAL_CALENDAR_HOLIDAY_PROVIDER_STATUS, "date_holidays");
    assert.equal(SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME, "date-holidays");
    assert.equal(
      SOCIAL_CALENDAR_HOLIDAY_PROVIDER_VERSION,
      installedHolidayProviderVersion(),
    );
    assert.equal(SOCIAL_CALENDAR_RESOLVER_VERSION, "social_planner_l2b_v1");

    const providerSource = read(
      "services/socialPlanner/calendar/dateHolidaysJurisdictionProvider.ts",
    );
    assert.match(providerSource, /from "date-holidays"/);
    assert.doesNotMatch(providerSource, /\bfetch\s*\(/);
    assert.doesNotMatch(providerSource, /https?:\/\//);
    assert.doesNotMatch(providerSource, /calendarific|nager\.date|googleapis/i);

    const holidaysRuntime = read("node_modules/date-holidays/src/Holidays.js");
    assert.match(holidaysRuntime, /import \{ data \} from '\.\/data\.js'/);
    assert.equal(existsSync(join(ROOT, "node_modules/date-holidays/data/holidays.json")), true);
    assert.doesNotMatch(holidaysRuntime, /\bfetch\s*\(/);
  });

  it("returns no country holidays for unknown geography and does not assume the United States", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
    });

    assert.deepEqual(context.geography, SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY);
    assert.equal(context.provenance.holidayCoverage, "none");
    assert.equal(context.provenance.holidayProvider, "date-holidays");
    assert.equal(
      context.provenance.holidayProviderVersion,
      SOCIAL_CALENDAR_HOLIDAY_PROVIDER_VERSION,
    );
    assert.deepEqual(
      collectJurisdictionHolidays(context.period.dates, context.geography),
      [],
    );
    assert.equal(holidayOpportunities(context.opportunities).length, 0);
    assert.equal(
      context.opportunities.some((opportunity) => opportunity.scope === "country"),
      false,
    );
  });

  it("includes Juneteenth for the United States on the provider date", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "United States" },
    });

    const juneteenth = findHoliday(context.opportunities, /juneteenth/i);
    assert.ok(juneteenth);
    assert.equal(juneteenth.date, "2026-06-19");
    assert.equal(juneteenth.category, "public_holiday");
    assert.equal(juneteenth.scope, "country");
    assert.equal(juneteenth.jurisdictionCountryCode, "US");
    assert.equal(juneteenth.jurisdictionRegionCode, null);
    assert.equal(juneteenth.selectionStatus, "candidate");
    assert.equal(juneteenth.observedKind, "actual");
    assert.ok(juneteenth.providerRule);
    assert.equal(context.provenance.holidayCoverage, "country");
    assert.ok(
      context.dayContexts
        .find((day) => day.date === "2026-06-19")
        ?.opportunityIds.includes(juneteenth.id),
    );
  });

  it("includes Bastille Day for France and does not attach Juneteenth", () => {
    const franceWeek = composeSocialCalendarContext({
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
      geographyEvidence: { structuredCountry: "France" },
    });
    const franceJuneteenthWeek = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "France" },
    });

    const bastille = findHoliday(franceWeek.opportunities, /bastille/i);
    assert.ok(bastille);
    assert.equal(bastille.date, "2026-07-14");
    assert.equal(bastille.category, "public_holiday");
    assert.equal(bastille.jurisdictionCountryCode, "FR");
    assert.equal(bastille.selectionStatus, "candidate");
    assert.match(bastille.label, /Bastille Day/);

    assert.equal(
      findHoliday(franceJuneteenthWeek.opportunities, /juneteenth/i),
      undefined,
    );
    assert.equal(
      holidayOpportunities(franceJuneteenthWeek.opportunities).some(
        (opportunity) => opportunity.jurisdictionCountryCode === "US",
      ),
      false,
    );
  });

  it("resolves Canada Day without leaking US Independence Day", () => {
    const canada = composeSocialCalendarContext({
      periodStart: "2026-06-29",
      periodEnd: "2026-07-05",
      geographyEvidence: { structuredCountry: "Canada" },
    });
    const unitedStates = composeSocialCalendarContext({
      periodStart: "2026-06-29",
      periodEnd: "2026-07-05",
      geographyEvidence: { structuredCountry: "United States" },
    });

    const canadaDay = findHoliday(canada.opportunities, /canada day/i);
    assert.ok(canadaDay);
    assert.equal(canadaDay.date, "2026-07-01");
    assert.equal(canadaDay.jurisdictionCountryCode, "CA");
    assert.equal(findHoliday(canada.opportunities, /independence day/i), undefined);

    assert.ok(findHoliday(unitedStates.opportunities, /independence day/i));
    assert.equal(findHoliday(unitedStates.opportunities, /canada day/i), undefined);
  });

  it("uses the provider for movable Thanksgiving and Easter Monday dates", () => {
    const thanksgiving = composeSocialCalendarContext({
      periodStart: "2026-11-22",
      periodEnd: "2026-11-28",
      geographyEvidence: { structuredCountry: "United States" },
    });
    const easter = composeSocialCalendarContext({
      periodStart: "2026-04-05",
      periodEnd: "2026-04-11",
      geographyEvidence: { structuredCountry: "France" },
    });

    const usThanksgiving = thanksgiving.opportunities.find(
      (opportunity) => opportunity.label === "Thanksgiving Day",
    );
    assert.ok(usThanksgiving);
    assert.equal(usThanksgiving.date, "2026-11-26");
    assert.equal(usThanksgiving.providerRule, "4th thursday in November");
    assert.equal(usThanksgiving.selectionStatus, "candidate");

    const easterMonday = findHoliday(easter.opportunities, /easter monday/i);
    assert.ok(easterMonday);
    assert.equal(easterMonday.date, "2026-04-06");
    assert.equal(easterMonday.providerRule, "easter 1");
    assert.equal(easterMonday.category, "public_holiday");
  });

  it("keeps Independence Day and its substitute day as distinct candidates", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-06-29",
      periodEnd: "2026-07-05",
      geographyEvidence: { structuredCountry: "United States" },
    });

    const actual = context.opportunities.find(
      (opportunity) =>
        opportunity.date === "2026-07-04" &&
        /independence day/i.test(opportunity.label) &&
        opportunity.observedKind === "actual",
    );
    const substitute = context.opportunities.find(
      (opportunity) =>
        opportunity.date === "2026-07-03" &&
        /independence day/i.test(opportunity.label) &&
        opportunity.observedKind === "substitute",
    );

    assert.ok(actual);
    assert.ok(substitute);
    assert.notEqual(actual.id, substitute.id);
    assert.notEqual(actual.ruleId, substitute.ruleId);
    assert.match(substitute.ruleId, /\.substitute$/);
    assert.equal(actual.selectionStatus, "candidate");
    assert.equal(substitute.selectionStatus, "candidate");
  });

  it("admits only provider holidays that fall inside the selected seven dates", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-11-22",
      periodEnd: "2026-11-28",
      geographyEvidence: { structuredCountry: "United States" },
    });

    assert.ok(findHoliday(context.opportunities, /thanksgiving/i));
    assert.equal(findHoliday(context.opportunities, /veterans/i), undefined);
    assert.equal(
      holidayOpportunities(context.opportunities).every((opportunity) =>
        context.period.dates.includes(opportunity.date),
      ),
      true,
    );
    assert.equal(
      context.opportunities.some((opportunity) => /black friday|cyber monday/i.test(opportunity.label)),
      false,
    );
  });

  it("lets a provider holiday coexist with weekday and season candidates", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-06-29",
      periodEnd: "2026-07-05",
      geographyEvidence: { structuredCountry: "United States" },
    });
    const friday = context.dayContexts.find((day) => day.date === "2026-07-03");
    const ids = friday?.opportunityIds ?? [];

    assert.equal(friday?.dayOfWeek, "Friday");
    assert.ok(ids.includes("temporal.weekday.friday_end_of_workweek:2026-07-03"));
    assert.ok(ids.some((id) => /independence/i.test(id)));
    assert.ok(ids.includes("seasonal.meteorological.summer:2026-07-03"));
    assert.ok(context.opportunities.every((opportunity) => opportunity.selectionStatus === "candidate"));
  });

  it("freezes provider identity and version in Calendar Context provenance", () => {
    const context = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "United States" },
    });
    const juneteenth = findHoliday(context.opportunities, /juneteenth/i);

    assert.ok(juneteenth);
    assert.match(juneteenth.ruleId, /^holiday\.date_holidays\.US\.public\./);
    assert.equal(context.provenance.holidayProvider, "date-holidays");
    assert.equal(
      context.provenance.holidayProviderVersion,
      installedHolidayProviderVersion(),
    );
    assert.equal(context.provenance.resolverVersion, "social_planner_l2b_v1");
    assert.ok(context.provenance.opportunityRuleIds.includes(juneteenth.ruleId));
  });

  it("does not emit subdivision holidays unless a matching region code is present", () => {
    const usCountry = composeSocialCalendarContext({
      periodStart: "2026-03-29",
      periodEnd: "2026-04-04",
      geographyEvidence: { structuredCountry: "United States" },
    });
    const california = countryGeography("United States", "US", {
      region: "California",
      regionCode: "CA",
      status: "partially_resolved",
    });
    const californiaHolidays = collectJurisdictionHolidays(
      usCountry.period.dates,
      california,
    );

    assert.equal(findHoliday(usCountry.opportunities, /c[eé]sar ch[aá]vez/i), undefined);
    const chavez = findHoliday(californiaHolidays, /c[eé]sar ch[aá]vez/i);
    assert.ok(chavez);
    assert.equal(chavez.scope, "region");
    assert.equal(chavez.jurisdictionCountryCode, "US");
    assert.equal(chavez.jurisdictionRegionCode, "CA");
    assert.equal(chavez.date, "2026-03-31");
    assert.deepEqual(
      filterOpportunitiesByJurisdiction([chavez], usCountry.geography),
      [],
    );
  });

  it("rejects injected foreign-jurisdiction and unmatched-region holidays", () => {
    const france = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "France" },
    });
    const unitedStates = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "United States" },
    });

    const leakedUs: typeof france = {
      ...france,
      opportunities: [
        ...france.opportunities,
        {
          id: "holiday.date_holidays.US.public.juneteenth:2026-06-19",
          label: "Juneteenth",
          date: "2026-06-19",
          category: "public_holiday",
          scope: "country",
          jurisdictionCountryCode: "US",
          jurisdictionRegionCode: null,
          jurisdictionHemisphere: null,
          selectionStatus: "candidate",
          ruleId: "holiday.date_holidays.US.public.juneteenth",
          observedKind: "actual",
          providerRule: "06-19",
        },
      ],
    };
    const leakedRegion: typeof unitedStates = {
      ...unitedStates,
      opportunities: [
        ...unitedStates.opportunities,
        {
          id: "holiday.date_holidays.US.CA.public.cesar_chavez_day:2026-06-19",
          label: "César Chávez Day",
          date: "2026-06-19",
          category: "public_holiday",
          scope: "region",
          jurisdictionCountryCode: "US",
          jurisdictionRegionCode: "CA",
          jurisdictionHemisphere: null,
          selectionStatus: "candidate",
          ruleId: "holiday.date_holidays.US.CA.public.cesar_chavez_day",
          observedKind: "actual",
          providerRule: "03-31",
        },
      ],
    };

    assert.throws(
      () => validateSocialCalendarContext(leakedUs),
      SocialCalendarContextError,
    );
    assert.throws(
      () => validateSocialCalendarContext(leakedRegion),
      SocialCalendarContextError,
    );
  });

  it("reports unsupported_country when the provider does not recognize the code", () => {
    const geography = countryGeography("Unknownland", "ZZ");
    const dates = [
      "2026-06-14",
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
    ];

    assert.equal(resolveSocialCalendarHolidayCoverage(geography), "unsupported_country");
    assert.deepEqual(collectJurisdictionHolidays(dates, geography), []);

    const context = composeSocialCalendarContext({
      periodStart: "2026-06-14",
      periodEnd: "2026-06-20",
      geographyEvidence: { structuredCountry: "United States" },
    });
    const unsupported: typeof context = {
      ...context,
      geography,
      opportunities: context.opportunities.filter(
        (opportunity) => opportunity.scope !== "country" && opportunity.scope !== "region",
      ),
      dayContexts: context.dayContexts.map((day) => ({
        ...day,
        opportunityIds: day.opportunityIds.filter((id) => !id.startsWith("holiday.")),
      })),
      provenance: {
        ...context.provenance,
        holidayCoverage: "unsupported_country",
        opportunityRuleIds: context.provenance.opportunityRuleIds.filter(
          (ruleId) => !ruleId.startsWith("holiday."),
        ),
      },
    };

    assert.equal(
      validateSocialCalendarContext(unsupported).provenance.holidayCoverage,
      "unsupported_country",
    );
  });
});
