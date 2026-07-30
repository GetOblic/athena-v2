import "./personaTestEnv";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildAppendedPersonaNotes,
  formatPersonaInteractionStamp,
  PERSONA_INTERACTION_DISPLAY_TIMEZONE,
} from "../../services/personas/personaInteractions";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona stage-5 Append Interaction contract", () => {
  it("appends with server stamp and never overwrites prior Notes", () => {
    const stampedAt = new Date("2026-07-30T21:23:00.000Z");
    const stamp = formatPersonaInteractionStamp(stampedAt);
    assert.match(
      stamp,
      new RegExp(
        `\\[Interaction appended on .+ ${PERSONA_INTERACTION_DISPLAY_TIMEZONE}\\]`,
      ),
    );

    const first = buildAppendedPersonaNotes({
      existingNotes: null,
      interaction: "Heard price objection twice.",
      stampedAt,
    });
    assert.match(first, /Heard price objection twice\./);
    assert.doesNotMatch(first, /^\s+/);

    const second = buildAppendedPersonaNotes({
      existingNotes: first,
      interaction: "Line one\nLine two",
      stampedAt,
    });
    assert.match(second, /Heard price objection twice\./);
    assert.match(second, /Line one\nLine two/);
    assert.ok(second.startsWith(first));
  });

  it("rejects empty interaction text", () => {
    assert.throws(
      () =>
        buildAppendedPersonaNotes({
          existingNotes: "existing",
          interaction: "   ",
        }),
      /Interaction text is required/,
    );
  });

  it("API accepts only interaction and uses server-side append + discussion_update", () => {
    const route = read("app/api/personas/[id]/updates/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /appendPersonaInteraction/);
    assert.match(route, /interaction/);
    assert.match(route, /202/);
    assert.match(route, /partialSuccess/);
    assert.doesNotMatch(route, /additional_context|ads_content/);
    assert.doesNotMatch(route, /body\.notes|full notes replacement/i);

    const service = read("services/personas/personaInteractions.ts");
    assert.match(service, /updatePersonaNotesIfUnchanged/);
    assert.match(service, /expectedUpdatedAt/);
    assert.match(service, /discussion_update/);
    assert.match(service, /ensurePersonaGenerationQueued/);
    assert.match(service, /regenerationError/);
    assert.match(
      service,
      /Notes are never overwritten; additional_context and ads_content are untouched/,
    );
    assert.doesNotMatch(service, /additional_context:/);
    assert.doesNotMatch(service, /ads_content:/);

    const personaService = read("services/personas/personaService.ts");
    assert.match(personaService, /updatePersonaNotesIfUnchanged/);
    assert.match(personaService, /\.eq\("updated_at", input\.expectedUpdatedAt\)/);
  });

  it("does not create a separate interaction table", () => {
    const migration = read(
      "supabase/migrations/20260731000001_persona_deep_scrape_source.sql",
    );
    assert.doesNotMatch(migration, /create table.*persona_interaction/i);
    assert.doesNotMatch(migration, /create table.*interactions/i);
  });
});

describe("persona stage-5 Append Interaction UI", () => {
  it("uses exact Persona vocabulary and preserves typed text on failure", () => {
    const ui = read("components/personas/PersonaAppendInteraction.tsx");
    assert.match(ui, /Append Interaction/);
    assert.match(ui, /Append Interaction and Regenerate/);
    assert.doesNotMatch(ui, /Append Information|CRM|Add Conversation Record/);
    assert.match(ui, /setInteraction\(""\)/);
    assert.match(ui, /persistenceOk/);
    assert.match(ui, /Current Notes/);

    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaAppendInteraction/);
    assert.match(page, /PersonaAppendInteractionTracked/);
  });

  it("creates the Append Interaction route", () => {
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/updates/route.ts")),
      true,
    );
  });
});
