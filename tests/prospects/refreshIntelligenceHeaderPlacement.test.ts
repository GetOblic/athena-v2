import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Partial refresh header placement", () => {
  it("1. Discussion header renders both partial refresh actions", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /PartialRefreshActions/);
    assert.doesNotMatch(header, /AnalyzeDiscussionButton/);
    assert.doesNotMatch(header, /Refresh Intelligence/);

    const page = read("app/discussions/[id]/page.tsx");
    assert.match(page, /DiscussionHeaderActions/);
    assert.match(page, /lg:flex-row lg:items-start lg:justify-between/);
  });

  it("2. Discussion Detailed Athena Reasoning no longer renders refresh actions", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.doesNotMatch(workspace, /AnalyzeDiscussionButton/);
    assert.doesNotMatch(workspace, /PartialRefreshActions/);
    assert.match(workspace, /Detailed Athena Reasoning/);
    assert.match(
      workspace,
      /Use Refresh Deployment Assets or Refresh Strategic Assets in the page header to generate/,
    );
  });

  it("3. Prospect header renders both partial refresh actions", () => {
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /PartialRefreshActions/);
    assert.match(page, /prospectId=\{prospect\.id\}/);
    assert.doesNotMatch(page, /ProspectRefreshIntelligenceButton/);
    assert.doesNotMatch(page, /Refresh Intelligence/);
  });

  it("4. Prospect Details no longer renders refresh actions", () => {
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    assert.doesNotMatch(editor, /refreshIntelligence/);
    assert.doesNotMatch(editor, /\/api\/prospects\/\$\{prospect\.id\}\/refresh/);
    assert.doesNotMatch(editor, />\s*Refresh Intelligence\s*</);
    assert.match(editor, /Edit/);
    assert.match(editor, /Delete/);
  });

  it("5/6. exactly one PartialRefreshActions mount per page surface", () => {
    const discussionHeader = read(
      "components/discussions/DiscussionHeaderActions.tsx",
    );
    assert.equal(
      (discussionHeader.match(/<PartialRefreshActions/g) ?? []).length,
      1,
    );

    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.equal(
      (prospectPage.match(/<PartialRefreshActions/g) ?? []).length,
      1,
    );
  });

  it("7-10. partial refresh handlers and endpoints are wired", () => {
    const actions = read("components/discussions/PartialRefreshActions.tsx");
    assert.match(actions, /startPartialRefresh/);
    assert.match(actions, /deployment_assets/);
    assert.match(actions, /strategic_assets/);

    const discussionRefresh = read("app/api/discussions/[id]/refresh/route.ts");
    assert.match(discussionRefresh, /queuePartialAssetRefreshForDiscussion/);

    const prospectRefresh = read("app/api/prospects/[id]/refresh/route.ts");
    assert.match(prospectRefresh, /queuePartialAssetRefreshForDiscussion/);
    assert.match(prospectRefresh, /parsePartialRefreshScope/);

    // Full-generation analyze route remains available for non-UI workflows.
    const discussionAnalyze = read("app/api/discussions/[id]/analyze/route.ts");
    assert.match(discussionAnalyze, /triggerType:\s*"manual_refresh"/);
  });

  it("11-17. refresh status UX remains intact without duplicate job wiring", () => {
    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    assert.match(provider, /startPartialRefresh/);
    assert.match(provider, /activeTriggerType/);
    assert.match(provider, /isRegenerationComplete/);
    assert.match(provider, /publishedVersionId/);
  });

  it("18/19. Discussion Edit and Delete remain in the header action group", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /Edit Discussion/);
    assert.match(header, /Delete/);
    const refreshIndex = header.indexOf("<PartialRefreshActions");
    const editIndex = header.indexOf("Edit Discussion");
    assert.ok(refreshIndex > 0 && editIndex > refreshIndex);
  });

  it("20/21. Prospect Details and Detailed Athena Reasoning remain otherwise intact", () => {
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    assert.match(editor, /Prospect Details/);
    assert.match(
      editor,
      /Refresh Deployment Assets or Refresh Strategic Assets/,
    );
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /Detailed Athena Reasoning/);
  });

  it("22/23. desktop alignment and responsive wrapping remain present", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /flex-wrap/);
    const actions = read("components/discussions/PartialRefreshActions.tsx");
    assert.match(actions, /flex-wrap/);
  });

  it("24-26. no worker/generation contract redesign in header sprint residue", () => {
    const actions = read("components/discussions/PartialRefreshActions.tsx");
    assert.doesNotMatch(actions, /enqueueDiscussionGenerationJob/);
    assert.match(actions, /startPartialRefresh/);
  });
});
