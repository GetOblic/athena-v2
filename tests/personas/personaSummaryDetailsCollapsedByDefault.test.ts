import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Persona Summary and Persona Details collapsed by default", () => {
  it("Summary uses AthenaCollapsibleSection with defaultOpen={false}", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(
      page,
      /title="Summary"\s*defaultOpen=\{false\}/,
    );
    assert.match(page, /AthenaCollapsibleSection/);
  });

  it("Persona Details metadata editor defaults collapsed", () => {
    const editor = read("components/personas/PersonaMetadataEditor.tsx");
    assert.match(editor, /eyebrow="Persona Details"/);
    assert.match(editor, /defaultOpen=\{false\}/);
    assert.doesNotMatch(editor, /defaultOpen\s*\n/);
    assert.doesNotMatch(editor, /defaultOpen=\{true\}/);
  });
});

describe("Athena Logout CTA reuses /api/auth/logout", () => {
  it("LogoutCta posts to existing logout route", () => {
    const cta = read("components/auth/LogoutCta.tsx");
    assert.match(cta, /action="\/api\/auth\/logout"/);
    assert.match(cta, /method="post"/);
    assert.match(cta, /Log out/);
  });

  it("AthenaBrandLink places Logout CTA top-right on authenticated pages only", () => {
    const brand = read("components/branding/AthenaBrandLink.tsx");
    assert.match(brand, /LogoutCta/);
    assert.match(brand, /pathname !== "\/login"/);
    assert.match(brand, /justify-between/);
    assert.match(brand, /w-full/);
  });

  it("logout API route remains Supabase signOut without new routes", () => {
    const route = read("app/api/auth/logout/route.ts");
    assert.match(route, /supabase\.auth\.signOut/);
    assert.match(route, /NextResponse\.redirect/);
  });
});
