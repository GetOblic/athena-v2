import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { PersonaConfidenceScore } from "../../components/personas/PersonaConfidenceScore";
import {
  formatConfidenceLabel,
  formatConfidencePercent,
} from "../../lib/confidenceDisplay";
import { en } from "../../lib/tenantI18n/messages/en";

describe("PersonaConfidenceScore", () => {
  it("renders 90 as 90% High using existing helpers", () => {
    assert.equal(formatConfidenceLabel(90), "High");
    assert.equal(formatConfidencePercent(90), "90%");
    const html = renderToStaticMarkup(
      createElement(PersonaConfidenceScore, {
        confidence: 90,
        messages: en.personas,
      }),
    );
    assert.match(html, /90%/);
    assert.match(html, /High/);
    assert.doesNotMatch(html, /IdentityKnowledgeScore|SeoScoreCard/);
  });

  it("renders 65 as Medium and 25 as Low", () => {
    assert.equal(formatConfidenceLabel(65), "Medium");
    assert.equal(formatConfidenceLabel(25), "Low");
    const medium = renderToStaticMarkup(
      createElement(PersonaConfidenceScore, {
        confidence: 65,
        messages: en.personas,
      }),
    );
    const low = renderToStaticMarkup(
      createElement(PersonaConfidenceScore, {
        confidence: 25,
        messages: en.personas,
      }),
    );
    assert.match(medium, /65%/);
    assert.match(medium, /Medium/);
    assert.match(low, /25%/);
    assert.match(low, /Low/);
  });

  it("omits the score surface for null and stored 0", () => {
    const missing = renderToStaticMarkup(
      createElement(PersonaConfidenceScore, {
        confidence: null,
        messages: en.personas,
      }),
    );
    const zero = renderToStaticMarkup(
      createElement(PersonaConfidenceScore, {
        confidence: 0,
        messages: en.personas,
      }),
    );
    assert.equal(missing, "");
    assert.equal(zero, "");
    assert.doesNotMatch(missing, /0%/);
    assert.doesNotMatch(zero, /0%/);
    assert.doesNotMatch(zero, /Low/);
  });
});
