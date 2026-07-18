import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Sprint 4 — Deployment Assets collapsed by default", () => {
  it("1/2. Discussion and Prospect Deployment Assets reuse CollapsiblePromptBlock defaultOpen=false", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /<DeploymentAssets/);
    assert.match(
      workspace,
      /title="Deployment Assets"\s*defaultOpen=\{false\}/,
    );

    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(prospectPage, /ExecutiveIntelligenceWorkspace/);

    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /ExecutiveIntelligenceWorkspace/);

    const deploymentAssets = read("components/deployment/DeploymentAssets.tsx");
    assert.match(deploymentAssets, /CollapsiblePromptBlock/);
    assert.match(deploymentAssets, /defaultOpen=\{false\}/);
    assert.doesNotMatch(deploymentAssets, /defaultOpen=\{true\}/);
  });

  it("3. Strategic Assets still default collapsed via CollapsiblePromptBlock", () => {
    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    assert.match(blueprint, /CollapsiblePromptBlock/);
    assert.doesNotMatch(blueprint, /defaultOpen=\{true\}/);

    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.match(block, /defaultOpen = false/);
    assert.match(block, /useState\(defaultOpen\)/);
  });

  it("4. Manual expand still works via shared toggle", () => {
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.match(block, /onClick=\{\(\) => setIsOpen\(\(open\) => !open\)\}/);
    assert.match(block, /aria-expanded=\{isOpen\}/);
    assert.match(block, /isOpen && \(/);
  });

  it("5. Deployment status / readiness surfaces unchanged by this sprint", () => {
    const deploymentAssets = read("components/deployment/DeploymentAssets.tsx");
    assert.doesNotMatch(deploymentAssets, /deployment_status|lifecycle_status/);
    assert.doesNotMatch(deploymentAssets, /DeploymentReadinessBadge/);

    const readiness = read("lib/deploymentReadiness.ts");
    assert.match(readiness, /export/);
  });

  it("6. Existing deployment copy actions still wired through shared collapse block", () => {
    const deploymentAssets = read("components/deployment/DeploymentAssets.tsx");
    assert.match(deploymentAssets, /copyContext=\{copyContext\}/);
    assert.match(
      deploymentAssets,
      /initiallyDone=\{Boolean\(doneByAssetType\[card\.assetType\]\)\}/,
    );
    assert.match(
      deploymentAssets,
      /initiallyTags=\{tagsByAssetType\[card\.assetType\] \?\? \[\]\}/,
    );
    assert.match(deploymentAssets, /buildDeploymentAssetCards/);
    assert.match(deploymentAssets, /executiveVersionId/);

    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.match(block, /<CopyButton/);
    assert.match(block, /initiallyDone/);
    assert.match(block, /initiallyTags/);
  });
});
