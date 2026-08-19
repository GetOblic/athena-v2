/**
 * Offline date-holidays wrapper for L2 jurisdiction holiday candidates.
 *
 * Uses the package's bundled holiday data only. Not a general date framework.
 * Athena temporal/season/weekday logic remains authoritative.
 */

import Holidays from "date-holidays";
import holidaysPackageJson from "date-holidays/package.json";
import type { SocialPlannerGeography } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import {
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME,
  type SocialCalendarHolidayCoverage,
  type SocialCalendarObservedKind,
  type SocialCalendarOpportunity,
  type SocialCalendarOpportunityCategory,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";

type ProviderHoliday = {
  date: string;
  name: string;
  type: string;
  rule: string;
  substitute?: boolean;
};

export const SOCIAL_CALENDAR_HOLIDAY_PROVIDER_STATUS = "date_holidays" as const;

export const SOCIAL_CALENDAR_HOLIDAY_PROVIDER_VERSION =
  holidaysPackageJson.version;

const ENGLISH = "en" as const;
const PROVIDER_RULE_MAX_CHARS = 200;
const LABEL_MAX_CHARS = 160;

const HOLIDAY_TYPES_INCLUDED = [
  "public",
  "bank",
  "optional",
  "observance",
] as const;

type IncludedHolidayType = (typeof HOLIDAY_TYPES_INCLUDED)[number];

const HOLIDAY_TYPE_TO_CATEGORY: Record<
  IncludedHolidayType,
  SocialCalendarOpportunityCategory
> = {
  public: "public_holiday",
  bank: "civic_observance",
  optional: "civic_observance",
  observance: "civic_observance",
};

function isIncludedHolidayType(type: string): type is IncludedHolidayType {
  return (HOLIDAY_TYPES_INCLUDED as readonly string[]).includes(type);
}

function createHolidayCatalog(): Holidays {
  return new Holidays({ languages: [ENGLISH] });
}

export function isDateHolidaysCountrySupported(countryCode: string): boolean {
  const countries = createHolidayCatalog().getCountries(ENGLISH);
  return Object.prototype.hasOwnProperty.call(countries, countryCode);
}

export function isDateHolidaysRegionSupported(
  countryCode: string,
  regionCode: string,
): boolean {
  const states = createHolidayCatalog().getStates(countryCode, ENGLISH);
  if (!states) return false;
  const normalized = regionCode.trim().toUpperCase();
  return Object.keys(states).some((key) => key.toUpperCase() === normalized);
}

export function resolveSocialCalendarHolidayCoverage(
  geography: SocialPlannerGeography,
): SocialCalendarHolidayCoverage {
  if (!geography.countryCode) {
    return "none";
  }
  if (!isDateHolidaysCountrySupported(geography.countryCode)) {
    return "unsupported_country";
  }
  if (
    geography.regionCode &&
    isDateHolidaysRegionSupported(geography.countryCode, geography.regionCode)
  ) {
    return "country_region";
  }
  return "country";
}

function localCalendarDate(providerDate: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(providerDate);
  return match?.[1] ?? null;
}

function slugifyHolidayLabel(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || "holiday";
}

function holidayIdentity(holiday: ProviderHoliday): string {
  return [
    localCalendarDate(holiday.date) ?? "",
    holiday.name,
    holiday.type,
    holiday.rule,
    holiday.substitute === true ? "substitute" : "actual",
  ].join("|");
}

function createProviderInstance(
  countryCode: string,
  regionCode: string | null,
): Holidays {
  if (regionCode) {
    return new Holidays(countryCode, regionCode, { languages: [ENGLISH] });
  }
  return new Holidays(countryCode, { languages: [ENGLISH] });
}

function listProviderHolidaysForYears(
  countryCode: string,
  regionCode: string | null,
  years: readonly number[],
): ProviderHoliday[] {
  const hd = createProviderInstance(countryCode, regionCode);
  const holidays: ProviderHoliday[] = [];
  for (const year of years) {
    holidays.push(...hd.getHolidays(year, ENGLISH));
  }
  return holidays;
}

function normalizeProviderHoliday(input: {
  holiday: ProviderHoliday;
  countryCode: string;
  regionCode: string | null;
  scope: "country" | "region";
}): SocialCalendarOpportunity | null {
  const date = localCalendarDate(input.holiday.date);
  if (!date) return null;
  if (!isIncludedHolidayType(input.holiday.type)) {
    return null;
  }

  const label = input.holiday.name.trim().slice(0, LABEL_MAX_CHARS);
  if (!label) return null;

  const observedKind: SocialCalendarObservedKind =
    input.holiday.substitute === true ? "substitute" : "actual";
  const category = HOLIDAY_TYPE_TO_CATEGORY[input.holiday.type];
  const slug = slugifyHolidayLabel(label);
  const regionSegment =
    input.scope === "region" && input.regionCode
      ? `.${input.regionCode}`
      : "";
  const substituteSegment = observedKind === "substitute" ? ".substitute" : "";
  const ruleId = `holiday.${SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME.replace("-", "_")}.${input.countryCode}${regionSegment}.${input.holiday.type}.${slug}${substituteSegment}`;
  const providerRule =
    typeof input.holiday.rule === "string" && input.holiday.rule.trim()
      ? input.holiday.rule.trim().slice(0, PROVIDER_RULE_MAX_CHARS)
      : null;

  return {
    id: `${ruleId}:${date}`,
    label,
    date,
    category,
    scope: input.scope,
    jurisdictionCountryCode: input.countryCode,
    jurisdictionRegionCode: input.scope === "region" ? input.regionCode : null,
    jurisdictionHemisphere: null,
    selectionStatus: "candidate",
    ruleId,
    observedKind,
    providerRule,
  };
}

/**
 * Query bundled date-holidays data for a resolved country (and optional
 * structured region). Does not invent a US calendar for unknown geography.
 */
export function collectDateHolidaysOpportunities(
  dates: readonly string[],
  geography: SocialPlannerGeography,
): SocialCalendarOpportunity[] {
  const countryCode = geography.countryCode;
  if (!countryCode) {
    return [];
  }
  if (!isDateHolidaysCountrySupported(countryCode)) {
    return [];
  }

  const dateSet = new Set(dates);
  const years = Array.from(
    new Set(
      dates.map((date) => Number(date.slice(0, 4))).filter((year) => Number.isInteger(year)),
    ),
  ).sort((left, right) => left - right);

  const regionCode =
    geography.regionCode &&
    isDateHolidaysRegionSupported(countryCode, geography.regionCode)
      ? geography.regionCode.trim().toUpperCase()
      : null;

  const countryHolidays = listProviderHolidaysForYears(countryCode, null, years);
  const countryIdentities = new Set(countryHolidays.map(holidayIdentity));
  const collected: SocialCalendarOpportunity[] = [];

  for (const holiday of countryHolidays) {
    const opportunity = normalizeProviderHoliday({
      holiday,
      countryCode,
      regionCode: null,
      scope: "country",
    });
    if (opportunity && dateSet.has(opportunity.date)) {
      collected.push(opportunity);
    }
  }

  if (regionCode) {
    const regionHolidays = listProviderHolidaysForYears(
      countryCode,
      regionCode,
      years,
    );
    for (const holiday of regionHolidays) {
      if (countryIdentities.has(holidayIdentity(holiday))) {
        continue;
      }
      const opportunity = normalizeProviderHoliday({
        holiday,
        countryCode,
        regionCode,
        scope: "region",
      });
      if (opportunity && dateSet.has(opportunity.date)) {
        collected.push(opportunity);
      }
    }
  }

  return collected;
}
