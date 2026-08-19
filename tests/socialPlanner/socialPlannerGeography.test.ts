import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  geographyFromDomainOrTld,
  isAmbiguousSocialPlannerGeographyText,
  matchCountryFromTrustedText,
  resolveSocialPlannerGeography,
} from "../../services/socialPlanner/geography/resolveSocialPlannerGeography";
import { SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY } from "../../services/socialPlanner/geography/socialPlannerGeographyTypes";

describe("Social Planner L2 geography resolver", () => {
  it("resolves structured country without inventing region or timezone", () => {
    const geography = resolveSocialPlannerGeography({
      structuredCountry: "France",
    });
    assert.equal(geography.status, "resolved");
    assert.equal(geography.country, "France");
    assert.equal(geography.countryCode, "FR");
    assert.equal(geography.region, null);
    assert.equal(geography.regionCode, null);
    assert.equal(geography.city, null);
    assert.equal(geography.timezone, null);
    assert.equal(geography.locale, null);
    assert.equal(geography.hemisphere, "northern");
    assert.equal(geography.source, "structured_country");
    assert.equal(geography.confidence, "high");
    assert.equal(geography.conflict, null);
  });

  it("accepts exact structured country codes including UK → GB", () => {
    assert.equal(
      resolveSocialPlannerGeography({ structuredCountry: "US" }).countryCode,
      "US",
    );
    assert.equal(
      resolveSocialPlannerGeography({ structuredCountry: "UK" }).countryCode,
      "GB",
    );
  });

  it("keeps country known and region unknown as a valid partial-field result", () => {
    const geography = resolveSocialPlannerGeography({
      executiveGeographicReach: "Headquartered in Israel",
    });
    assert.equal(geography.status, "resolved");
    assert.equal(geography.country, "Israel");
    assert.equal(geography.countryCode, "IL");
    assert.equal(geography.region, null);
    assert.equal(geography.regionCode, null);
    assert.equal(geography.source, "identity_executive_intelligence.geographic_reach");
  });

  it("uses website contact only when higher sources do not resolve a country", () => {
    const geography = resolveSocialPlannerGeography({
      executiveGeographicReach: "Serving customers worldwide",
      deepWebsiteContactInformation: "123 High Street, London, United Kingdom",
    });
    assert.equal(geography.status, "partially_resolved");
    assert.equal(geography.country, "United Kingdom");
    assert.equal(geography.countryCode, "GB");
    assert.equal(geography.source, "deep_website.contact_information");
    assert.equal(geography.confidence, "low");
  });

  it("lets the higher-authority source win when sources disagree", () => {
    const geography = resolveSocialPlannerGeography({
      executiveGeographicReach: "France",
      deepWebsiteContactInformation: "Austin, Texas, United States",
    });
    assert.equal(geography.country, "France");
    assert.equal(geography.countryCode, "FR");
    assert.equal(geography.status, "partially_resolved");
    assert.deepEqual(geography.conflict, {
      ignoredSource: "deep_website.contact_information",
      ignoredCountry: "United States",
      ignoredCountryCode: "US",
    });
  });

  it("lets structured country beat Identity Executive Intelligence", () => {
    const geography = resolveSocialPlannerGeography({
      structuredCountry: "Canada",
      executiveGeographicReach: "United States",
    });
    assert.equal(geography.countryCode, "CA");
    assert.equal(geography.source, "structured_country");
    assert.equal(geography.status, "partially_resolved");
    assert.equal(geography.conflict?.ignoredCountryCode, "US");
  });

  it("does not pick a jurisdiction from multiple commercial markets", () => {
    const geography = resolveSocialPlannerGeography({
      executiveGeographicReach: "United States and United Kingdom",
    });
    assert.deepEqual(geography, SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY);
    assert.equal(matchCountryFromTrustedText("United States and France"), null);
  });

  it("treats worldwide / global reach as unknown rather than United States", () => {
    const geography = resolveSocialPlannerGeography({
      executiveGeographicReach: "global online business",
    });
    assert.equal(geography.status, "unknown");
    assert.equal(geography.country, null);
    assert.equal(geography.countryCode, null);
    assert.equal(geography.hemisphere, "unknown");
    assert.equal(isAmbiguousSocialPlannerGeographyText("worldwide"), true);
  });

  it("does not treat Indiana as India", () => {
    assert.equal(matchCountryFromTrustedText("Indiana office"), null);
  });

  it("does not infer a country from city-only text", () => {
    const geography = resolveSocialPlannerGeography({
      deepWebsiteContactInformation: "Austin office",
    });
    assert.equal(geography.status, "unknown");
    assert.equal(geography.country, null);
  });

  it("does not treat contact us or domain/TLD as United States", () => {
    assert.equal(matchCountryFromTrustedText("Please contact us"), null);
    assert.equal(geographyFromDomainOrTld("https://example.com"), null);
    assert.equal(geographyFromDomainOrTld("example.co.uk"), null);
    assert.equal(
      resolveSocialPlannerGeography({
        deepWebsiteContactInformation: "Visit acme.io",
      }).status,
      "unknown",
    );
  });

  it("marks equator-spanning catalog countries as hemisphere unknown", () => {
    const brazil = resolveSocialPlannerGeography({
      structuredCountry: "Brazil",
    });
    assert.equal(brazil.status, "resolved");
    assert.equal(brazil.countryCode, "BR");
    assert.equal(brazil.hemisphere, "unknown");
  });
});
