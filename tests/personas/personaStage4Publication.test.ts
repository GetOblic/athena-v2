import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS } from "../../lib/personaDeploymentAssetContract";
import { REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "../../lib/prospectDeploymentAssetContract";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona stage-4 prompt assembly", () => {
  it("selects Persona branch independently of Prospect and ordinary Discussion", () => {
    const assembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    const required = read(
      "services/brain/generationContracts/deploymentAssetsRequiredOutput.ts",
    );

    assert.match(assembly, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(assembly, /isPersonaSource/);
    assert.match(assembly, /DEPLOYMENT ASSETS \(PERSONA\)/);
    assert.match(assembly, /DEPLOYMENT ASSETS \(PROSPECT\)/);
    assert.match(assembly, /archetype or audience segment/);
    assert.match(assembly, /Reference Website is owned by the Persona/);
    assert.match(assembly, /Do not invent demographic certainty/);
    const personaQuality =
      assembly.split("DEPLOYMENT ASSETS (PERSONA)")[1]?.split("SHARED_OUTPUT")[0] ??
      "";
    assert.doesNotMatch(personaQuality, /LINKEDIN_PROSPECT_ASSET_GENERATION_RULES/);
    assert.doesNotMatch(personaQuality, /200-character/);
    assert.match(personaQuality, /one-to-one cold outreach assets/);

    assert.match(required, /isPersonaSource/);
    assert.match(required, /getPersonaDeploymentGenerationHeadings/);
    assert.match(required, /REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS/);
    assert.match(required, /REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS/);

    const constraints = read(
      "services/ai/prompts/personaDeploymentAssetsConstraints.ts",
    );
    for (const key of REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS) {
      assert.match(constraints, new RegExp(`${key}:`));
    }
    for (const key of REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS) {
      assert.doesNotMatch(constraints, new RegExp(`^${key}:`, "m"));
    }
  });
});

describe("persona stage-4 Strategic Blueprint adaptation", () => {
  it("adds Persona context without altering Prospect Blueprint path", () => {
    const prompt = read(
      "services/brain/generationContracts/generationPromptAssembly.ts",
    );
    assert.match(prompt, /PERSONA STRATEGIC BLUEPRINT CONTEXT/);
    assert.match(prompt, /persona_intelligence/);
    assert.match(prompt, /not an identifiable individual/);
    assert.match(prompt, /Reference Website is owned by the Persona/);
    assert.match(prompt, /cheap validation actions/);
    assert.match(prompt, /withPersonaBlueprintContext/);
  });
});

describe("persona stage-4 publication and executor", () => {
  it("wires Persona completeness through workflow, publish, and executor Ready", () => {
    const workflow = read("services/workflows/discussionWorkflow.ts");
    const td = read("services/workflows/thinkDifferentlyWorkflow.ts");
    const da = read("services/workflows/deploymentAssetsWorkflow.ts");
    const ev = read("services/executiveVersions/executiveVersionService.ts");
    const executor = read("services/generationJobs/generationJobExecutor.ts");
    const importer = read("services/personas/personaImporter.ts");
    const errors = read("services/generationJobs/generationJobErrors.ts");

    assert.match(workflow, /isPersonaIntelligenceBridge/);
    assert.match(workflow, /requirePersonaCompleteness: isPersona/);
    assert.match(workflow, /requireProspectCompleteness: isProspect/);
    assert.match(workflow, /Strategic Blueprint missing before Persona publication/);

    assert.match(td, /requirePersonaCompleteness/);
    assert.match(td, /requireProspectCompleteness: isProspectIntelligenceBridge/);

    assert.match(da, /unwrapPersonaDeploymentAssetResponse/);
    assert.match(da, /IncompletePersonaDeploymentAssetsError/);
    assert.match(da, /unwrapProspectDeploymentAssetResponse/);

    assert.match(ev, /assertPersonaPublicationCandidate/);
    assert.match(ev, /requirePersonaCompleteness/);
    assert.match(ev, /isPersonaIntelligenceBridge\(discussion\)/);

    assert.match(executor, /markPersonaGenerationReady/);
    assert.doesNotMatch(executor, /markPersonaGenerationAnalysisComplete/);
    assert.match(
      executor,
      /Persona generation did not publish a complete Current Version/,
    );
    assert.match(
      executor,
      /Prospect generation did not publish a complete Current Version/,
    );

    assert.match(importer, /status: "Ready"/);
    assert.match(importer, /progress: options\?\.progress/);
    assert.doesNotMatch(importer, /status: "Analysis Generated"/);

    assert.match(errors, /IncompletePersonaDeploymentAssetsError/);
    assert.match(errors, /IncompletePersonaPublicationError/);
    assert.match(errors, /incomplete persona/i);
  });
});

describe("persona stage-4 workspace and Think Differently", () => {
  it("supports sourceKind persona with Persona labels and TD route", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const card = read("components/discussions/ExecutiveIntelligenceCard.tsx");
    const page = read("app/personas/[id]/page.tsx");
    const button = read(
      "components/personas/PersonaGenerateIntelligenceButton.tsx",
    );
    const display = read("services/personas/personaDisplay.ts");
    const selection = read(
      "services/executiveVersions/executiveVersionSelection.ts",
    );

    assert.match(workspace, /sourceKind\?: "discussion" \| "prospect" \| "persona"/);
    assert.match(workspace, /Persona Assessment/);
    assert.match(workspace, /Persona Deployment Assets/);
    assert.match(workspace, /Persona Strategic Blueprint/);
    assert.doesNotMatch(
      workspace.split('sourceKind === "persona"')[0] ?? "",
      /Ask Athena/,
    );

    assert.match(card, /Persona Assessment/);
    assert.match(page, /sourceKind="persona"/);
    assert.match(page, /ExecutiveIntelligenceWorkspace/);
    assert.doesNotMatch(
      page,
      /will be connected in the next implementation stage/,
    );

    assert.match(button, /think-differently/);
    assert.match(button, /hasCurrentExecutiveVersion/);
    assert.match(button, /Think Differently/);

    assert.match(display, /"Ready"/);
    assert.match(display, /hasCurrentExecutiveVersion/);
    assert.doesNotMatch(
      display,
      /never display Prospect Ready|map accidental Ready/,
    );

    assert.match(selection, /personaMode/);
    assert.match(selection, /"persona"/);

    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/think-differently/route.ts")),
      true,
    );
    const tdRoute = read("app/api/personas/[id]/think-differently/route.ts");
    assert.match(tdRoute, /buildThinkDifferentlyJobProgress/);
    assert.match(tdRoute, /getCurrentExecutiveVersion/);
    assert.match(tdRoute, /NO_CURRENT_VERSION/);
  });
});

describe("persona stage-4 containment", () => {
  it("does not introduce persona_deep_scrape generation trigger", () => {
    const triggers = read("services/generationJobs/generationJobTypes.ts");
    assert.doesNotMatch(triggers, /["']persona_deep_scrape["']/);
    assert.match(triggers, /["']prospect_deep_scrape["']/);
  });
});
