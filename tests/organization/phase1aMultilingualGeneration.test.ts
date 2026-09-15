import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CollapsiblePromptBlock } from "../../components/assetBlueprints/CollapsiblePromptBlock";
import {
  DeploymentAssets,
  buildDeploymentAssetCards,
} from "../../components/deployment/DeploymentAssets";
import { parseLabeledDeploymentAssets } from "../../lib/deploymentAssets";
import {
  DEPLOYMENT_ASSET_TYPE_TOKENS,
  getDeploymentAssetTypeLabelMap,
  getLocalizedDeploymentAssetTypeLabel,
} from "../../lib/tenantI18n/deploymentAssetPresentation";
import { getSharedAssetChrome } from "../../lib/tenantI18n/opportunityPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { formatNormalizedProspectInputForPipeline } from "../../services/prospects/prospectNormalization";
import { SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES } from "../../services/ai/prompts/sharedPromptConstraints";

const ROOT = process.cwd();
const FRENCH_BODY =
  "Bonjour, merci pour votre intérêt. Voici une proposition adaptée à votre cabinet.";
const ENGLISH_KEY_BLOCK = `PERSONALIZED_OUTREACH_EMAIL:\n${FRENCH_BODY}`;

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listTsFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(relative));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

function parseStoredDeploymentAssetPayload(rawText: string): {
  suggested_cta: string;
} {
  const parsed = JSON.parse(rawText) as { suggested_cta?: string };
  return { suggested_cta: String(parsed.suggested_cta ?? "").trim() };
}

function emptyProspectPipelineInput(
  additionalContext: string,
): Parameters<typeof formatNormalizedProspectInputForPipeline>[0] {
  return {
    sourceType: "prospect",
    identity: {
      name: "Cabinet Dupont",
      website: null,
      industry: null,
      category: null,
      geography: null,
      companySize: null,
      revenue: null,
      employeeCount: null,
    },
    contacts: {
      decisionMaker: null,
      firstName: null,
      lastName: null,
      timezone: null,
      jobTitle: null,
      email: null,
      phone: null,
      whatsappNumber: null,
      linkedin: null,
      facebook: null,
      instagram: null,
      googleBusinessUrl: null,
    },
    operatorNotes: null,
    additionalContext,
    adsContent: null,
    technologies: null,
    painPoints: null,
    homepageIntelligence: null,
  };
}

