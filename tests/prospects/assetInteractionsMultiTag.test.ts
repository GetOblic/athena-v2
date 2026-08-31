import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ASSET_USAGE_TAG_LABELS,
  ASSET_USAGE_TAGS,
  COPIED_INTERACTION_TYPE,
  isAssetUsageTag,
  parseAssetUsageTag,
} from "../../services/assetInteractions/assetUsageTags";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listTsFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  const entries = readdirSync(absolute, { withFileTypes: true });
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

describe("Asset usage tag registry", () => {
  it("4. supports all five usage tags with display labels", () => {
    assert.deepEqual(ASSET_USAGE_TAGS, [
      "selected",
      "scheduled",
      "sent",
      "published",
      "used",
    ]);
    assert.equal(ASSET_USAGE_TAG_LABELS.selected, "Selected");
    assert.equal(ASSET_USAGE_TAG_LABELS.scheduled, "Scheduled");
    assert.equal(ASSET_USAGE_TAG_LABELS.sent, "Sent");
    assert.equal(ASSET_USAGE_TAG_LABELS.published, "Published");
    assert.equal(ASSET_USAGE_TAG_LABELS.used, "Used");
    for (const tag of ASSET_USAGE_TAGS) {
      assert.equal(isAssetUsageTag(tag), true);
      assert.equal(parseAssetUsageTag(tag), tag);
    }
    assert.equal(isAssetUsageTag("copied"), false);
    assert.equal(parseAssetUsageTag("copied"), null);
    assert.equal(COPIED_INTERACTION_TYPE, "copied");
  });
});

describe("Multi-tag API / service contracts", () => {
  it("1/12. copied rows still produce done; GET preserves done compatibility", () => {
    const service = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.match(service, /COPIED_INTERACTION_TYPE/);
    assert.match(service, /current\.done = true/);
    assert.match(service, /tags: AssetUsageTag\[\]/);
    assert.match(service, /done: boolean/);

    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /listAssetInteractions/);
    assert.match(route, /interactions,/);
  });

  it("2/3. Copy records copied only and does not auto-select usage tags", () => {
    const copyButton = read("components/deployment/CopyButton.tsx");
    assert.match(copyButton, /copied \? labels\.copied : labels\.copy/);
    assert.match(copyButton, /copy: chrome\?\.copy \?\? "Copy"/);
    assert.match(copyButton, /copied: chrome\?\.copied \?\? "Copied"/);
    assert.match(copyButton, /ACK_MS = 2000|2000/);
    assert.doesNotMatch(
      copyButton,
      /usageTag:\s*["'](selected|scheduled|sent|published|used)/,
    );

    const service = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.match(
      service,
      /interaction_type: COPIED_INTERACTION_TYPE/,
    );
    assert.match(service, /Does not create usage tags/);

    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /recordAssetCopyInteraction/);
    assert.match(route, /if \(usageTag\)/);
  });

  it("5/6. multiple tags coexist; add is idempotent", () => {
    const service = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.match(service, /addAssetUsageTag/);
    assert.match(service, /Never creates or toggles copied/);
    assert.match(service, /isUniqueViolation/);
    assert.match(
      service,
      /if \(!current\.tags\.includes\(row\.interaction_type\)\)/,
    );
    assert.match(
      service,
      /ASSET_USAGE_TAGS\.filter\(\(tag\) => state\.tags\.includes\(tag\)\)/,
    );
  });

  it("7. removing one tag deletes only that usage-tag row and preserves copied", () => {
    const service = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.match(service, /removeAssetUsageTag/);
    assert.match(service, /Never removes copied/);
    assert.match(service, /\.delete\(\)/);
    assert.match(service, /\.eq\("interaction_type", input\.usageTag\)/);
    // removeAssetUsageTag filters delete by usageTag only — never by copied.
    const removeFn = service.slice(service.indexOf("removeAssetUsageTag"));
    assert.match(removeFn, /\.eq\("interaction_type", input\.usageTag\)/);
    assert.doesNotMatch(removeFn, /COPIED_INTERACTION_TYPE/);

    const controls = read("components/deployment/AssetUsageTagControls.tsx");
    assert.match(controls, /action: wasActive \? "remove" : "add"/);
    assert.match(controls, /Could not save tag/);
  });

  it("8/9/10. tags stay scoped by org, user, source, and Executive Version", () => {
    const service = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.match(service, /\.eq\("organization_id", input\.organizationId\)/);
    assert.match(service, /\.eq\("user_id", input\.userId\)/);
    assert.match(service, /\.eq\("source_type", input\.sourceType\)/);
    assert.match(service, /\.eq\("source_id", input\.sourceId\)/);
    assert.match(service, /resolveExecutiveVersionScopeId/);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /tagsByAssetType/);
    assert.match(workspace, /executiveVersionIdForCopy/);
    assert.match(
      workspace,
      /isProspect && prospectId\?\.trim\(\) \? prospectId\.trim\(\) : discussionId/,
    );
  });

  it("11. Deployment Assets and Blueprint prompts support tags", () => {
    const assets = read("components/deployment/DeploymentAssets.tsx");
    assert.match(assets, /tagsByAssetType/);
    assert.match(assets, /initiallyTags=\{tagsByAssetType\[card\.assetType\]/);

    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    assert.match(blueprint, /tagsByAssetType/);
    assert.match(blueprint, /initiallyTags=/);

    const block = read(
      "components/assetBlueprints/CollapsiblePromptBlock.tsx",
    );
    assert.match(block, /initiallyTags/);

    const copyButton = read("components/deployment/CopyButton.tsx");
    assert.match(copyButton, /AssetUsageTagControls/);
    assert.match(copyButton, /initiallyTags/);
  });

  it("API add/remove usageTag path and default copy path", () => {
    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /parseAssetUsageTag/);
    assert.match(route, /addAssetUsageTag/);
    assert.match(route, /removeAssetUsageTag/);
    assert.match(route, /action === "remove"/);
    assert.match(route, /Unsupported usage tag/);
    assert.match(route, /done: state\.done/);
    assert.match(route, /tags: state\.tags/);
  });
});

