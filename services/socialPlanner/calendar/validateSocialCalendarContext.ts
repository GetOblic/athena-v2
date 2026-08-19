/**
 * Deterministic validation for frozen Social Calendar Context (L2).
 */

import { SOCIAL_CALENDAR_PERIOD_DAYS } from "@/services/socialPlanner/socialCalendarTypes";
import { opportunityAppliesToGeography } from "@/services/socialPlanner/calendar/socialCalendarOpportunities";
import {
  SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION,
  SOCIAL_CALENDAR_DAY_NAMES,
  SOCIAL_CALENDAR_HOLIDAY_COVERAGE,
  SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME,
  SOCIAL_CALENDAR_OBSERVED_KINDS,
  SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES,
  SOCIAL_CALENDAR_OPPORTUNITY_SCOPES,
  SOCIAL_CALENDAR_RESOLVER_VERSION,
  SocialCalendarContextError,
  type SocialCalendarContext,
  type SocialCalendarOpportunity,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import { listSocialCalendarPeriodDates } from "@/services/socialPlanner/calendar/socialCalendarTemporal";

const MAX_CONTEXT_JSON_CHARS = 24_576;
const MAX_OPPORTUNITIES = 64;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new SocialCalendarContextError(message);
  }
}

function assertOpportunityScopeCoherent(
  opportunity: SocialCalendarOpportunity,
): void {
  assert(
    (SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES as readonly string[]).includes(
      opportunity.category,
    ),
    `Unknown opportunity category: ${opportunity.category}.`,
  );
  assert(
    (SOCIAL_CALENDAR_OPPORTUNITY_SCOPES as readonly string[]).includes(
      opportunity.scope,
    ),
    `Unknown opportunity scope: ${opportunity.scope}.`,
  );
  assert(
    opportunity.selectionStatus === "candidate",
    "L2 opportunities must remain candidates, not selected creative anchors.",
  );
  assert(
    opportunity.observedKind == null ||
      (SOCIAL_CALENDAR_OBSERVED_KINDS as readonly string[]).includes(
        opportunity.observedKind,
      ),
    `Opportunity ${opportunity.id} has an invalid observedKind.`,
  );
  assert(
    opportunity.providerRule == null || typeof opportunity.providerRule === "string",
    `Opportunity ${opportunity.id} has an invalid providerRule.`,
  );

  if (opportunity.scope === "global") {
    assert(
      opportunity.jurisdictionCountryCode == null &&
        opportunity.jurisdictionRegionCode == null &&
        opportunity.jurisdictionHemisphere == null,
      `Global opportunity ${opportunity.id} must not carry jurisdiction fields.`,
    );
    return;
  }

  if (opportunity.scope === "hemisphere") {
    assert(
      opportunity.jurisdictionHemisphere === "northern" ||
        opportunity.jurisdictionHemisphere === "southern",
      `Hemisphere opportunity ${opportunity.id} requires a known hemisphere.`,
    );
    return;
  }

  if (opportunity.scope === "country") {
    assert(
      Boolean(opportunity.jurisdictionCountryCode),
      `Country opportunity ${opportunity.id} requires jurisdictionCountryCode.`,
    );
    return;
  }

  assert(
    Boolean(opportunity.jurisdictionCountryCode) &&
      Boolean(opportunity.jurisdictionRegionCode),
    `Region opportunity ${opportunity.id} requires country and region codes.`,
  );
}

