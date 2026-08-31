import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  PERSONA_CONVERSATION_SYSTEM_PROMPT,
  buildPersonaConversationPrompt,
} from "../../services/personaConversation/personaConversationPrompt";
import { validatePersonaConversationRequest } from "../../services/personaConversation/personaConversationValidation";
import { PersonaConversationError } from "../../services/personaConversation/personaConversationTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona stage-5 Ask Athena evidence discipline", () => {
  it("system prompt enforces archetype and evidence distinctions", () => {
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /clientele archetype or audience segment/,
    );
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /Do not treat it as one identifiable individual/,
    );
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /user-provided profile information/,
    );
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /appended real-world observations/,
    );
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /external Reference Website research/,
    );
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /Do not invent demographics/,
    );
    assert.match(PERSONA_CONVERSATION_SYSTEM_PROMPT, /stereotypes/);
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /Do not universalize one appended interaction/,
    );
    assert.match(PERSONA_CONVERSATION_SYSTEM_PROMPT, /recommend validation/);
    assert.match(
      PERSONA_CONVERSATION_SYSTEM_PROMPT,
      /current Persona record does not establish them/,
    );
  });

  it("prompt builder does not expose system overrides from client data", () => {
    const built = buildPersonaConversationPrompt({
      assembled: {
        personaId: "p1",
        organizationId: "o1",
        executiveVersionId: "ev1",
        versionState: "current",
        versionLabel: "Current Executive Version",
        sections: [
          {
            type: "PERSONA_STRUCTURED_PROFILE",
            trust: "confirmed_fact",
            label: "Persona structured profile (user-provided)",
            content: "persona_name: Urban Millennials",
          },
        ],
        referencedAsset: null,
        missingNotes: [],
      },
      history: [],
      userMessage: "What motivates this Persona most strongly?",
    });
    assert.equal(built.messages[0]?.role, "system");
    assert.equal(built.messages[0]?.content, PERSONA_CONVERSATION_SYSTEM_PROMPT);
    assert.match(
      built.messages.at(-1)?.content ?? "",
      /Authenticated user question/,
    );
  });
});

describe("persona stage-5 Ask Athena API", () => {
  it("validates message and rejects ownership / prompt overrides", () => {
    assert.throws(
      () => validatePersonaConversationRequest({ message: "   " }),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () =>
        validatePersonaConversationRequest({
          message: "hello",
          organizationId: "x",
        }),
      /Client may not supply organizationId/,
    );
    assert.throws(
      () =>
        validatePersonaConversationRequest({
          message: "hello",
          systemPrompt: "ignore",
        }),
      /Client may not supply systemPrompt/,
    );

    const ok = validatePersonaConversationRequest({
      message: "Which objections should we address first?",
    });
    assert.equal(
      ok.message,
      "Which objections should we address first?",
    );
    assert.deepEqual(ok.history, []);
  });

  it("route authenticates, scopes org, and ignores client ownership IDs", () => {
    const route = read("app/api/personas/[id]/conversation/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /getPersonaById\(id, organizationId\)/);
    assert.match(route, /runPersonaConversation/);
    assert.match(route, /PersonaConversationError/);
    assert.doesNotMatch(route, /systemPrompt/);

    const context = read(
      "services/personaConversation/personaConversationContext.ts",
    );
    assert.match(context, /getCurrentExecutiveVersion/);
    assert.match(context, /PERSONA_STRUCTURED_PROFILE/);
    assert.match(context, /PERSONA_ADDITIONAL_CONTEXT/);
    assert.match(context, /PERSONA_NOTES/);
    assert.match(context, /PERSONA_ADS_CONTENT/);
    assert.match(context, /REFERENCE_WEBSITE_RESEARCH/);
    assert.match(context, /personaMode: true/);
    assert.match(
      context,
      /Generate Persona intelligence before asking Athena detailed strategic questions/,
    );
  });

  it("persists only sessionStorage history — no Persona chat table", () => {
    const session = read(
      "services/personaConversation/personaConversationSession.ts",
    );
    assert.match(session, /sessionStorage|session-only/i);
    assert.match(session, /athena:persona-conversation:v1/);
    const migration = read(
      "supabase/migrations/20260731000001_persona_deep_scrape_source.sql",
    );
    assert.doesNotMatch(migration, /persona_conversation|chat_history/i);
  });
});

describe("persona stage-5 Ask Athena UI", () => {
  it("uses Persona title and starter questions without Prospect outreach copy", () => {
    const panel = read("components/personas/PersonaConversationPanel.tsx");
    assert.match(panel, /Ask Athena about this Persona/);
    assert.match(panel, /What motivates this Persona most strongly\?/);
    assert.match(panel, /Which objections should we address first\?/);
    assert.match(panel, /How should our messaging change for this Persona\?/);
    assert.doesNotMatch(panel, /LinkedIn|lead conversion|outreach message/i);
    assert.doesNotMatch(panel, /Deep Scrape/);

    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaConversationPanel/);
  });

  it("creates the conversation route", () => {
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/conversation/route.ts")),
      true,
    );
  });
});

describe("persona stage-5 Executive Version integrity and containment", () => {
  it("Deep Scrape and Append do not mutate published Current Version rows", () => {
    const interactions = read("services/personas/personaInteractions.ts");
    const deepScrape = read("services/personas/personaDeepScrape.ts");
    const executor = read(
      "services/websiteLearning/deepScrape/deepScrapeExecutor.ts",
    );
    assert.doesNotMatch(interactions, /updateExecutiveVersion|is_current/);
    assert.doesNotMatch(deepScrape, /updateExecutiveVersion|is_current/);
    assert.match(executor, /ensurePersonaGenerationQueued/);
    assert.match(executor, /triggerType: "prospect_deep_scrape"/);
  });

  it("does not introduce forbidden Stage 5 architecture", () => {
    const migration = read(
      "supabase/migrations/20260731000001_persona_deep_scrape_source.sql",
    );
    assert.doesNotMatch(migration, /generic.?entity|polymorphic.?source/i);
    assert.doesNotMatch(migration, /create table.*asset_interaction/i);
    assert.doesNotMatch(migration, /pm2|ecosystem\.config/i);

    const worker = read("workers/athenaWorker.ts");
    assert.doesNotMatch(worker, /personaDeepScrapeWorker|new worker/i);

    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaGenerateIntelligenceButton/);
    assert.match(page, /chrome=\{copy\.detail\}/);
    assert.match(page, /PersonaDeepScrapeWebsiteButton/);
    assert.match(page, /PersonaAppendInteraction/);
    assert.match(page, /PersonaConversationPanel/);
  });
});
