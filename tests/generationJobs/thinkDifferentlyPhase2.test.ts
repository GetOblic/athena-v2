import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildThinkDifferentlyJobProgress,
  isThinkDifferentlyJobProgress,
  normalizeExecutiveGenerationMode,
  THINK_DIFFERENTLY_PIPELINE,
} from "../../services/brain/generationContracts/executiveGenerationMode";
import {
  appendThinkDifferentlyInstruction,
  THINK_DIFFERENTLY_INSTRUCTION,
  THINK_DIFFERENTLY_INSTRUCTION_MARKER,
} from "../../services/brain/generationContracts/thinkDifferentlyInstruction";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Think Differently Phase 2 — mode + instruction", () => {
  it("A/C. Standard mode is default; Think Differently is explicit", () => {
    assert.equal(normalizeExecutiveGenerationMode(undefined), "standard");
    assert.equal(normalizeExecutiveGenerationMode("standard"), "standard");
    assert.equal(
      normalizeExecutiveGenerationMode("think_differently"),
      "think_differently",
    );
    assert.equal(normalizeExecutiveGenerationMode("creative"), "standard");
  });

  it("C. Think Differently instruction appends exactly once", () => {
    const base = "STANDARD BLUEPRINT PROMPT\nJSON schema here";
    const once = appendThinkDifferentlyInstruction(base);
    assert.ok(once.startsWith(base));
    assert.equal(
      once.split(THINK_DIFFERENTLY_INSTRUCTION_MARKER).length - 1,
      1,
    );
    assert.match(once, /materially different strategic thesis/);
    assert.doesNotMatch(once, /be creative/i);
    assert.throws(() => appendThinkDifferentlyInstruction(once));
  });

  it("G. Job progress helper hard-codes pipeline intent", () => {
    const progress = buildThinkDifferentlyJobProgress();
    assert.deepEqual(progress, {
      generationMode: "think_differently",
      pipeline: THINK_DIFFERENTLY_PIPELINE,
    });
    assert.equal(isThinkDifferentlyJobProgress(progress), true);
    assert.equal(isThinkDifferentlyJobProgress({}), false);
    assert.equal(
      isThinkDifferentlyJobProgress({
        generationMode: "think_differently",
        pipeline: "full",
      }),
      false,
    );
  });
});

