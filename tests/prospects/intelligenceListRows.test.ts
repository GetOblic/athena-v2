import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS,
  isInteractiveListRowTarget,
} from "../../components/ui/athenaIntelligenceRow";

const ROOT = process.cwd();

function read(relative: string) {
  return readFileSync(join(ROOT, relative), "utf8");
}

describe("Standardized clickable intelligence rows", () => {
  it("Prospect rows remain fully clickable", () => {
    const source = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(source, /href=\{`\/prospects\/\$\{prospect\.id\}`\}/);
    assert.match(source, /ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/);
    assert.match(source, /<Link[\s\S]*prospect\.id[\s\S]*<\/Link>/);
  });

  it("Discussion rows are fully clickable", () => {
    const source = read("app/discussions/page.tsx");
    assert.match(source, /AthenaIntelligenceListRow/);
    assert.match(
      source,
      /href=\{`\/discussions\/\$\{discussion\.id\}`\}/,
    );
    assert.match(source, /ariaLabel=\{interpolateTenantMessage\(/);
    assert.match(source, /copy\.openDiscussionAria/);
    assert.match(source, /title: discussion\.title/);
  });

  it("Briefing rows are fully clickable", () => {
    const source = read("app/briefings/page.tsx");
    assert.match(source, /AthenaIntelligenceListRow/);
    assert.match(source, /href=\{`\/briefings\/\$\{briefing\.id\}`\}/);
    assert.match(source, /ariaLabel=\{`Open briefing/);
  });

  it("Opportunity rows are fully clickable", () => {
    const source = read("app/opportunities/page.tsx");
    assert.match(source, /AthenaIntelligenceListRow/);
    assert.match(
      source,
      /href=\{`\/opportunities\/\$\{opportunity\.id\}`\}/,
    );
    assert.match(source, /ariaLabel=\{`Open opportunity/);
    // Title is plain text — avoids nested links inside the row.
    assert.doesNotMatch(
      source,
      /AthenaIntelligenceListRow[\s\S]{0,200}<Link[\s\S]{0,80}opportunity\.title/,
    );
  });

  it("Existing action buttons remain present", () => {
    const discussions = read("app/discussions/page.tsx");
    const briefings = read("app/briefings/page.tsx");
    const opportunities = read("app/opportunities/page.tsx");

    assert.match(discussions, /getLocalizedDiscussionActionLabel/);
    assert.match(
      discussions,
      /<Link[\s\S]*href=\{`\/discussions\/\$\{discussion\.id\}`\}[\s\S]*<\/Link>/,
    );
    assert.match(briefings, /Open Briefing/);
    assert.match(opportunities, />\s*Open\s*</);
  });

  it("Interactive child clicks do not cause duplicate navigation", () => {
    const row = read("components/ui/AthenaIntelligenceListRow.tsx");
    assert.match(row, /isInteractiveListRowTarget\(event\.target\)/);
    assert.match(row, /if \(isInteractiveListRowTarget\(event\.target\)\) return/);

    const anchor = { closest: (selector: string) => (selector.includes("a") ? {} : null) };
    const plain = { closest: () => null };
    assert.equal(
      isInteractiveListRowTarget(anchor as unknown as Element),
      true,
    );
    assert.equal(
      isInteractiveListRowTarget(plain as unknown as Element),
      false,
    );
    assert.equal(isInteractiveListRowTarget(null), false);
  });

  it("Rows support keyboard activation", () => {
    const row = read("components/ui/AthenaIntelligenceListRow.tsx");
    assert.match(row, /role="link"/);
    assert.match(row, /tabIndex=\{0\}/);
    assert.match(row, /event\.key === "Enter"/);
    assert.match(row, /event\.key === " "/);
    assert.match(row, /router\.push\(href\)/);

    const prospects = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(prospects, /<Link[\s\S]*href=\{`\/prospects/);
  });

  it("All four list surfaces use the shared orange row-outline treatment", () => {
    assert.match(
      ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS,
      /rgba\(255,102,0,0\.18\)/,
    );
    assert.match(
      ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS,
      /hover:border-\[rgba\(255,102,0,0\.35\)\]/,
    );

    const prospects = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(prospects, /ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/);

    const rowComponent = read("components/ui/AthenaIntelligenceListRow.tsx");
    assert.match(rowComponent, /ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/);

    // Queue lists consume the shared outline via AthenaIntelligenceListRow.
    for (const relative of [
      "app/discussions/page.tsx",
      "app/briefings/page.tsx",
      "app/opportunities/page.tsx",
    ]) {
      const source = read(relative);
      assert.match(
        source,
        /AthenaIntelligenceListRow/,
        `${relative} should use AthenaIntelligenceListRow`,
      );
    }

    const executive = read("components/ui/athenaExecutiveCard.ts");
    assert.match(executive, /rgba\(255,102,0,0\.18\)/);
    assert.match(executive, /rgba\(255,102,0,0\.35\)/);
  });

  it("Headers and group labels do not receive row outlines", () => {
    const discussions = read("app/discussions/page.tsx");
    const briefings = read("app/briefings/page.tsx");
    const opportunities = read("app/opportunities/page.tsx");
    const prospects = read("components/prospects/ProspectsLibraryClient.tsx");
    const header = read("components/queues/QueueSectionHeader.tsx");

    assert.doesNotMatch(header, /ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/);
    assert.doesNotMatch(header, /AthenaIntelligenceListRow/);

    assert.match(discussions, /QueueSectionHeader/);
    assert.match(briefings, /QueueSectionHeader/);
    assert.match(opportunities, /QueueSectionHeader/);

    // Column header rows stay plain grid headers.
    assert.match(
      discussions,
      /uppercase tracking-\[0\.25em\] text-white\/35/,
    );
    assert.doesNotMatch(
      discussions,
      /uppercase tracking-\[0\.25em\][\s\S]{0,120}ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/,
    );
    assert.doesNotMatch(
      briefings,
      /uppercase tracking-\[0\.25em\][\s\S]{0,120}ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/,
    );
    assert.doesNotMatch(
      opportunities,
      /uppercase tracking-\[0\.25em\][\s\S]{0,120}ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/,
    );
    assert.doesNotMatch(
      prospects,
      /uppercase tracking-\[0\.2em\][\s\S]{0,160}ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/,
    );
  });
});