export function validateSocialCalendarContext(
  context: SocialCalendarContext,
): SocialCalendarContext {
  assert(
    context.schemaVersion === SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION,
    "Calendar context schemaVersion must be social_calendar_context_v1.",
  );
  assert(
    context.provenance.resolverVersion === SOCIAL_CALENDAR_RESOLVER_VERSION,
    "Calendar context resolverVersion is invalid.",
  );
  assert(
    context.provenance.schemaVersion === SOCIAL_CALENDAR_CONTEXT_SCHEMA_VERSION,
    "Calendar context provenance schemaVersion is invalid.",
  );
  assert(
    (SOCIAL_CALENDAR_HOLIDAY_COVERAGE as readonly string[]).includes(
      context.provenance.holidayCoverage,
    ),
    "Calendar context holidayCoverage is invalid.",
  );
  assert(
    context.provenance.holidayProvider === SOCIAL_CALENDAR_HOLIDAY_PROVIDER_NAME,
    "Calendar context holidayProvider is invalid.",
  );
  assert(
    typeof context.provenance.holidayProviderVersion === "string" &&
      context.provenance.holidayProviderVersion.length > 0,
    "Calendar context holidayProviderVersion is invalid.",
  );

  const expectedDates = listSocialCalendarPeriodDates(
    context.period.periodStart,
    context.period.periodEnd,
  );
  assert(
    expectedDates.length === SOCIAL_CALENDAR_PERIOD_DAYS,
    "Calendar context period must cover exactly seven dates.",
  );
  assert(
    context.period.dates.length === SOCIAL_CALENDAR_PERIOD_DAYS,
    "Calendar context period.dates must contain exactly seven dates.",
  );
  assert(
    context.dayContexts.length === SOCIAL_CALENDAR_PERIOD_DAYS,
    "Calendar context must contain exactly seven day contexts.",
  );
  assert(
    context.period.dates.join(",") === expectedDates.join(","),
    "Calendar context period.dates must match period_start through period_end.",
  );

  const seenDates = new Set<string>();
  for (const [index, day] of context.dayContexts.entries()) {
    assert(day.date === expectedDates[index], "Day context dates must be ordered and exact.");
    assert(!seenDates.has(day.date), `Duplicate day context date: ${day.date}.`);
    seenDates.add(day.date);

    const utc = new Date(`${day.date}T00:00:00.000Z`);
    assert(
      day.dayOfWeek === SOCIAL_CALENDAR_DAY_NAMES[utc.getUTCDay()],
      `Incorrect weekday for ${day.date}.`,
    );
    assert(day.positionInSelectedWeek === index + 1, "positionInSelectedWeek is incorrect.");
    assert(day.month === utc.getUTCMonth() + 1, "Day context month is incorrect.");
    assert(day.year === utc.getUTCFullYear(), "Day context year is incorrect.");
    assert(
      day.quarter === Math.ceil(day.month / 3),
      "Day context quarter is incorrect.",
    );
  }

  assert(
    context.opportunities.length <= MAX_OPPORTUNITIES,
    "Calendar context opportunities exceed the bounded maximum.",
  );

  const opportunityById = new Map<string, SocialCalendarOpportunity>();
  for (const opportunity of context.opportunities) {
    assert(!opportunityById.has(opportunity.id), `Duplicate opportunity id: ${opportunity.id}.`);
    opportunityById.set(opportunity.id, opportunity);
    assert(
      seenDates.has(opportunity.date),
      `Opportunity ${opportunity.id} date is outside the selected period.`,
    );
    assertOpportunityScopeCoherent(opportunity);
    assert(
      opportunityAppliesToGeography(opportunity, context.geography),
      `Opportunity ${opportunity.id} leaks outside the resolved jurisdiction.`,
    );
  }

  for (const day of context.dayContexts) {
    for (const opportunityId of day.opportunityIds) {
      const opportunity = opportunityById.get(opportunityId);
      assert(opportunity, `Day ${day.date} references unknown opportunity ${opportunityId}.`);
      assert(
        opportunity.date === day.date,
        `Opportunity ${opportunityId} is attached to the wrong day.`,
      );
    }
  }

  const serialized = JSON.stringify(context);
  assert(
    serialized.length <= MAX_CONTEXT_JSON_CHARS,
    "Calendar context JSON exceeds the bounded size.",
  );

  return context;
}