describe("Think Differently Phase 2 — workflow isolation", () => {
  it("B/N. Workflow does not regenerate upstream or call end-to-end", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.doesNotMatch(
      workflow,
      /import\s*\{[^}]*processDiscussionEndToEnd|from ["']@\/services\/workflows\/discussionWorkflow["']/,
    );
    assert.doesNotMatch(workflow, /await\s+processDiscussionEndToEnd\s*\(/);
    assert.doesNotMatch(workflow, /generateDiscussionAnalysis/);
    assert.doesNotMatch(workflow, /createOpportunity|detectOpportunity/);
    assert.doesNotMatch(workflow, /generateExecutiveBriefing|createReview\(/);
    assert.match(workflow, /getLatestDiscussionAnalysis/);
    assert.match(workflow, /getOpportunityByDiscussionId/);
    assert.match(workflow, /getLatestReviewByOpportunityId/);
    assert.match(workflow, /generationMode:\s*"think_differently"/);
    assert.match(workflow, /forceNewVersion:\s*true/);
  });

  it("C/D. Blueprint and Deployment Assets use think_differently mode", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.match(workflow, /createAssetBlueprintForBriefing/);
    assert.match(workflow, /createAssetBlueprintForDiscussionAnalysis/);
    assert.match(workflow, /generateDeploymentAssets/);
    assert.match(workflow, /strategicBlueprint:\s*strategicBlueprintRecord/);
    assert.match(
      workflow,
      /generateDeploymentAssets[\s\S]*generationMode:\s*"think_differently"/,
    );

    // Persist DA only after generate; publish only after both succeed.
    const generateIdx = workflow.indexOf("generateDeploymentAssets(");
    const persistIdx = workflow.indexOf("persistDeploymentAssets(");
    const publishIdx = workflow.indexOf(
      "publishExecutiveIntelligenceVersion(",
    );
    assert.ok(generateIdx > 0 && persistIdx > generateIdx);
    assert.ok(publishIdx > persistIdx);

    // Think Differently inserts a new blueprint row (does not overwrite Current's row).
    const assetService = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    assert.match(
      assetService,
      /forceInsert:\s*generationMode === "think_differently"/,
    );
  });

  it("E. Partial failure does not publish a version", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    // Early returns on blueprint/DA failure before publish.
    assert.match(workflow, /blueprint_failed/);
    assert.match(workflow, /deployment_assets_failed/);
    assert.match(workflow, /deployment_assets_insufficient_divergence/);
    assert.match(workflow, /publish_failed/);
    const failBlueprint = workflow.indexOf("blueprint_failed");
    const failAssets = workflow.indexOf("deployment_assets_failed");
    const failDivergence = workflow.indexOf(
      "deployment_assets_insufficient_divergence",
    );
    const publish = workflow.indexOf("publishExecutiveIntelligenceVersion(");
    assert.ok(failBlueprint > 0 && failBlueprint < publish);
    assert.ok(failAssets > 0 && failAssets < publish);
    assert.ok(failDivergence > 0 && failDivergence < publish);
  });

  it("F/L. forceNewVersion is optional and defaults off for Standard", () => {
    const publisher = read(
      "services/executiveVersions/executiveVersionService.ts",
    );
    assert.match(publisher, /forceNewVersion\?: boolean/);
    assert.match(publisher, /!input\.forceNewVersion/);

    const endToEnd = read("services/workflows/discussionWorkflow.ts");
    assert.doesNotMatch(endToEnd, /forceNewVersion:\s*true/);
    assert.match(endToEnd, /publishExecutiveIntelligenceVersion\(/);
  });
});

describe("Think Differently Phase 2 — prompt + routing isolation", () => {
  it("A/M. Standard prompt assemblers do not embed Think Differently instruction", () => {
    const blueprintAssembly = read(
      "services/brain/generationContracts/generationPromptAssembly.ts",
    );
    const daAssembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    assert.doesNotMatch(
      blueprintAssembly,
      /THINK_DIFFERENTLY|Think Differently|ATHENA THINK DIFFERENTLY/,
    );
    assert.doesNotMatch(daAssembly, /THINK_DIFFERENTLY_INSTRUCTION/);
    assert.doesNotMatch(daAssembly, /ATHENA THINK DIFFERENTLY/);

    const assetService = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    assert.match(assetService, /assembleStrategicBlueprintPrompt\(/);
    assert.match(assetService, /appendThinkDifferentlyInstruction/);
    assert.match(assetService, /generationMode !== "think_differently"/);

    const daWorkflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.match(daWorkflow, /appendThinkDifferentlyInstruction/);
    assert.match(daWorkflow, /generationMode === "think_differently"/);
  });

  it("C/D/O. Existing blueprint and deployment-assets routing unchanged", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /deployment_assets/);
    assert.doesNotMatch(routing, /think_differently/);
    assert.doesNotMatch(routing, /breakthrough/i);

    const assetService = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    assert.doesNotMatch(assetService, /think_differently.*model|model.*think_differently/);
  });

  it("instruction module is compact and operational", () => {
    assert.ok(THINK_DIFFERENTLY_INSTRUCTION.includes(THINK_DIFFERENTLY_INSTRUCTION_MARKER));
    assert.match(THINK_DIFFERENTLY_INSTRUCTION, /same approved intelligence/);
    assert.match(THINK_DIFFERENTLY_INSTRUCTION, /Retain the required output contract/);
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /deliberately question the assumptions/,
    );
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /second-most-obvious variation/,
    );
    assert.match(
      THINK_DIFFERENTLY_INSTRUCTION,
      /Do not treat a change in wording, channel, content format, tactic/,
    );
    assert.doesNotMatch(THINK_DIFFERENTLY_INSTRUCTION, /doctrine/i);
  });
});

