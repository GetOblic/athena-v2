import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ESTIMATE_CURRENCY_FALLBACK,
  geographyFromDomainOrTld,
  isAmbiguousGeographyText,
  matchCountryFromTrustedText,
  resolveEstimateGeoCurrency,
} from "../../services/estimate/estimateGeoCurrency";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Estimate geo/currency resolution", () => {
  it("17. structured trusted geography resolves expected currency", () => {
    const us = resolveEstimateGeoCurrency({
      structuredCountry: "United States",
    });
    assert.equal(us.currencyResolution, "derived");
    assert.equal(us.currencyCode, "USD");
    assert.equal(us.geographyLabel, "United States");
    assert.equal(us.evidenceSource, "structured_country");

    const il = resolveEstimateGeoCurrency({
      executiveGeographicReach: "Headquartered in Israel",
    });
    assert.equal(il.currencyCode, "ILS");
    assert.equal(il.geographyLabel, "Israel");
    assert.equal(il.currencyResolution, "derived");

    const uk = resolveEstimateGeoCurrency({
      deepWebsiteContactInformation: "123 High Street, London, United Kingdom",
    });
    assert.equal(uk.currencyCode, "GBP");
    assert.equal(uk.geographyLabel, "United Kingdom");
  });

  it("18. ambiguous geography falls back to USD", () => {
    const worldwide = resolveEstimateGeoCurrency({
      executiveGeographicReach: "Serving customers worldwide",
    });
    assert.deepEqual(
      {
        geographyLabel: worldwide.geographyLabel,
        currencyCode: worldwide.currencyCode,
        currencyResolution: worldwide.currencyResolution,
      },
      {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
    );
    assert.equal(isAmbiguousGeographyText("global online business"), true);
    assert.equal(ESTIMATE_CURRENCY_FALLBACK.currencyCode, "USD");

    const multi = resolveEstimateGeoCurrency({
      executiveGeographicReach: "United States and United Kingdom",
    });
    assert.equal(multi.currencyResolution, "fallback");
    assert.equal(multi.currencyCode, "USD");
    assert.equal(multi.geographyLabel, null);
  });

  it("19. operator-provided geography helpers are not part of trusted resolver inputs", () => {
    const source = read("services/estimate/estimateGeoCurrency.ts");
    assert.match(source, /Never uses operator project guidance/);
    assert.doesNotMatch(source, /projectNeed|additionalContext/);

    // Passing operator-like text only works if caller wrongly feeds it — composer must not.
    const composer = read("services/estimate/estimateContextComposer.ts");
    assert.match(composer, /resolveEstimateGeoCurrency/);
    assert.match(
      composer,
      /extractGeoEvidenceFromExecutiveIntelligence\(executive\)/,
    );
    assert.match(
      composer,
      /extractGeoEvidenceFromDeepWebsite\(deepIntelligence\)/,
    );
    assert.doesNotMatch(
      composer,
      /resolveEstimateGeoCurrency\(\{[\s\S]*projectNeed/,
    );
  });

  it("20. domain/TLD alone cannot drive geography", () => {
    assert.equal(geographyFromDomainOrTld("https://example.com"), null);
    assert.equal(geographyFromDomainOrTld("example.co.uk"), null);
    assert.equal(matchCountryFromTrustedText("https://acme.com"), null);
    assert.equal(matchCountryFromTrustedText("Visit acme.io"), null);
  });

  it("21. no external/network market or FX call", () => {
    const source = read("services/estimate/estimateGeoCurrency.ts");
    assert.doesNotMatch(source, /fetch\(|axios|openrouter|exchangerate|forex/i);
    assert.match(source, /Never calls external FX/);
  });
});
