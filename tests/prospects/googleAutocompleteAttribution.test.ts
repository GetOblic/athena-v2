/**
 * Google Places Autocomplete visible attribution mask.
 * Source-contract only. No live Google, Make, or browser.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function topLevelRules(css: string): { selector: string; body: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: { selector: string; body: string }[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of withoutComments.matchAll(pattern)) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    rules.push({ selector, body: match[2].trim() });
  }
  return rules;
}

function hidesElement(selector: string, className: string): boolean {
  return selector.split(",").some((part) => {
    const piece = part.trim();
    if (/::?(?:before|after)\b/.test(piece)) return false;
    return piece.split(/[\s>+~]+/).some((token) => {
      return (
        token === className ||
        token.startsWith(`${className}.`) ||
        token.startsWith(`${className}#`) ||
        token.startsWith(`${className}:`)
      );
    });
  });
}

describe("Google autocomplete attribution mask", () => {
  it("hides only the powered-by ::after in unlayered global CSS", () => {
    const css = read("app/globals.css");
    const rules = topLevelRules(css);
    const attribution = rules.filter((rule) => rule.selector.includes("pac-"));

    assert.deepEqual(
      attribution.map((rule) => rule.selector),
      [".pac-container.pac-logo::after"],
    );
    assert.equal(
      attribution[0].body.replace(/\s+/g, " "),
      "display: none !important;",
    );

    const ruleAt = css.indexOf(".pac-container.pac-logo::after");
    assert.ok(ruleAt >= 0);
    const before = css.slice(0, ruleAt);
    assert.equal(
      before.split("{").length - 1,
      before.split("}").length - 1,
      "attribution rule stays outside every block, including @layer",
    );

    const hidden = rules.filter((rule) =>
      /display\s*:\s*none|visibility\s*:\s*hidden/.test(rule.body),
    );
    assert.equal(
      hidden.some((rule) => hidesElement(rule.selector, ".pac-container")),
      false,
    );
    assert.equal(
      hidden.some((rule) => hidesElement(rule.selector, ".pac-item")),
      false,
    );
  });

  it("keeps Google Places Autocomplete construction free of pac DOM edits", () => {
    const source = read("components/prospects/GoogleBusinessDiscovery.tsx");
    assert.match(source, /new google\.maps\.places\.Autocomplete\s*\(/);
    assert.doesNotMatch(source, /pac-container/);
    assert.doesNotMatch(source, /pac-logo/);
  });
});
