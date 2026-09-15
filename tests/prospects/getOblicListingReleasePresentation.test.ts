/**
 * Phase 3B1 — GetOblic Release presentation stays server-safe.
 * Prevents /prospects/[id] from calling functions exported by the
 * "use client" GetOblicListingReleaseControl module.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { shouldShowGetOblicListingReleaseAction } from "../../lib/prospects/getOblicListingReleasePresentation";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function importedBindings(source: string, modulePath: string): string[] {
  const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bindings: string[] = [];
  const named = new RegExp(
    `import\\s+(?:type\\s+)?(?:([A-Za-z_$][\\w$]*)\\s*,\\s*)?\\{([^}]*)\\}\\s+from\\s+["']${escaped}["']`,
    "g",
  );
  const starOrDefault = new RegExp(
    `import\\s+(?:type\\s+)?(?:\\*\\s+as\\s+([A-Za-z_$][\\w$]*)|([A-Za-z_$][\\w$]*))\\s+from\\s+["']${escaped}["']`,
    "g",
  );

  for (const match of source.matchAll(named)) {
    if (match[1]) bindings.push(match[1]);
    for (const part of match[2].split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const name = trimmed
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name) bindings.push(name);
    }
  }

  for (const match of source.matchAll(starOrDefault)) {
    bindings.push(match[1] ?? match[2]);
  }

  return bindings;
}

describe("GetOblic listing release presentation boundary", () => {
  it("keeps the visibility predicate in a server-safe helper", () => {
    const helper = read(
      "lib/prospects/getOblicListingReleasePresentation.ts",
    );
    assert.doesNotMatch(helper, /^["']use client["']/m);
    assert.doesNotMatch(helper, /from ["']react["']|from ["']react\//);
    assert.doesNotMatch(helper, /\buse(State|Effect|Router|Id|Ref|Memo|Callback)\b/);
    assert.doesNotMatch(helper, /\bwindow\b|\bdocument\b/);
    assert.doesNotMatch(helper, /supabaseAdmin|from\("/);
    assert.match(helper, /export function shouldShowGetOblicListingReleaseAction/);
  });

  it("does not import callable functions from the client release control on the server page", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const clientModule = "@/components/prospects/GetOblicListingReleaseControl";
    const helperModule = "@/lib/prospects/getOblicListingReleasePresentation";

    assert.doesNotMatch(page, /["']use client["']/);

    const clientBindings = importedBindings(page, clientModule);
    assert.deepEqual(clientBindings, ["GetOblicListingReleaseControl"]);
    assert.equal(
      clientBindings.includes("shouldShowGetOblicListingReleaseAction"),
      false,
    );

    const helperBindings = importedBindings(page, helperModule);
    assert.deepEqual(helperBindings, ["shouldShowGetOblicListingReleaseAction"]);
    assert.match(page, /shouldShowGetOblicListingReleaseAction\(/);
  });

  it("hides Release for ACTIVE conversion and keeps existing claim visibility", () => {
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "linked",
        conversionStatus: "active",
      }),
      false,
    );
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "claiming",
        conversionStatus: "reversed",
      }),
      true,
    );
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "linked",
        conversionStatus: "none",
      }),
      true,
    );
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "released",
        conversionStatus: "none",
      }),
      false,
    );
  });
});
