import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function deletePersonaBlock(): string {
  const service = read("services/personas/personaService.ts");
  return service.slice(service.indexOf("export async function deletePersona"));
}

function deleteProspectBlock(): string {
  const service = read("services/prospects/prospectService.ts");
  return service.slice(service.indexOf("export async function deleteProspect"));
}

describe("Consistent entity Delete UX", () => {
  it("1. Prospect header displays Delete", () => {
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /ProspectHeaderDeleteButton/);
    assert.match(page, /prospectId=\{prospect\.id\}/);
    const headerDelete = read(
      "components/prospects/ProspectHeaderDeleteButton.tsx",
    );
    assert.match(headerDelete, /ConfirmDeleteControl/);
    assert.match(headerDelete, /ConfirmDeleteControl/);
  });

  it("2. Persona header displays Delete", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaHeaderDeleteButton/);
    assert.match(page, /personaId=\{persona\.id\}/);
  });

  it("3. Prospect/Persona do not show duplicate Delete actions", () => {
    const prospectEditor = read(
      "components/prospects/ProspectMetadataEditor.tsx",
    );
    const personaEditor = read(
      "components/personas/PersonaMetadataEditor.tsx",
    );
    assert.doesNotMatch(prospectEditor, />\s*Delete\s*</);
    assert.doesNotMatch(prospectEditor, /Confirm Delete|handleDelete/);
    assert.doesNotMatch(personaEditor, />\s*Delete\s*</);
    assert.doesNotMatch(personaEditor, /Confirm Delete|handleDelete/);

    const prospectPage = read("app/prospects/[id]/page.tsx");
    const personaPage = read("app/personas/[id]/page.tsx");
    assert.equal(
      (prospectPage.match(/<ProspectHeaderDeleteButton/g) ?? []).length,
      1,
    );
    assert.equal(
      (personaPage.match(/<PersonaHeaderDeleteButton/g) ?? []).length,
      1,
    );
  });

  it("4. Prospect delete calls existing DELETE API and redirects to /prospects", () => {
    const headerDelete = read(
      "components/prospects/ProspectHeaderDeleteButton.tsx",
    );
    assert.match(headerDelete, /\/api\/prospects\/\$\{prospectId\}/);
    assert.match(headerDelete, /redirectTo="\/prospects"/);
    assert.match(headerDelete, /payload\.ok/);

    const route = read("app/api/prospects/[id]/route.ts");
    assert.match(route, /export async function DELETE/);
    assert.match(route, /deleteProspect/);

    const service = read("services/prospects/prospectService.ts");
    assert.match(service, /export async function deleteProspect/);
    assert.match(service, /deleteDiscussion/);
  });

  it("5. Persona delete cleans bridge before Persona row; org-scoped deleteDiscussion", () => {
    const deleteBlock = deletePersonaBlock();
    assert.match(
      deleteBlock,
      /bridgeDiscussionId = existing\.linked_discussion_id/,
    );
    assert.match(deleteBlock, /deleteDiscussion/);
    assert.match(
      deleteBlock,
      /deleteDiscussion\(\s*bridgeDiscussionId,\s*organizationId/,
    );

    const discussionDeleteIndex = deleteBlock.indexOf("await deleteDiscussion");
    const personaDeleteIndex = deleteBlock.indexOf('.from("personas")');
    assert.ok(discussionDeleteIndex >= 0);
    assert.ok(personaDeleteIndex >= 0);
    assert.ok(
      discussionDeleteIndex < personaDeleteIndex,
      "bridge cleanup must run before Persona row delete",
    );
  });

  it("6. Persona with no bridge deletes safely", () => {
    const deleteBlock = deletePersonaBlock();
    assert.match(deleteBlock, /if \(bridgeDiscussionId\)/);
    assert.match(deleteBlock, /return true/);
  });

  it("7. Persona delete remains organization-scoped", () => {
    const deleteBlock = deletePersonaBlock();
    assert.match(deleteBlock, /getPersonaById\(id, organizationId\)/);
    assert.match(deleteBlock, /\.eq\("organization_id", organizationId\)/);
    assert.match(
      deleteBlock,
      /deleteDiscussion\(\s*bridgeDiscussionId,\s*organizationId/,
    );
    assert.match(
      deleteBlock,
      /getDiscussionById\(\s*bridgeDiscussionId,\s*organizationId/,
    );
  });

  it("8. Persona row failure and genuine bridge cleanup failure do not report success", () => {
    const deleteBlock = deletePersonaBlock();
    assert.match(deleteBlock, /if \(error\)/);
    assert.match(deleteBlock, /return false/);
    assert.match(deleteBlock, /stillPresent/);
    assert.match(deleteBlock, /bridge discussion cleanup failed/);
    assert.match(deleteBlock, /bridge discussion cleanup threw/);
    assert.match(deleteBlock, /catch \(error\)/);

    // Already-missing bridge continues; still-present bridge fails.
    const stillPresentFail = deleteBlock.indexOf(
      "if (stillPresent)",
    );
    const continueComment = deleteBlock.indexOf(
      "Bridge already missing",
    );
    assert.ok(stillPresentFail >= 0);
    assert.ok(continueComment > stillPresentFail);

    const route = read("app/api/personas/[id]/route.ts");
    assert.match(route, /deletePersona/);
    assert.match(route, /if \(!deleted\)/);
    assert.match(route, /ok: false/);
    assert.match(route, /500/);
    assert.match(route, /ok: true/);
  });

  it("8b. Prospect delete has the same bridge-cleanup failure semantics", () => {
    const deleteBlock = deleteProspectBlock();
    const discussionDeleteIndex = deleteBlock.indexOf("await deleteDiscussion");
    const prospectDeleteIndex = deleteBlock.indexOf('.from("prospects")');
    assert.ok(discussionDeleteIndex >= 0);
    assert.ok(prospectDeleteIndex >= 0);
    assert.ok(
      discussionDeleteIndex < prospectDeleteIndex,
      "bridge cleanup must run before Prospect row delete",
    );
    assert.match(deleteBlock, /stillPresent/);
    assert.match(deleteBlock, /bridge discussion cleanup failed/);
    assert.match(deleteBlock, /bridge discussion cleanup threw/);

    const route = read("app/api/prospects/[id]/route.ts");
    assert.match(route, /deleteProspect/);
    assert.match(route, /if \(!deleted\)/);
    assert.match(route, /ok: false/);
  });

  it("9. Updated confirmation copy warns about linked intelligence", () => {
    const prospect = read(
      "components/prospects/ProspectHeaderDeleteButton.tsx",
    );
    const persona = read("components/personas/PersonaHeaderDeleteButton.tsx");
    assert.match(
      prospect,
      /The prospect, its linked intelligence, and generated drafts will be removed/,
    );
    assert.match(
      persona,
      /The Persona, its linked intelligence Discussion, and generated intelligence will be removed/,
    );
  });

  it("10. Existing Discussion delete remains unchanged in behavior", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /ConfirmDeleteControl/);
    assert.match(
      header,
      /Delete this discussion permanently\? This cannot be undone\./,
    );
    assert.match(header, /redirectTo="\/discussions"/);
    assert.match(header, /payload\.success/);
    assert.equal((header.match(/<ConfirmDeleteControl/g) ?? []).length, 1);
    assert.match(header, /AnalyzeDiscussionButton/);
    assert.match(header, /ThinkDifferentlyButton/);
    assert.match(header, /Edit Discussion/);

    const service = read("services/discussionService.ts");
    assert.match(service, /export async function deleteDiscussion/);
    assert.match(service, /deleteRelatedDiscussionRecords/);
    // Not-found returns false (used to distinguish already-missing bridges).
    const deleteBlock = service.slice(
      service.indexOf("export async function deleteDiscussion"),
    );
    assert.match(deleteBlock, /if \(!existing\)/);
    assert.match(deleteBlock, /return false/);

    const route = read("app/api/discussions/[id]/route.ts");
    assert.match(route, /export async function DELETE/);
    assert.match(route, /success:\s*true/);
  });

  it("11. Shared ConfirmDeleteControl preserves caller success contract and failure UX", () => {
    const control = read("components/ui/ConfirmDeleteControl.tsx");
    assert.match(control, /type="button"/);
    assert.match(control, /isSuccessPayload/);
    assert.match(control, /aria-expanded/);
    assert.match(control, /aria-controls/);
    assert.match(control, /role="alert"/);
    assert.match(control, /aria-busy/);
    assert.match(control, /if \(isDeleting\) return/);
    assert.match(control, /Keep confirmation open/);

    // Failure path must not close confirm via the catch block.
    const catchStart = control.indexOf("} catch (deleteError)");
    const catchEnd = control.indexOf("\n  }", catchStart);
    const catchBlock = control.slice(catchStart, catchEnd);
    assert.doesNotMatch(catchBlock, /setShowDeleteConfirm\(false\)/);
    assert.match(catchBlock, /setIsDeleting\(false\)/);
  });
});