describe("Usage-tag migration safety", () => {
  it("13/14. expands only interaction_type check; preserves unique constraint", () => {
    const create = read(
      "supabase/migrations/20260718000001_create_athena_asset_interactions.sql",
    );
    assert.match(create, /constraint athena_asset_interactions_unique/);
    assert.match(
      create,
      /organization_id,\s*user_id,\s*source_type,\s*source_id,\s*executive_version_id,\s*asset_type,\s*interaction_type/s,
    );

    const expand = read(
      "supabase/migrations/20260720000001_expand_asset_interaction_types.sql",
    );
    assert.match(
      expand,
      /drop constraint if exists athena_asset_interactions_interaction_type_check/,
    );
    assert.match(
      expand,
      /add constraint athena_asset_interactions_interaction_type_check/,
    );
    assert.match(expand, /'copied'/);
    assert.match(expand, /'selected'/);
    assert.match(expand, /'scheduled'/);
    assert.match(expand, /'sent'/);
    assert.match(expand, /'published'/);
    assert.match(expand, /'used'/);
    assert.doesNotMatch(expand, /athena_asset_interactions_unique/);
    assert.doesNotMatch(expand, /alter table prospects/i);
    assert.doesNotMatch(expand, /alter table discussions/i);
    assert.doesNotMatch(expand, /executive_versions/i);
    assert.doesNotMatch(expand, /backfill/i);
  });
});

describe("Usage tags never influence Athena intelligence", () => {
  it("15. Brain, prompt, generation, routing, worker, publication, EV snapshot modules do not consume usage tags", () => {
    const forbiddenRoots = [
      "services/brain",
      "services/generationJobs",
      "services/executiveVersions",
      "services/assetBlueprints",
      "services/prospects",
      "services/discussions",
      "lib/prompts",
      "workers",
    ];

    const consumers = new Set([
      "services/assetInteractions/assetUsageTags.ts",
      "services/assetInteractions/assetInteractionService.ts",
      "app/api/asset-interactions/route.ts",
      "components/deployment/AssetUsageTagControls.tsx",
      "components/deployment/CopyButton.tsx",
      "components/deployment/DeploymentAssets.tsx",
      "components/assetBlueprints/CollapsiblePromptBlock.tsx",
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
      "tests/prospects/assetInteractionsMultiTag.test.ts",
      "tests/prospects/assetInteractionsCopyDone.test.ts",
    ]);

    const hits: string[] = [];
    for (const root of forbiddenRoots) {
      let files: string[] = [];
      try {
        files = listTsFiles(root);
      } catch {
        continue;
      }
      for (const file of files) {
        if (consumers.has(file)) continue;
        const source = read(file);
        if (
          /assetUsageTags|addAssetUsageTag|removeAssetUsageTag|ASSET_USAGE_TAGS|usageTag/.test(
            source,
          )
        ) {
          hits.push(file);
        }
      }
    }

    assert.deepEqual(hits, []);
  });

  it("16. tag changes do not enqueue generation or regeneration", () => {
    const route = read("app/api/asset-interactions/route.ts");
    assert.doesNotMatch(route, /enqueue|generationJob|regenerat/i);
    const service = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.doesNotMatch(service, /enqueue|generationJob|regenerat/i);
    const controls = read("components/deployment/AssetUsageTagControls.tsx");
    assert.doesNotMatch(controls, /enqueue|generationJob|regenerat/i);
  });
});

describe("Usage tag UI surface", () => {
  it("renders all five tags with active/toggle behavior near Done", () => {
    const controls = read("components/deployment/AssetUsageTagControls.tsx");
    assert.match(controls, /ASSET_USAGE_TAGS\.map/);
    assert.match(controls, /aria-pressed=\{active\}/);
    assert.match(controls, /ASSET_USAGE_TAG_LABELS/);

    const copyButton = read("components/deployment/CopyButton.tsx");
    assert.match(copyButton, /\bDone\b/);
    assert.match(copyButton, /AssetUsageTagControls/);
  });
});
