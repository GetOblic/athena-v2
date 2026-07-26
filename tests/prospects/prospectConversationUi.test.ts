/**
 * Focused UI/source-contract tests for Athena V10 Prospect Conversation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProspectConversationPanel } from "../../components/prospects/ProspectConversationPanel";
import {
  buildDeploymentAssetCards,
  DeploymentAssets,
} from "../../components/deployment/DeploymentAssets";
import { StrategicAssetBlueprint } from "../../components/assetBlueprints/StrategicAssetBlueprint";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import { BLUEPRINT_ASSET_TYPES } from "../../services/assetInteractions/assetInteractionKeys";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
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

describe("prospect conversation UI placement", () => {
  it("panel is collapsed by default", () => {
    const html = renderToStaticMarkup(
      createElement(ProspectConversationPanel, {
        prospectId: "p1",
        executiveVersionId: null,
        versionState: "none",
        versionLabel: null,
      }),
    );
    assert.match(html, /Ask Athena About This Prospect/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /Conversation responses do not modify/);
  });

  it("panel is mounted through afterBlueprint slot in workspace", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /ProspectConversationPanel/);
    assert.match(workspace, /prospectConversationSlot/);
    // Rendered in the afterBlueprint position (before Source Context grid).
    const slotIndex = workspace.indexOf("{prospectConversationSlot}");
    const afterBlueprintIndex = workspace.lastIndexOf("{afterBlueprint}");
    const sourceContextIndex = workspace.lastIndexOf('title={sourceContextTitle}');
    assert.ok(slotIndex > 0);
    assert.ok(afterBlueprintIndex > slotIndex);
    assert.ok(sourceContextIndex > afterBlueprintIndex);
  });

  it("existing Deployment Assets and Strategic Blueprint remain rendered", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /DeploymentAssets/);
    assert.match(workspace, /StrategicAssetBlueprint/);
    assert.match(workspace, /title="Deployment Assets"/);
    assert.match(workspace, /title="Strategic Asset Blueprint"/);

    const cards = buildDeploymentAssetCards(
      [
        {
          assetKey: "newsletter_idea",
          title: "Newsletter Idea",
          objective: "Newsletter",
          content: "Body",
        },
      ],
      "version-1",
    );
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
      }),
    );
    assert.match(deploymentHtml, /Newsletter Idea/);
    assert.equal(cards[0]?.key, "version-1:newsletter_idea");

    const blueprintHtml = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, { blueprint }),
    );
    assert.match(blueprintHtml, /Strategic Asset Blueprint/);
    assert.match(blueprintHtml, /Image Prompt/);
  });

  it("Discuss actions pass identifiers only", () => {
    const deployment = read("components/deployment/DeploymentAssets.tsx");
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    const blueprintSource = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );

    assert.match(block, /Discuss with Athena/);
    assert.match(block, /assetKind/);
    assert.match(block, /assetKey/);
    assert.doesNotMatch(
      block,
      /onDiscussWithAthena\?\.\(\{[\s\S]*content:/,
    );

    assert.match(deployment, /onDiscussWithAthena/);
    assert.match(deployment, /executiveVersionId/);
    assert.match(deployment, /Identifiers only/);

    assert.match(blueprintSource, /BLUEPRINT_ASSET_TYPES/);
    assert.match(blueprintSource, /discussAssetKind=\{discussEnabled \? "blueprint"/);
    assert.doesNotMatch(blueprintSource, /image_prompt:\s*imagePromptText/);
  });

  it("switching Executive Versions switches conversation scope", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(
      panel,
      /key=\{`prospect-conversation-\$\{props\.prospectId\}-\$\{props\.executiveVersionId \?\? "no-version"\}`\}/,
    );
    assert.match(panel, /readProspectConversationSession/);
    assert.match(workspace, /setConversationAssetReference\(null\)/);
  });

  it("changing asset target does not mutate message history in discuss handler", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const handlerStart = workspace.indexOf("function handleDiscussWithAthena");
    const handler = workspace.slice(handlerStart, handlerStart + 700);
    assert.match(handler, /setConversationAssetReference/);
    assert.match(handler, /Identifiers only/);
    assert.doesNotMatch(handler, /setMessages/);
  });

  it("duplicate sends are prevented while busy", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /if \(!trimmed \|\| busy\)/);
    assert.match(panel, /disabled=\{busy \|\| !draft\.trim\(\)\}/);
    assert.match(panel, /requestSeqRef/);
    assert.match(panel, /AbortController/);
  });

  it("unmount aborts in-flight requests and clear resets asset target", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /abortRef\.current\?\.abort\(\)/);
    assert.match(
      panel,
      /return \(\) => \{\s*abortRef\.current\?\.abort\(\);/,
    );
    const clearStart = panel.indexOf("function clearConversation");
    const clearFn = panel.slice(clearStart, clearStart + 500);
    assert.match(clearFn, /setMessages\(\[\]\)/);
    assert.match(clearFn, /setAssetReference\(null\)/);
    assert.match(clearFn, /clearProspectConversationSession/);
  });

  it("workspace supplies selected Executive Version identity to the panel", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /executiveVersionId=\{viewModel\.executiveVersionId\}/);
    assert.match(workspace, /versionState=\{conversationVersionState\}/);
    assert.match(workspace, /handleDiscussWithAthena/);
  });

  it("AthenaCollapsibleSection supports controlled open for Discuss coordination", () => {
    const section = read("components/ui/AthenaCollapsibleSection.tsx");
    assert.match(section, /open\?: boolean/);
    assert.match(section, /onOpenChange\?:/);
    assert.match(section, /isControlled/);
  });

  it("blueprint discuss uses canonical asset types", () => {
    assert.equal(
      BLUEPRINT_ASSET_TYPES.image_prompt,
      "blueprint_image_prompt",
    );
    const html = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, {
        blueprint,
        copyContext: {
          sourceType: "prospect",
          sourceId: "p1",
          executiveVersionId: "v1",
        },
        onDiscussWithAthena: () => undefined,
      }),
    );
    assert.match(html, /Discuss with Athena/);
  });
});

describe("prospect conversation version behavior source contracts", () => {
  it("context assembler uses selected Executive Version snapshot getters", () => {
    const context = read(
      "services/prospectConversation/prospectConversationContext.ts",
    );
    assert.match(context, /getExecutiveVersionById/);
    assert.match(context, /loadLiveExecutiveIntelligence/);
    assert.match(context, /version\.intelligence/);
    assert.match(context, /Asset references require a selected Executive Version/);
    // Does not call publication/restore APIs.
    assert.doesNotMatch(context, /publishExecutiveIntelligenceVersion/);
    assert.doesNotMatch(context, /restoreExecutive/);
  });

  it("foreign prospect / version isolation is organization-scoped", () => {
    const route = read("app/api/prospects/[id]/conversation/route.ts");
    const context = read(
      "services/prospectConversation/prospectConversationContext.ts",
    );
    assert.match(route, /getProspectById\(id,\s*organizationId\)/);
    assert.match(
      context,
      /getExecutiveVersionById\(\s*requestedVersionId,\s*discussionId,\s*organizationId/,
    );
  });
});
