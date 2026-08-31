import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Generate Intelligence header placement", () => {
  it("1. Discussion header renders Generate Intelligence + Think Differently", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /AnalyzeDiscussionButton/);
    assert.match(header, /ThinkDifferentlyButton/);
    assert.match(header, /Generate Intelligence/);
    assert.match(header, /compact/);

    const page = read("app/discussions/[id]/page.tsx");
    assert.match(page, /DiscussionHeaderActions/);
    assert.match(page, /lg:flex-row lg:items-start lg:justify-between/);
  });

  it("2. Discussion Detailed Athena Reasoning no longer renders Generate Intelligence", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.doesNotMatch(workspace, /AnalyzeDiscussionButton/);
    assert.match(workspace, /Detailed Athena Reasoning/);
    assert.match(
      workspace,
      /Use Generate Intelligence in the page header to generate/,
    );
  });

  it("3. Prospect header renders Generate Intelligence + Think Differently", () => {
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /ProspectRefreshIntelligenceButton/);
    assert.match(page, /lg:flex-row lg:items-start lg:justify-between/);
    assert.match(page, /prospectId=\{prospect\.id\}/);

    const prospectButton = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.match(prospectButton, /Generate Intelligence/);
    assert.match(prospectButton, /Think Differently/);
  });

  it("4. Prospect Details no longer renders Generate Intelligence", () => {
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    assert.doesNotMatch(editor, /refreshIntelligence/);
    assert.doesNotMatch(editor, /\/api\/prospects\/\$\{prospect\.id\}\/refresh/);
    assert.doesNotMatch(editor, />\s*Generate Intelligence\s*</);
    assert.doesNotMatch(editor, />\s*Refresh Intelligence\s*</);
    assert.match(editor, /Edit/);
    assert.doesNotMatch(editor, />\s*Delete\s*</);
    assert.doesNotMatch(editor, /handleDelete|Confirm Delete/);
  });

  it("5/6. exactly one Generate Intelligence action mounts per page", () => {
    const discussionPage = read("app/discussions/[id]/page.tsx");
    const discussionHeader = read(
      "components/discussions/DiscussionHeaderActions.tsx",
    );
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.equal(
      (discussionHeader.match(/<AnalyzeDiscussionButton/g) ?? []).length,
      1,
    );
    assert.equal(
      (discussionHeader.match(/<ThinkDifferentlyButton/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(discussionPage, /AnalyzeDiscussionButton/);
    assert.doesNotMatch(workspace, /AnalyzeDiscussionButton/);

    const prospectPage = read("app/prospects/[id]/page.tsx");
    const prospectEditor = read(
      "components/prospects/ProspectMetadataEditor.tsx",
    );
    assert.equal(
      (prospectPage.match(/<ProspectRefreshIntelligenceButton/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(prospectEditor, /ProspectRefreshIntelligenceButton/);
    assert.doesNotMatch(prospectPage, /AnalyzeDiscussionButton/);
  });

  it("7-10. existing generate handlers and endpoints remain unchanged", () => {
    const analyzeButton = read(
      "components/discussions/AnalyzeDiscussionButton.tsx",
    );
    assert.match(analyzeButton, /startRegeneration/);
    assert.match(analyzeButton, /useDiscussionRegeneration/);

    const discussionAnalyze = read("app/api/discussions/[id]/analyze/route.ts");
    assert.match(discussionAnalyze, /triggerType:\s*"manual_refresh"/);
    assert.match(discussionAnalyze, /enqueueDiscussionGenerationJob/);

    const prospectRefreshButton = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.match(
      prospectRefreshButton,
      /\/api\/prospects\/\$\{prospectId\}\/refresh/,
    );
    assert.match(prospectRefreshButton, /trackQueuedGeneration/);
    assert.match(
      prospectRefreshButton,
      /Prospect intelligence refresh queued\. Athena is regenerating in the background\./,
    );
    assert.match(prospectRefreshButton, /payload\.message \|\|/);

    const prospectRefreshRoute = read(
      "app/api/prospects/[id]/refresh/route.ts",
    );
    assert.match(prospectRefreshRoute, /triggerType:\s*"manual_refresh"/);
  });

  it("11-17. generate status UX remains intact without duplicate job wiring", () => {
    const analyzeButton = read(
      "components/discussions/AnalyzeDiscussionButton.tsx",
    );
    assert.match(analyzeButton, /isGenerating/);
    assert.match(analyzeButton, /isCompleted/);
    assert.match(analyzeButton, /disabled=\{isGenerating\}/);
    assert.match(analyzeButton, /Intelligence Generated/);
    assert.match(analyzeButton, /Generating Intelligence/);
    assert.match(analyzeButton, /duplicateNotice/);
    assert.match(analyzeButton, /error/);

    const prospectRefreshButton = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.match(prospectRefreshButton, /queueingKind \|\| isGenerating/);
    assert.match(prospectRefreshButton, /disabled=\{busy\}/);
    assert.match(
      prospectRefreshButton,
      /if \(queueingKind \|\| isGenerating\) return/,
    );
  });

  it("18/19. Discussion Edit and Delete remain in the header action group", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /Edit Discussion/);
    assert.match(header, /ConfirmDeleteControl/);
    assert.match(header, /method: "PATCH"/);
    const refreshIndex = header.indexOf("<AnalyzeDiscussionButton");
    const thinkIndex = header.indexOf("<ThinkDifferentlyButton");
    const editIndex = header.indexOf("Edit Discussion");
    const deleteIndex = header.indexOf("<ConfirmDeleteControl");
    assert.ok(refreshIndex > 0 && thinkIndex > refreshIndex);
    assert.ok(editIndex > thinkIndex);
    assert.ok(deleteIndex > editIndex);

    const deleteControl = read("components/ui/ConfirmDeleteControl.tsx");
    assert.match(deleteControl, /method: "DELETE"/);
    assert.match(deleteControl, /delete: "Delete"/);
    assert.match(deleteControl, /\{chrome\.delete\}/);
  });

  it("20/21. Prospect Details and Detailed Athena Reasoning remain otherwise intact", () => {
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    assert.match(editor, /Prospect Details/);
    assert.match(editor, /beginEdit/);
    assert.doesNotMatch(editor, /handleDelete/);

    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(prospectPage, /ProspectHeaderDeleteButton/);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /Detailed Athena Reasoning/);
    assert.match(workspace, /DetailField/);
    assert.match(workspace, /opportunity_reason/);
  });

  it("22/23. desktop alignment and responsive wrapping remain present", () => {
    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(
      discussionPage,
      /flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between/,
    );
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /flex flex-wrap/);

    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(
      prospectPage,
      /flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between/,
    );
    assert.match(prospectPage, /flex flex-wrap items-center justify-end/);
  });

  it("24-26. no migration, worker, or client-side queue wiring in UI", () => {
    const prospectRefreshButton = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.doesNotMatch(prospectRefreshButton, /enqueueDiscussionGenerationJob/);
    assert.doesNotMatch(prospectRefreshButton, /workers\//);

    const analyzeRoute = read("app/api/discussions/[id]/analyze/route.ts");
    assert.match(analyzeRoute, /manual_refresh/);
    const refreshRoute = read("app/api/prospects/[id]/refresh/route.ts");
    assert.match(refreshRoute, /manual_refresh/);
  });
});
