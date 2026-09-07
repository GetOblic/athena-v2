import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Audience profile collapsed when intelligence exists", () => {
  it("detail page opens the profile only when intelligence is absent", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaMetadataEditor/);
    assert.match(page, /defaultOpen=\{!hasCurrentExecutiveVersion\}/);
  });

  it("Audience profile metadata editor defaults collapsed unless asked to open", () => {
    const editor = read("components/personas/PersonaMetadataEditor.tsx");
    assert.match(editor, /eyebrow=\{chrome\?\.eyebrow \?\? "Audience profile"\}/);
    assert.match(editor, /defaultOpen = false/);
    assert.match(editor, /defaultOpen=\{defaultOpen\}/);
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
    const actions = read("components/auth/AthenaHeaderActions.tsx");
    assert.match(brand, /AthenaHeaderActions/);
    assert.match(brand, /pathname !== "\/login"/);
    assert.match(brand, /justify-between/);
    assert.match(brand, /w-full/);
    assert.match(actions, /LogoutCta/);
    assert.match(actions, /BackToMasterCta/);
    assert.match(actions, /justify-end/);
  });

  it("logout API route remains Supabase signOut without new routes", () => {
    const route = read("app/api/auth/logout/route.ts");
    assert.match(route, /supabase\.auth\.signOut/);
    assert.match(route, /NextResponse\.redirect/);
  });
});
