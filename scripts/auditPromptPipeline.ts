/**
 * Run: npx tsx scripts/auditPromptPipeline.ts
 * Maps prompt layers, sizes, and duplication for Regenerate Intelligence.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function countPhrase(text: string, phrase: string): number {
  const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (text.match(re) ?? []).length;
}

async function main() {
  loadEnvLocal();

  const { buildAnalysisThreadBody } = await import("@/lib/discussionContent");
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { resolveGenerationBundle } = await import(
    "@/services/brain/generationContractService"
  );
  const {
    assembleDiscussionAnalysisPrompt,
    assembleExecutiveBriefingPrompt,
    assembleStrategicBlueprintPrompt,
  } = await import("@/services/brain/generationContracts/generationPromptAssembly");
  const { getDiscussionUpdatesByDiscussionId } = await import(
    "@/services/discussionUpdateService"
  );
  const { getDiscussionById } = await import("@/services/discussionService");
  const { buildDiscussionAnalysisPrompt } = await import(
    "@/services/ai/prompts/discussionAnalysisPrompt"
  );
  const { buildOpportunityReviewPrompt } = await import(
    "@/services/ai/prompts/opportunityReviewPrompt"
  );
  const { formatReasoningPipelineForPrompt } = await import(
    "@/services/brain/reasoningPipeline/reasoningPipelinePromptFormatting"
  );
  const { formatReasoningPipelineCompactForBlueprint } = await import(
    "@/services/brain/reasoningPipeline/reasoningPipelinePromptFormatting"
  );
  const { assembleExecutiveGenerationContextBlock } = await import(
    "@/services/brain/generationContracts/contractPromptFormatting"
  );
  const { formatGenerationContractForPrompt } = await import(
    "@/services/brain/generationContracts/contractPromptFormatting"
  );
  const { formatStrategicBlueprintProductionSpecsForPrompt } = await import(
    "@/services/assetBlueprints/strategicBlueprintProductionSpecs"
  );
  const { formatStrategicBlueprintProductionSpecsCompactForPrompt } = await import(
    "@/services/assetBlueprints/strategicBlueprintProductionSpecs"
  );
  const { buildStrategicBlueprintProductionContext } = await import(
    "@/services/assetBlueprints/strategicBlueprintProductionSpecs"
  );

  const { data: discussions } = await supabaseAdmin
    .from("discussions")
    .select("id, organization_id, title")
    .ilike("title", "%PMU%")
    .order("updated_at", { ascending: false })
    .limit(1);

  const fallback = await supabaseAdmin
    .from("discussions")
    .select("id, organization_id, title")
    .order("updated_at", { ascending: false })
    .limit(1);

  const row = discussions?.[0] ?? fallback.data?.[0];
  if (!row) throw new Error("No discussion found");

  const organizationId = row.organization_id;
  const discussion = await getDiscussionById(row.id, organizationId);
  if (!discussion) throw new Error("Discussion not found");

  const threadUpdates = await getDiscussionUpdatesByDiscussionId(
    row.id,
    organizationId,
  );
  const analysisDiscussion = {
    ...discussion,
    body: buildAnalysisThreadBody(discussion, threadUpdates),
  };

  const analysisBundle = await resolveGenerationBundle({
    workflowType: "discussion_analysis",
    organizationId,
    discussionId: row.id,
  });
  const briefingBundle = await resolveGenerationBundle({
    workflowType: "executive_briefing",
    organizationId,
    discussionId: row.id,
  });
  const blueprintBundle = await resolveGenerationBundle({
    workflowType: "strategic_blueprint",
    organizationId,
    discussionId: row.id,
  });

  const layers: Array<{ stage: string; layer: string; chars: number }> = [];

  if (analysisBundle) {
    layers.push({
      stage: "discussion_analysis",
      layer: "reasoning_pipeline_full",
      chars: formatReasoningPipelineForPrompt(analysisBundle.reasoningPipeline)
        .length,
    });
    layers.push({
      stage: "discussion_analysis",
      layer: "executive_context_compact",
      chars: assembleExecutiveGenerationContextBlock({
        executiveStrategy: analysisBundle.executiveStrategy,
        generationContract: analysisBundle.generationContract,
        executiveUnderstanding: analysisBundle.executiveUnderstanding,
        compact: true,
      }).length,
    });
    layers.push({
      stage: "discussion_analysis",
      layer: "executive_context_full",
      chars: assembleExecutiveGenerationContextBlock({
        executiveStrategy: analysisBundle.executiveStrategy,
        generationContract: analysisBundle.generationContract,
        executiveUnderstanding: analysisBundle.executiveUnderstanding,
      }).length,
    });
    layers.push({
      stage: "discussion_analysis",
      layer: "generation_contract_full",
      chars: formatGenerationContractForPrompt(
        analysisBundle.generationContract,
      ).length,
    });
  }

  const analysisPrompt = analysisBundle
    ? assembleDiscussionAnalysisPrompt({
        bundle: analysisBundle,
        discussion: analysisDiscussion,
      })
    : buildDiscussionAnalysisPrompt(analysisDiscussion, "");

  const briefingPrompt = briefingBundle
    ? assembleExecutiveBriefingPrompt({
        bundle: briefingBundle,
        opportunity: {
          id: "preview",
          organization_id: organizationId,
          discussion_id: row.id,
          title: discussion.title,
          reason: "audit",
          score: 70,
          status: "draft",
        } as never,
      })
    : buildOpportunityReviewPrompt({
        id: "preview",
        title: discussion.title,
      } as never);

  let blueprintPrompt = "";
  if (blueprintBundle) {
    blueprintPrompt = assembleStrategicBlueprintPrompt({
      bundle: blueprintBundle,
      discussion: analysisDiscussion as unknown as Record<string, unknown>,
      analysis: { summary: "[analysis record at runtime]" },
    });

    layers.push({
      stage: "strategic_blueprint",
      layer: "reasoning_pipeline_compact",
      chars: formatReasoningPipelineCompactForBlueprint(
        blueprintBundle.reasoningPipeline,
      ).length,
    });
    layers.push({
      stage: "strategic_blueprint",
      layer: "reasoning_pipeline_full",
      chars: formatReasoningPipelineForPrompt(blueprintBundle.reasoningPipeline)
        .length,
    });

    const productionContext = buildStrategicBlueprintProductionContext(
      blueprintBundle.executiveUnderstanding,
      blueprintBundle.executiveStrategy,
    );
    layers.push({
      stage: "strategic_blueprint",
      layer: "production_specs_full",
      chars: formatStrategicBlueprintProductionSpecsForPrompt(productionContext)
        .length,
    });
    layers.push({
      stage: "strategic_blueprint",
      layer: "production_specs_compact",
      chars: formatStrategicBlueprintProductionSpecsCompactForPrompt(
        productionContext,
      ).length,
    });
  }

  const duplicationPhrases = [
    "do not default",
    "webinar",
    "comprehensive guide",
    "SELF-CHECK",
    "commercial strategist",
    "JSON only",
    "no markdown",
  ];

  const duplication = duplicationPhrases.map((phrase) => ({
    phrase,
    analysis: countPhrase(analysisPrompt, phrase),
    briefing: countPhrase(briefingPrompt, phrase),
    blueprint: countPhrase(blueprintPrompt, phrase),
  }));

  const report = {
    discussion: {
      id: row.id,
      title: discussion.title,
      organizationId,
    },
    promptOrder: {
      discussion_analysis: [
        "buildDiscussionAnalysisPrompt",
        "  1. Role + task",
        "  2. Brain context (reasoning pipeline compact + executive context compact)",
        "  3. Domain framework (Elevate only if no brain context)",
        "  4. Discussion JSON",
        "  5. Deployment asset instructions (single block)",
        "  6. JSON schema",
      ],
      executive_briefing: [
        "assembleExecutiveBriefingPrompt",
        "  1. Brain context FIRST (reasoning + compact executive context)",
        "  2. Opportunity JSON + deployment instructions + JSON schema",
      ],
      strategic_blueprint: [
        "assembleStrategicBlueprintPrompt",
        "  1. Blueprint strategist instructions (multi-option comparison)",
        "  2. Compact reasoning + compact strategy signals",
        "  3. Compact production signals",
        "  4. Discussion + analysis/opportunity sources",
        "  5. JSON schema",
      ],
    },
    totalPromptChars: {
      discussion_analysis: analysisPrompt.length,
      executive_briefing: briefingPrompt.length,
      strategic_blueprint: blueprintPrompt.length,
    },
    layerSizes: layers,
    duplication,
    simplificationNotes: [
      "Full generation contract removed from compact/blueprint executive context.",
      "Blueprint drops full production specs, asset standards, and full reasoning pipeline.",
      "Briefing puts brain context before task prompt.",
      "Discussion analysis skips Elevate framework when brain context is present.",
    ],
  };

  const outPath = join(process.cwd(), "tmp-prompt-pipeline-audit.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("Prompt Pipeline Audit\n");
  console.log(`Discussion: ${discussion.title}`);
  console.log(`Analysis prompt: ${analysisPrompt.length.toLocaleString()} chars`);
  console.log(`Briefing prompt: ${briefingPrompt.length.toLocaleString()} chars`);
  console.log(
    `Blueprint prompt: ${blueprintPrompt.length.toLocaleString()} chars`,
  );
  console.log(`\nWritten: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