describe("Think Differently Phase 2 — jobs + API", () => {
  it("G/J. Executor branches before full pipeline; one worker remains", () => {
    const executor = read("services/generationJobs/generationJobExecutor.ts");
    assert.match(executor, /isThinkDifferentlyJobProgress/);
    assert.match(executor, /processThinkDifferentlyWorkflow/);
    assert.match(executor, /processDiscussionEndToEnd/);

    const thinkIdx = executor.indexOf("processThinkDifferentlyWorkflow");
    const fullIdx = executor.indexOf("processDiscussionEndToEnd(");
    assert.ok(thinkIdx > 0 && thinkIdx < fullIdx);

    const worker = read("workers/athenaWorker.ts");
    assert.match(worker, /executeClaimedGenerationJob|generationJobExecutor/);
    assert.doesNotMatch(worker, /thinkDifferentlyWorker|new Worker/);
  });

  it("G. Progress survives create/coalesce/follow-up paths", () => {
    const runner = read("services/generationJobs/generationJobRunner.ts");
    assert.match(runner, /progress\?: Record<string, unknown>/);
    assert.match(runner, /markDiscussionPendingGenerationFollowUp/);
    assert.match(runner, /progress: input\.progress \?\? \{\}/);

    const service = read("services/generationJobs/generationJobService.ts");
    assert.match(service, /pending_generation_follow_up_intent/);
    assert.match(service, /consumeDiscussionPendingGenerationFollowUp/);

    const executor = read("services/generationJobs/generationJobExecutor.ts");
    assert.match(executor, /progress: pending\.progress \?\? \{\}/);
  });

  it("H. Dedicated endpoints hard-code Think Differently progress", () => {
    const discussionRoute = read(
      "app/api/discussions/[id]/think-differently/route.ts",
    );
    const prospectRoute = read(
      "app/api/prospects/[id]/think-differently/route.ts",
    );
    assert.match(discussionRoute, /buildThinkDifferentlyJobProgress/);
    assert.match(discussionRoute, /triggerType:\s*"manual_refresh"/);
    assert.match(discussionRoute, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(discussionRoute, /request\.json|await _request\.json/);

    assert.match(prospectRoute, /buildThinkDifferentlyJobProgress/);
    assert.match(prospectRoute, /requireCurrentOrganizationContext/);
    assert.match(prospectRoute, /getProspectById/);
    assert.doesNotMatch(prospectRoute, /request\.json|await _request\.json/);

    const analyze = read("app/api/discussions/[id]/analyze/route.ts");
    assert.doesNotMatch(analyze, /think_differently|buildThinkDifferentlyJobProgress/);
  });
});

describe("Think Differently Phase 2 — UI", () => {
  it("I. Generate Intelligence + Think Differently labels and endpoints", () => {
    const analyzeButton = read(
      "components/discussions/AnalyzeDiscussionButton.tsx",
    );
    assert.match(analyzeButton, /Generate Intelligence/);
    assert.match(analyzeButton, /Generating Intelligence/);
    assert.match(analyzeButton, /startRegeneration/);
    assert.doesNotMatch(analyzeButton, /Refresh Intelligence|Generate Fresh/);

    const thinkButton = read(
      "components/discussions/ThinkDifferentlyButton.tsx",
    );
    assert.match(thinkButton, /Think Differently/);
    assert.match(thinkButton, /Thinking Differently/);
    assert.match(thinkButton, /startThinkDifferently/);
    assert.match(thinkButton, /--athena-success/);
    assert.doesNotMatch(thinkButton, /--athena-orange/);

    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /AnalyzeDiscussionButton/);
    assert.match(header, /ThinkDifferentlyButton/);
    assert.match(header, /label="Generate Intelligence"/);

    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    assert.match(provider, /startThinkDifferently/);
    assert.match(provider, /\/think-differently/);
    assert.match(provider, /\/analyze/);

    const prospectButton = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.match(prospectButton, /Generate Intelligence/);
    assert.match(prospectButton, /Think Differently/);
    assert.match(prospectButton, /\/api\/prospects\/\$\{prospectId\}\/refresh/);
    assert.match(
      prospectButton,
      /\/api\/prospects\/\$\{prospectId\}\/think-differently/,
    );
    assert.match(prospectButton, /disabled=\{busy\}/);
    assert.match(prospectButton, /--athena-success/);
    assert.match(prospectButton, /--athena-orange/);
  });
});

describe("Think Differently Phase 2 — scope audit", () => {
  it("P/Q. No migration, no new worker, no breakthrough production imports", () => {
    const workflow = read("services/workflows/thinkDifferentlyWorkflow.ts");
    assert.doesNotMatch(workflow, /breakthrough|doctrine/i);
    assert.doesNotMatch(
      workflow,
      /from ["']@\/scripts\/evaluation|from ["'].*breakthrough/,
    );
    assert.doesNotMatch(workflow, /supabase\/migrations/);

    const executor = read("services/generationJobs/generationJobExecutor.ts");
    assert.doesNotMatch(executor, /\bnew Queue\b|bullmq/i);
    assert.doesNotMatch(executor, /thinkDifferentlyWorker/);

    const mode = read(
      "services/brain/generationContracts/executiveGenerationMode.ts",
    );
    assert.doesNotMatch(mode, /CREATE TABLE|alter table/i);
  });
});