describe("Phase 1A — protect existing multilingual generation", () => {
  it("keeps structural KEY English and stores a French body verbatim", () => {
    const workflowParser = read(
      "services/workflows/deploymentAssetsWorkflow.ts",
    );
    assert.match(
      workflowParser,
      /suggested_cta: suggestedCta,\n\s+recommended_response: recommendedResponse/,
    );
    assert.doesNotMatch(workflowParser, /tenantI18n|translateBody|localizeBody/);

    const stored = parseStoredDeploymentAssetPayload(
      JSON.stringify({ suggested_cta: ENGLISH_KEY_BLOCK }),
    );
    assert.equal(stored.suggested_cta, ENGLISH_KEY_BLOCK);
    assert.match(stored.suggested_cta, /PERSONALIZED_OUTREACH_EMAIL:/);
    assert.match(stored.suggested_cta, /Bonjour, merci pour votre intérêt/);

    const parsed = parseLabeledDeploymentAssets(stored.suggested_cta);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.assetKey, "email_outreach");
    assert.equal(parsed[0]?.title, "Personalized Outreach Email");
    assert.equal(parsed[0]?.content, FRENCH_BODY);
  });

  it("does not infer that an English TYPE label means the body is English", () => {
    const assets = parseLabeledDeploymentAssets(ENGLISH_KEY_BLOCK);
    assert.equal(assets[0]?.title, "Personalized Outreach Email");
    assert.equal(assets[0]?.content, FRENCH_BODY);
    assert.notEqual(assets[0]?.title, assets[0]?.content);
  });

  it("localizes only the presentation TYPE label and leaves key + body unchanged", () => {
    const parsed = parseLabeledDeploymentAssets(ENGLISH_KEY_BLOCK);
    const asset = parsed[0];
    assert.ok(asset);

    const frenchLabel = getLocalizedDeploymentAssetTypeLabel(
      fr,
      asset.assetKey,
      asset.title,
    );
    assert.equal(frenchLabel, fr.deploymentAssetTypes.personalizedOutreachEmail);
    assert.notEqual(frenchLabel, en.deploymentAssetTypes.personalizedOutreachEmail);
    assert.equal(asset.assetKey, "email_outreach");
    assert.equal(asset.title, "Personalized Outreach Email");
    assert.equal(asset.content, FRENCH_BODY);

    const cards = buildDeploymentAssetCards(
      parsed,
      "version-1",
      getDeploymentAssetTypeLabelMap(fr),
    );
    assert.equal(cards[0]?.assetType, "email_outreach");
    assert.equal(cards[0]?.label, frenchLabel);
    assert.equal(cards[0]?.text, FRENCH_BODY);
    assert.equal(parsed[0]?.content, FRENCH_BODY);
    assert.equal(parsed[0]?.assetKey, "email_outreach");
  });

  it("renders the French body verbatim under a localized TYPE label", () => {
    const parsed = parseLabeledDeploymentAssets(ENGLISH_KEY_BLOCK);
    const chrome = getSharedAssetChrome(fr);
    const markup = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: parsed,
        chrome,
      }),
    );
    assert.match(markup, /E-mail de prospection personnalisé/);
    assert.doesNotMatch(markup, /Personalized Outreach Email/);
    assert.doesNotMatch(markup, /tenantI18n/);

    const cards = buildDeploymentAssetCards(parsed, null, chrome.typeLabels);
    assert.equal(cards[0]?.text, FRENCH_BODY);
    const openCard = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: cards[0]!.label,
        description: cards[0]!.description,
        text: cards[0]!.text,
        defaultOpen: true,
      }),
    );
    assert.match(openCard, /E-mail de prospection personnalisé/);
    assert.match(openCard, /Bonjour, merci pour votre intérêt/);
  });

  it("covers every known TYPE token in all six locales without rewriting bodies", () => {
    for (const [language, messages] of Object.entries(DICTIONARIES)) {
      const map = getDeploymentAssetTypeLabelMap(messages);
      assert.deepEqual(Object.keys(map).sort(), [...DEPLOYMENT_ASSET_TYPE_TOKENS].sort());
      for (const token of DEPLOYMENT_ASSET_TYPE_TOKENS) {
        const label = map[token];
        assert.ok(label?.trim(), `${language} missing TYPE label for ${token}`);
        assert.notEqual(label, FRENCH_BODY);
      }
      if (language !== "en") {
        assert.notEqual(
          map.email_outreach,
          en.deploymentAssetTypes.personalizedOutreachEmail,
        );
        assert.notEqual(
          map.community_reply,
          en.deploymentAssetTypes.communityReply,
        );
      }
    }
  });

  it("leaves unknown or generated titles verbatim when no TYPE token matches", () => {
    const generatedTitle = "Generated Deployment Asset title must remain verbatim.";
    const generatedBody = "Generated Deployment Asset body must remain verbatim.";
    const cards = buildDeploymentAssetCards(
      [
        {
          title: generatedTitle,
          objective: "Generated objective must remain verbatim.",
          content: generatedBody,
        },
      ],
      null,
      getDeploymentAssetTypeLabelMap(fr),
    );
    assert.equal(cards[0]?.label, generatedTitle);
    assert.equal(cards[0]?.text, generatedBody);
  });

  it("keeps operator language instructions verbatim into generation context", () => {
    const instruction = "Generate all assets in French";
    const body = formatNormalizedProspectInputForPipeline(
      emptyProspectPipelineInput(instruction),
    );
    assert.match(body, /Additional Context:\nGenerate all assets in French/);
    assert.doesNotMatch(body, /organizations\.language/);
    assert.doesNotMatch(body, /tenantI18n/);
    assert.doesNotMatch(body, /Account Language/);
  });

  it("keeps the English KEY heading contract and does not add org-language generation architecture", () => {
    assert.match(
      SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
      /Do not rename, number, translate, bold, or decorate headings/,
    );

    const forbiddenArchitecture =
      /buildTenantOutputLanguageBlock|generation_language|outputLanguage|content_language|resolveOrganizationLanguage/;
    const masterEstimatePrompt =
      "services/ai/prompts/estimate/estimateUserPrompt.ts";
    for (const dir of [
      "workers",
      "services/ai/prompts",
      "services/brain",
      "services/generationJobs",
      "services/workflows",
    ]) {
      for (const file of listTsFiles(dir)) {
        const source = read(file);
        assert.doesNotMatch(source, /tenantI18n|lib\/tenantI18n/);
        if (file === masterEstimatePrompt) {
          assert.match(source, /outputLanguageInstruction/);
          assert.doesNotMatch(
            source,
            /buildTenantOutputLanguageBlock|resolveOrganizationLanguage|organizations\.language/,
          );
          continue;
        }
        assert.doesNotMatch(
          source,
          forbiddenArchitecture,
          `${file} must not add generated-content-language architecture`,
        );
      }
    }
  });

  it("does not post-process generated bodies through tenantI18n at render time", () => {
    const deployment = read("components/deployment/DeploymentAssets.tsx");
    assert.doesNotMatch(deployment, /tenantI18n|getTenantMessages|getTenantLocalization/);
    assert.match(deployment, /text: asset\.content/);
    assert.match(deployment, /localizedType \|\| asset\.title/);
    assert.doesNotMatch(deployment, /localize.*content|translate.*body/i);

    const helper = read("lib/tenantI18n/deploymentAssetPresentation.ts");
    assert.match(helper, /Localizes the UI TYPE label only/);
    assert.match(helper, /Does not rewrite generated titles or bodies/);
    assert.doesNotMatch(helper, /resolveOrganizationLanguage/);
    assert.doesNotMatch(helper, /getTenantLocalization/);
  });
});
