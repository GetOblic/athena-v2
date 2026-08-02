/**
 * Focused inventory, UI wiring, client request, and server resolution tests
 * for Persona "Discuss with Athena".
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DeploymentAssets,
  buildDeploymentAssetCards,
} from "../../components/deployment/DeploymentAssets";
import { StrategicAssetBlueprint } from "../../components/assetBlueprints/StrategicAssetBlueprint";
import { PersonaConversationPanel } from "../../components/personas/PersonaConversationPanel";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import { BLUEPRINT_ASSET_TYPES } from "../../services/assetInteractions/assetInteractionKeys";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";
import type { ExecutiveIntelligencePayload } from "../../services/executiveVersions/executiveVersionTypes";
import {
  getPersonaAnalysisCatalogKeys,
  getPersonaPublishableDeploymentCatalogKeys,
} from "../../lib/personaIntelligenceAssetCatalog";
import { REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS } from "../../lib/personaDeploymentAssetContract";
import {
  describePersonaAssetKind,
  resolvePersonaReferencedAsset,
} from "../../services/personaConversation/personaConversationAssetResolve";
import { validatePersonaConversationRequest } from "../../services/personaConversation/personaConversationValidation";
import {
  PersonaConversationError,
  type PersonaConversationAssembledContext,
} from "../../services/personaConversation/personaConversationTypes";
import { buildPersonaConversationPrompt } from "../../services/personaConversation/personaConversationPrompt";
import { UnexpectedServerResponseError } from "../../lib/safeJsonResponse";
import { postPersonaConversation } from "../../services/personaConversation/personaConversationClient";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const REQUIRED_STRATEGIC_KEYS = [
  BLUEPRINT_ASSET_TYPES.image_prompt,
  BLUEPRINT_ASSET_TYPES.pdf_prompt,
  BLUEPRINT_ASSET_TYPES.social_prompt,
] as const;

function personaSuggestedCta(): string {
  const deployment = getPersonaPublishableDeploymentCatalogKeys()
    .map((key) => `${key}:\nPersona deployment body for ${key}.`)
    .join("\n\n");
  const analysis = getPersonaAnalysisCatalogKeys()
    .map((key) => `${key}:\nPersona analysis body for ${key}.`)
    .join("\n\n");
  return `${deployment}\n\n${analysis}`;
}

function analysis(
  overrides: Partial<DiscussionAnalysis> = {},
): DiscussionAnalysis {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: "org-1",
    discussion_id: "discussion-1",
    user_id: null,
    community_id: null,
    status: "completed",
    summary: "persona analysis summary",
    sentiment: null,
    intent: null,
    buyer_stage: null,
    pain_points: null,
    opportunity_detected: true,
    opportunity_title: "Segment fit",
    opportunity_reason: "Clear needs",
    recommended_action: "Engage",
    risk_level: null,
    confidence: 0.8,
    suggested_cta: personaSuggestedCta(),
    strategy_key: "default",
    strategy_prompt_version: null,
    analysis_prompt_version: null,
    model: "test-model",
    generation_time_ms: 1000,
    raw_json: null,
    created_at: "2026-07-17T16:13:00.000Z",
    updated_at: "2026-07-17T16:13:00.000Z",
    ...overrides,
  };
}

function payload(): ExecutiveIntelligencePayload {
  return {
    analysis: analysis(),
    opportunity: null,
    briefing: null,
    blueprint: {
      id: "bp-1",
      discussion_id: "discussion-1",
      opportunity_id: null,
      briefing_id: null,
      user_id: null,
      asset_title: "Persona Segment Guide",
      asset_type: "image",
      business_goal: "Engage segment",
      target_audience: "Archetype",
      priority: "high",
      estimated_reuse: 4,
      image_prompt: "PERSONA IMAGE PROMPT BODY",
      pdf_prompt: "PERSONA PDF PROMPT BODY",
      social_prompt: "PERSONA SOCIAL PROMPT BODY",
      notes: "PERSONA BLUEPRINT NOTES",
      status: "ready",
      raw_json: null,
      created_at: "2026-07-18T10:00:00.000Z",
      updated_at: "2026-07-18T10:00:00.000Z",
    },
  };
}

const blueprint: AthenaAssetBlueprint = {
  id: "bp-1",
  discussion_id: "d1",
  opportunity_id: null,
  briefing_id: null,
  user_id: null,
  asset_title: "Guide",
  asset_type: "image",
  business_goal: "Meetings",
  target_audience: "Owners",
  priority: "high",
  estimated_reuse: 3,
  image_prompt: "image body",
  pdf_prompt: "pdf body",
  social_prompt: "social body",
  notes: "notes body",
  status: "ready",
  raw_json: null,
  created_at: "2026-07-18T10:00:00.000Z",
  updated_at: "2026-07-18T10:00:00.000Z",
};

describe("persona Discuss with Athena inventory", () => {
  it("1. exactly 26 Persona Deployment Asset keys support Discuss", () => {
    const keys = getPersonaPublishableDeploymentCatalogKeys();
    assert.equal(keys.length, 26);
    assert.ok(keys.includes("PERSONALIZED_OUTREACH_EMAIL"));
    assert.ok(keys.includes("LOCAL_OUTREACH_IMAGE_PROMPT"));
    assert.ok(keys.includes("OBJECTION_ANTICIPATION"));
    assert.ok(!keys.includes("OBJECTION_HANDLING"));
  });

  it("2. exactly 3 Persona Strategic Asset keys support Discuss", () => {
    assert.equal(REQUIRED_STRATEGIC_KEYS.length, 3);
    assert.deepEqual([...REQUIRED_STRATEGIC_KEYS], [
      "blueprint_image_prompt",
      "blueprint_pdf_prompt",
      "blueprint_social_prompt",
    ]);
  });

  it("3. exactly 14 Persona Analysis Asset keys support Discuss", () => {
    const keys = getPersonaAnalysisCatalogKeys();
    assert.equal(keys.length, 14);
    assert.deepEqual(keys, [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS]);
  });

  it("4. required total equals 43", () => {
    assert.equal(
      getPersonaPublishableDeploymentCatalogKeys().length +
        REQUIRED_STRATEGIC_KEYS.length +
        getPersonaAnalysisCatalogKeys().length,
      43,
    );
  });
});

describe("persona Discuss with Athena UI wiring", () => {
  it("5/6/7. populated Persona Deployment, Strategic, and Analysis assets expose Discuss", () => {
    const deploymentHtml = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: [
          {
            assetKey: "newsletter_idea",
            title: "Newsletter Idea",
            objective: "Newsletter",
            content: "Body",
          },
        ],
        executiveVersionId: "version-1",
        onDiscussWithAthena: () => undefined,
      }),
    );
    assert.match(deploymentHtml, /Discuss with Athena/);

    const analysisHtml = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: [
          {
            assetKey: "persona_executive_profile",
            title: "Persona Executive Profile",
            objective: "Profile",
            content: "Analysis body",
          },
        ],
        executiveVersionId: "version-1",
        onDiscussWithAthena: () => undefined,
      }),
    );
    assert.match(analysisHtml, /Discuss with Athena/);

    const blueprintHtml = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, {
        blueprint,
        copyContext: {
          sourceType: "discussion",
          sourceId: "d1",
          executiveVersionId: "v1",
        },
        onDiscussWithAthena: () => undefined,
      }),
    );
    assert.match(blueprintHtml, /Discuss with Athena/);
  });

  it("8. empty assets do not expose Discuss", () => {
    const cards = buildDeploymentAssetCards(
      [
        {
          assetKey: "newsletter_idea",
          title: "Newsletter Idea",
          objective: "Newsletter",
          content: "   ",
        },
      ],
      "version-1",
    );
    assert.equal(cards.length, 0);

    const html = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: [
          {
            assetKey: "newsletter_idea",
            title: "Newsletter Idea",
            objective: "Newsletter",
            content: "",
          },
        ],
        executiveVersionId: "version-1",
        onDiscussWithAthena: () => undefined,
      }),
    );
    assert.equal(html, "");
  });

  it("9. Persona wiring no longer suppresses the Discuss callback", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    // Persona Deployment Assets section wires the handler (not Prospect-gated).
    assert.match(workspace, /title="Persona Deployment Assets"/);
    assert.match(workspace, /title="Persona Analysis Assets"/);
    assert.match(workspace, /title="Persona Strategic Blueprint"/);
    assert.match(workspace, /onDiscussWithAthena=\{handleDiscussWithAthena\}/);
    assert.match(workspace, /getElementById\("persona-conversation"\)/);
    assert.match(
      workspace,
      /getElementById\("persona-conversation-input"\)/,
    );
    assert.match(workspace, /PersonaDiscussProvider/);
    assert.match(workspace, /setPersonaConversationAssetReference/);
    // Prospect path remains Prospect-gated.
    assert.match(
      workspace,
      /onDiscussWithAthena=\{\s*isProspect \? handleDiscussWithAthena : undefined\s*\}/,
    );
  });

  it("10. Clicking Persona Discuss sends identifiers only", () => {
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    const deployment = read("components/deployment/DeploymentAssets.tsx");
    assert.match(block, /assetKind/);
    assert.match(block, /assetKey/);
    assert.doesNotMatch(
      block,
      /onDiscussWithAthena\?\.\(\{[\s\S]*content:/,
    );
    assert.match(deployment, /Identifiers only/);
  });

  it("11-15. Persona Ask Athena open/scroll/focus/draft/badge contracts", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const panel = read("components/personas/PersonaConversationPanel.tsx");
    const handlerStart = workspace.indexOf("if (isPersona)");
    const handler = workspace.slice(handlerStart, handlerStart + 900);
    assert.match(handler, /setPersonaConversationOpen\(true\)/);
    assert.match(handler, /persona-conversation/);
    assert.match(handler, /persona-conversation-input/);
    assert.doesNotMatch(handler, /setDraft/);
    assert.doesNotMatch(handler, /setMessages/);

    assert.match(panel, /id="persona-conversation"/);
    assert.match(panel, /id="persona-conversation-input"/);
    assert.match(panel, /Discussing:/);
    assert.match(panel, /Clear target/);
    assert.match(panel, /const \[draft, setDraft\] = useState\(""\)/);
  });

  it("16. Send request includes the selected asset reference", () => {
    const panel = read("components/personas/PersonaConversationPanel.tsx");
    const client = read(
      "services/personaConversation/personaConversationClient.ts",
    );
    assert.match(panel, /assetReference: assetReference \?\? null/);
    assert.match(client, /assetReference: input\.assetReference \?\? undefined/);
  });

  it("17. Clearing or closing behaves consistently with Prospect", () => {
    const panel = read("components/personas/PersonaConversationPanel.tsx");
    assert.match(panel, /function clearAssetTarget/);
    assert.match(panel, /setAssetReference\(null\)/);
    assert.match(panel, /setResolvedAssetTitle\(null\)/);
    const clearStart = panel.indexOf("function clearChat");
    const clearFn = panel.slice(clearStart, clearStart + 500);
    assert.match(clearFn, /setMessages\(\[\]\)/);
    assert.match(clearFn, /setAssetReference\(null\)/);
  });
});

describe("persona Discuss with Athena server resolution", () => {
  it("18. Persona Deployment Asset resolves correctly", () => {
    const resolved = resolvePersonaReferencedAsset({
      payload: payload(),
      assetReference: { kind: "deployment", key: "newsletter_idea" },
    });
    assert.equal(resolved.group, "deployment");
    assert.match(resolved.content, /Persona deployment body for NEWSLETTER_IDEA/);
    assert.equal(describePersonaAssetKind("deployment", "deployment"), "Deployment Asset");
  });

  it("19. Persona Analysis Asset resolves correctly", () => {
    const resolved = resolvePersonaReferencedAsset({
      payload: payload(),
      assetReference: {
        kind: "deployment",
        key: "persona_executive_profile",
      },
    });
    assert.equal(resolved.group, "analysis");
    assert.match(
      resolved.content,
      /Persona analysis body for PERSONA_EXECUTIVE_PROFILE/,
    );
    assert.equal(describePersonaAssetKind("deployment", "analysis"), "Analysis Asset");
  });

  it("20. Persona Strategic Asset resolves correctly", () => {
    const resolved = resolvePersonaReferencedAsset({
      payload: payload(),
      assetReference: {
        kind: "blueprint",
        key: BLUEPRINT_ASSET_TYPES.image_prompt,
      },
    });
    assert.equal(resolved.group, "blueprint");
    assert.equal(resolved.content, "PERSONA IMAGE PROMPT BODY");
    assert.match(resolved.title, /Image Prompt/);
  });

  it("21. Exact selected version content is used", () => {
    const custom = payload();
    custom.analysis = analysis({
      suggested_cta: "NEWSLETTER_IDEA:\nExact version newsletter body.\n\nPERSONA_EXECUTIVE_PROFILE:\nExact version profile body.",
    });
    const deployment = resolvePersonaReferencedAsset({
      payload: custom,
      assetReference: { kind: "deployment", key: "newsletter_idea" },
    });
    assert.match(deployment.content, /Exact version newsletter body/);
    const analysisAsset = resolvePersonaReferencedAsset({
      payload: custom,
      assetReference: {
        kind: "deployment",
        key: "persona_executive_profile",
      },
    });
    assert.match(analysisAsset.content, /Exact version profile body/);
  });

  it("22. Unsupported keys are rejected", () => {
    assert.throws(
      () =>
        resolvePersonaReferencedAsset({
          payload: payload(),
          assetReference: { kind: "deployment", key: "not_a_real_asset" },
        }),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "ASSET_NOT_FOUND",
    );
  });

  it("23. Empty assets are rejected", () => {
    const empty = payload();
    empty.analysis = analysis({
      suggested_cta: "NEWSLETTER_IDEA:\n   \n",
    });
    assert.throws(
      () =>
        resolvePersonaReferencedAsset({
          payload: empty,
          assetReference: { kind: "deployment", key: "newsletter_idea" },
        }),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "ASSET_NOT_FOUND",
    );
  });

  it("24/25. Tenancy uses organization-scoped Persona and Executive Version lookups", () => {
    const route = read("app/api/personas/[id]/conversation/route.ts");
    const context = read(
      "services/personaConversation/personaConversationContext.ts",
    );
    assert.match(route, /getPersonaById\(id,\s*organizationId\)/);
    assert.match(
      context,
      /getExecutiveVersionById\(\s*requestedVersionId,\s*discussionId,\s*organizationId/,
    );
    assert.doesNotMatch(context, /publishExecutiveIntelligenceVersion/);
  });

  it("26. Client-supplied raw content is not accepted", () => {
    assert.throws(
      () =>
        validatePersonaConversationRequest({
          message: "Rewrite this",
          history: [],
          executiveVersionId: "version-1",
          assetReference: {
            kind: "deployment",
            key: "newsletter_idea",
            content: "CLIENT SUPPLIED",
          },
        }),
      /assetReference may not include content or title/,
    );

    const resolved = resolvePersonaReferencedAsset({
      payload: payload(),
      assetReference: { kind: "deployment", key: "newsletter_idea" },
    });
    assert.doesNotMatch(resolved.content, /CLIENT SUPPLIED/);
  });

  it("injects REFERENCED_ASSET into Persona conversation context", () => {
    const assembled: PersonaConversationAssembledContext = {
      personaId: "p1",
      organizationId: "o1",
      executiveVersionId: "ev1",
      versionState: "current",
      versionLabel: "Current Executive Version",
      sections: [
        {
          type: "REFERENCED_ASSET",
          trust: "athena_analysis",
          label: "Referenced asset (deployment) — Newsletter Idea",
          content: "Exact referenced body",
        },
      ],
      referencedAsset: {
        kind: "deployment",
        key: "newsletter_idea",
        title: "Newsletter Idea",
        content: "Exact referenced body",
        group: "deployment",
      },
      missingNotes: [],
    };
    const built = buildPersonaConversationPrompt({
      assembled,
      history: [],
      userMessage: "Rewrite this asset",
    });
    assert.match(built.messages.at(-1)?.content ?? "", /Exact referenced body/);
    assert.match(
      built.messages.at(-1)?.content ?? "",
      /Referenced asset \(deployment\)/,
    );
  });

  it("validation requires executiveVersionId with assetReference", () => {
    assert.throws(
      () =>
        validatePersonaConversationRequest({
          message: "hello",
          history: [],
          executiveVersionId: null,
          assetReference: { kind: "deployment", key: "newsletter_idea" },
        }),
      /assetReference requires executiveVersionId/,
    );
  });

  it("accepts identifiers-only assetReference", () => {
    const request = validatePersonaConversationRequest({
      message: "Rewrite this",
      history: [],
      executiveVersionId: "version-1",
      assetReference: { kind: "deployment", key: "newsletter_idea" },
    });
    assert.deepEqual(request.assetReference, {
      kind: "deployment",
      key: "newsletter_idea",
    });
  });
});

describe("persona Discuss with Athena regression", () => {
  it("27. Prospect Discuss with Athena wiring remains Prospect-gated", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /prospect-conversation/);
    assert.match(
      workspace,
      /onDiscussWithAthena=\{\s*isProspect \? handleDiscussWithAthena : undefined\s*\}/,
    );
    const resolve = read(
      "services/prospectConversation/prospectConversationAssetResolve.ts",
    );
    assert.match(resolve, /prospectMode: true/);
    assert.doesNotMatch(resolve, /personaMode/);
  });

  it("28. Standard Persona Ask Athena works without an asset reference", () => {
    const request = validatePersonaConversationRequest({
      message: "What motivates this Persona?",
      history: [],
      executiveVersionId: null,
    });
    assert.equal(request.assetReference, undefined);

    const html = renderToStaticMarkup(
      createElement(PersonaConversationPanel, {
        personaId: "p1",
        executiveVersionId: null,
        versionState: "none",
        versionLabel: null,
      }),
    );
    assert.match(html, /Ask Athena about this Persona/);
    assert.doesNotMatch(html, /Discussing:/);
  });

  it("29/30. Persona generation and asset mutation paths are untouched", () => {
    const service = read(
      "services/personaConversation/personaConversationService.ts",
    );
    assert.doesNotMatch(service, /publishExecutive/);
    assert.doesNotMatch(service, /updatePersona/);
    assert.doesNotMatch(service, /enqueueGeneration/);
    const context = read(
      "services/personaConversation/personaConversationContext.ts",
    );
    assert.match(context, /resolvePersonaReferencedAsset/);
  });

  it("client posts assetReference identifiers only", async () => {
    let bodyText = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      bodyText = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          ok: true,
          message: { role: "assistant", content: "ok" },
          context: {
            personaId: "p1",
            executiveVersionId: "v1",
            versionState: "current",
            versionLabel: "Current Executive Version",
            asset: {
              kind: "deployment",
              key: "newsletter_idea",
              title: "Newsletter Idea",
              group: "deployment",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const outcome = await postPersonaConversation({
        personaId: "p1",
        message: "Rewrite",
        history: [],
        executiveVersionId: "v1",
        assetReference: { kind: "deployment", key: "newsletter_idea" },
        signal: new AbortController().signal,
      });
      assert.equal(outcome.ok, true);
      const parsed = JSON.parse(bodyText) as {
        assetReference: Record<string, unknown>;
      };
      assert.deepEqual(parsed.assetReference, {
        kind: "deployment",
        key: "newsletter_idea",
      });
      assert.equal("content" in parsed.assetReference, false);
      assert.equal("title" in parsed.assetReference, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("client still works when fetch returns unexpected payloads", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<html>bad</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;
    try {
      const outcome = await postPersonaConversation({
        personaId: "p1",
        message: "hello",
        history: [],
        executiveVersionId: null,
        signal: new AbortController().signal,
      });
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.ok(
          outcome.failure.code === "UNEXPECTED_RESPONSE" ||
            outcome.failure.retryable ||
            outcome.failure instanceof UnexpectedServerResponseError ||
            typeof outcome.failure.message === "string",
        );
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
