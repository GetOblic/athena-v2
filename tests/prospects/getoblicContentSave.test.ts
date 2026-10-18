/**
 * Shared GetOblic Description and Knowledge Base save.
 * Draft generation stays unsaved until an explicit Save.
 */

import "../licensee/licenseeAuthTestEnv";
import {
  authorizeClientProspectConversionRows,
  type ClientProspectIntelligenceDenial,
} from "../../services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import {
  createProspectDirectoryArtifactMemoryStore,
  PROSPECT_DIRECTORY_KNOWLEDGE_BASE_MAX_CHARS,
  type ProspectDirectoryArtifactStore,
} from "../../services/prospects/prospectDirectoryArtifacts";
import {
  getoblicContentHttpResult,
  readClientGetoblicContent,
  readProspectGetoblicContent,
  saveClientGetoblicContent,
  saveProspectGetoblicContent,
  type GetoblicContentFailureReason,
} from "../../services/prospects/getoblicContentSave";
import "./getoblicContentEditorTestDom";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it } from "node:test";
import { GetoblicContentEditor } from "../../components/prospects/GetoblicContentEditor";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  canSaveGetoblicContent,
  getoblicContentMaxChars,
  initialGetoblicEditorContent,
} from "../../lib/prospects/getoblicContentEditorState";
import {
  GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS,
  GETOBLIC_DESCRIPTION_MAX_CHARS,
} from "../../lib/prospects/getoblicContentLimits";
import {
  knowledgeBaseSuggestionForEditor,
  readHistoricalKnowledgeBaseSuggestion,
} from "../../lib/prospects/historicalKnowledgeBaseSuggestion";

const ROOT = process.cwd();
const PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const CLIENT = "44444444-4444-4444-8444-444444444444";
const FOREIGN = "99999999-9999-4999-8999-999999999999";
const LICENSEE = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-19T00:00:00.000Z");

const CATALOGS: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

type ArtifactName = "description" | "knowledge_base";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function owns(allowed = true) {
  return async () => allowed;
}

function conversion(prospectId = PROSPECT, sourceOrganizationId = SOURCE) {
  return {
    ok: true as const,
    conversion: {
      prospectId,
      sourceOrganizationId,
      clientOrganizationId: CLIENT,
      licenseeAccountId: LICENSEE,
      licenseeSubAccountId: null,
      status: "active" as const,
    },
  };
}

function body(
  artifactType: ArtifactName,
  content: string,
  expectedRevision: number | null,
  extra?: Record<string, unknown>,
) {
  return { artifactType, content, expectedRevision, ...extra };
}

function storeOf() {
  return createProspectDirectoryArtifactMemoryStore();
}

async function saveProspect(
  store: ProspectDirectoryArtifactStore,
  artifactType: ArtifactName,
  content: string,
  expectedRevision: number | null,
  allowed = true,
) {
  return saveProspectGetoblicContent({
    prospectId: PROSPECT,
    sourceOrganizationId: SOURCE,
    body: body(artifactType, content, expectedRevision),
    store,
    ownsSourceProspect: owns(allowed),
    now: NOW,
  });
}

async function saveClient(
  store: ProspectDirectoryArtifactStore,
  artifactType: ArtifactName,
  content: string,
  expectedRevision: number | null,
  authority:
    | ReturnType<typeof conversion>
    | { ok: false; reason: ClientProspectIntelligenceDenial } = conversion(),
) {
  return saveClientGetoblicContent({
    clientOrganizationId: CLIENT,
    body: body(artifactType, content, expectedRevision),
    store,
    ownsSourceProspect: owns(true),
    now: NOW,
    resolveAuthority: async () => authority,
  });
}

describe("getoblic content save contract", () => {
  it("saves both artifacts from both sessions and increments revisions", async () => {
    for (const artifactType of ["description", "knowledge_base"] as const) {
      for (const surface of ["prospect", "client"] as const) {
        const store = storeOf();
        const content = artifactType === "description" ? "Harbor description" : "Harbor facts";
        const created =
          surface === "prospect"
            ? await saveProspect(store, artifactType, content, null)
            : await saveClient(store, artifactType, content, null);
        assert.equal(created.ok, true);
        if (!created.ok) return;
        assert.equal(created.created, true);
        assert.equal(created.revision, 1);
        assert.equal(created.content, content);
        assert.equal(created.artifactType, artifactType);
        const row = store.snapshot()[0];
        assert.equal(row?.origin, "edited");
        assert.equal(row?.sourceExecutiveVersionId, null);
        assert.equal(row?.prospectId, PROSPECT);
        assert.equal(row?.organizationId, SOURCE);
        assert.equal(row?.savedByOrganizationId, SOURCE);

        const revised =
          surface === "prospect"
            ? await saveProspect(store, artifactType, `${content} revised`, 1)
            : await saveClient(store, artifactType, `${content} revised`, 1);
        assert.equal(revised.ok && revised.revision, 2);
        assert.equal(store.snapshot()[0]?.revision, 2);
        assert.equal(store.snapshot()[0]?.content, `${content} revised`);
      }
    }
  });

  it("trims content and rejects empty, invalid, and over-limit text without writing", async () => {
    assert.equal(GETOBLIC_DESCRIPTION_MAX_CHARS, 4000);
    assert.equal(GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS, 20_000);
    assert.equal(PROSPECT_DIRECTORY_KNOWLEDGE_BASE_MAX_CHARS, 100_000);
    const store = storeOf();
    const trimmed = await saveProspect(store, "description", "  Harbor description  ", null);
    assert.equal(trimmed.ok && trimmed.content, "Harbor description");

    const cases: Array<{
      artifact: ArtifactName;
      content: unknown;
      revision: unknown;
      reason: GetoblicContentFailureReason;
    }> = [
      { artifact: "description", content: "   ", revision: null, reason: "invalid_content" },
      { artifact: "description", content: "", revision: null, reason: "invalid_content" },
      { artifact: "knowledge_base", content: 12, revision: null, reason: "invalid_content" },
      {
        artifact: "description",
        content: "A".repeat(4001),
        revision: null,
        reason: "content_too_long",
      },
      {
        artifact: "knowledge_base",
        content: "K".repeat(20_001),
        revision: null,
        reason: "content_too_long",
      },
      { artifact: "description", content: "Ok", revision: 0, reason: "invalid_revision" },
      { artifact: "description", content: "Ok", revision: 1.5, reason: "invalid_revision" },
      { artifact: "description", content: "Ok", revision: "1", reason: "invalid_revision" },
    ];
    for (const item of cases) {
      const before = store.snapshot().length;
      const result = await saveProspectGetoblicContent({
        prospectId: PROSPECT,
        sourceOrganizationId: SOURCE,
        body: {
          artifactType: item.artifact,
          content: item.content,
          expectedRevision: item.revision,
        },
        store,
        ownsSourceProspect: owns(true),
        now: NOW,
      });
      assert.deepEqual(result, { ok: false, reason: item.reason });
      assert.equal(store.snapshot().length, before);
    }

    const limits = storeOf();
    const maxDescription = await saveProspect(limits, "description", "D".repeat(4000), null);
    const maxKnowledge = await saveClient(limits, "knowledge_base", "K".repeat(20_000), null);
    assert.equal(maxDescription.ok && maxDescription.revision, 1);
    assert.equal(maxKnowledge.ok && maxKnowledge.content.length, 20_000);
  });

  it("returns a stable conflict and keeps the other writer's revision", async () => {
    const store = storeOf();
    const created = await saveProspect(store, "description", "First description", null);
    assert.equal(created.ok, true);
    const updated = await saveClient(store, "description", "Client revision", 1);
    assert.equal(updated.ok && updated.revision, 2);

    const stale = await saveProspect(store, "description", "Stale prospect edit", 1);
    assert.deepEqual(stale, { ok: false, reason: "conflict" });
    assert.deepEqual(getoblicContentHttpResult(stale), {
      status: 409,
      body: {
        ok: false,
        error: { code: "CONFLICT", message: "A newer saved version exists." },
      },
    });
    assert.equal(store.snapshot()[0]?.content, "Client revision");
    assert.equal(store.snapshot()[0]?.revision, 2);

    const raced = await saveClient(store, "knowledge_base", "Second first save", null);
    assert.equal(raced.ok, true);
    const duplicateFirst = await saveProspect(store, "knowledge_base", "Lost first save", null);
    assert.equal(duplicateFirst.ok, false);
    if (duplicateFirst.ok) return;
    assert.equal(duplicateFirst.reason, "conflict");
    assert.equal(
      store.snapshot().find((row) => row.artifactType === "knowledge_base")?.content,
      "Second first save",
    );
  });

  it("lets one prospect and client save win without merging the two drafts", async () => {
    const store = storeOf();
    const [prospectResult, clientResult] = await Promise.all([
      saveProspect(store, "description", "Prospect draft", null),
      saveClient(store, "description", "Client draft", null),
    ]);
    const results = [prospectResult, clientResult];
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(
      results.filter((result) => !result.ok && result.reason === "conflict").length,
      1,
    );
    assert.equal(store.snapshot().length, 1);
    const winner = results.find((result) => result.ok);
    assert.ok(winner && winner.ok);
    assert.equal(store.snapshot()[0]?.content, winner.content);
  });

  it("denies a foreign prospect and a tampered save body before writing", async () => {
    const store = storeOf();
    const foreign = await saveProspectGetoblicContent({
      prospectId: PROSPECT,
      sourceOrganizationId: FOREIGN,
      body: body("description", "Secret", null, { prospectId: FOREIGN }),
      store,
      ownsSourceProspect: owns(false),
      now: NOW,
    });
    assert.deepEqual(foreign, { ok: false, reason: "not_found" });
    assert.deepEqual(store.snapshot(), []);

    const tampered = await saveClientGetoblicContent({
      clientOrganizationId: CLIENT,
      body: body("description", "Client text", null, {
        prospectId: FOREIGN,
        sourceOrganizationId: FOREIGN,
      }),
      store,
      ownsSourceProspect: owns(true),
      now: NOW,
      resolveAuthority: async () => conversion(),
    });
    assert.deepEqual(tampered, { ok: false, reason: "invalid_request" });
    assert.deepEqual(store.snapshot(), []);
  });

  it("denies missing, reversed, foreign, and ambiguous conversions without writing", async () => {
    const store = storeOf();
    const denials: ClientProspectIntelligenceDenial[] = [
      "no_active_conversion",
      "client_mismatch",
      "ambiguous_conversion",
      "missing_client_organization",
      "incomplete_conversion",
      "source_mismatch",
    ];
    for (const reason of denials) {
      const result = await saveClientGetoblicContent({
        clientOrganizationId: reason === "missing_client_organization" ? "" : CLIENT,
        body: body("description", "Should not save", null),
        store,
        ownsSourceProspect: owns(true),
        now: NOW,
        resolveAuthority: async () => ({ ok: false, reason }),
      });
      assert.deepEqual(result, { ok: false, reason });
      const http = getoblicContentHttpResult(result);
      if (reason === "ambiguous_conversion") {
        assert.equal(http.status, 409);
        assert.equal(http.body.ok === false && http.body.error.code, "AMBIGUOUS_CONVERSION");
      } else if (reason === "missing_client_organization") {
        assert.equal(http.status, 401);
      } else {
        assert.equal(http.status, 404);
        assert.equal(
          http.body.ok === false && http.body.error.code,
          "CONVERSION_UNAVAILABLE",
        );
      }
    }
    assert.deepEqual(store.snapshot(), []);
    assert.equal(
      authorizeClientProspectConversionRows({
        clientOrganizationId: CLIENT,
        rows: [
          {
            prospect_id: PROSPECT,
            source_organization_id: SOURCE,
            client_organization_id: CLIENT,
            licensee_account_id: LICENSEE,
            status: "reversed",
          },
        ],
      }).reason,
      "no_active_conversion",
    );
    assert.equal(
      authorizeClientProspectConversionRows({
        clientOrganizationId: FOREIGN,
        rows: [
          {
            prospect_id: PROSPECT,
            source_organization_id: SOURCE,
            client_organization_id: CLIENT,
            licensee_account_id: LICENSEE,
            status: "active",
          },
        ],
      }).reason,
      "client_mismatch",
    );
  });

  it("reloads the saved artifact for an owned prospect and a resolved client", async () => {
    const store = storeOf();
    await saveProspect(store, "knowledge_base", "Saved facts", null);
    const prospectRead = await readProspectGetoblicContent({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "knowledge_base",
      store,
      ownsSourceProspect: owns(true),
    });
    assert.equal(prospectRead.ok && prospectRead.saved?.content, "Saved facts");
    assert.equal(prospectRead.ok && prospectRead.saved?.revision, 1);
    const clientRead = await readClientGetoblicContent({
      clientOrganizationId: CLIENT,
      artifactType: "knowledge_base",
      store,
      ownsSourceProspect: owns(true),
      resolveAuthority: async () => conversion(),
    });
    assert.equal(clientRead.ok && clientRead.saved?.revision, 1);
    const hidden = await readProspectGetoblicContent({
      prospectId: PROSPECT,
      sourceOrganizationId: FOREIGN,
      artifactType: "knowledge_base",
      store,
      ownsSourceProspect: owns(false),
    });
    assert.deepEqual(hidden, { ok: false, reason: "not_found" });
    const missing = await readClientGetoblicContent({
      clientOrganizationId: CLIENT,
      artifactType: "description",
      store,
      ownsSourceProspect: owns(true),
      resolveAuthority: async () => ({ ok: false, reason: "no_active_conversion" }),
    });
    assert.deepEqual(missing, { ok: false, reason: "no_active_conversion" });
  });

  it("does not touch Executive Intelligence, Client Brain, legacy description, WordPress, or generation entitlement", () => {
    const files = [
      "services/prospects/getoblicContentSave.ts",
      "app/api/prospects/[id]/getoblic-content/route.ts",
      "app/api/client-prospect-intelligence/getoblic-content/route.ts",
    ].map(read);
    const combined = files.join("\n");
    assert.doesNotMatch(
      combined,
      /publishExecutiveIntelligenceVersion|updateDiscussionAnalysis|generated_listing_description|putWordpress|getoblicWordpress|athena_identity|assertCurrentFreeConvertGeneration|getoblic-directory/,
    );
    const editor = read("components/prospects/GetoblicContentEditor.tsx");
    assert.doesNotMatch(
      editor,
      /publishExecutiveIntelligenceVersion|updateDiscussionAnalysis|generated_listing_description|putWordpress|getoblicWordpress|athena_identity|assertCurrentFreeConvertGeneration/,
    );
    assert.match(read("services/prospects/getoblicContentSave.ts"), /origin: "edited"/);
    assert.match(
      read("services/prospects/getoblicContentSave.ts"),
      /sourceExecutiveVersionId: null/,
    );
    assert.match(
      read("app/api/prospects/[id]/getoblic-content-draft/description/route.ts"),
      /assertCurrentFreeConvertGeneration/,
    );
    assert.match(
      read("app/api/prospects/[id]/getoblic-content-draft/knowledge-base/route.ts"),
      /action: "sync_ai"/,
    );
    assert.doesNotMatch(
      read("app/api/client-prospect-intelligence/getoblic-content-draft/description/route.ts"),
      /assertCurrentFreeConvertGeneration/,
    );
    const clientRoute = read("app/api/client-prospect-intelligence/getoblic-content/route.ts");
    assert.doesNotMatch(clientRoute, /prospectId|sourceOrganizationId|licensee/);
    assert.match(clientRoute, /saveClientGetoblicContent/);
    assert.match(
      read("app/api/prospects/[id]/getoblic-content/route.ts"),
      /sourceOrganizationId: organizationId/,
    );
    assert.match(
      read("app/api/prospects/[id]/getoblic-description/route.ts"),
      /generateProspectGetoblicDescription/,
    );
  });
});

describe("historical knowledge base suggestion", () => {
  it("reads the current executive knowledge base without changing it", () => {
    const intelligence = {
      analysis: {
        suggested_cta:
          "PERSONALIZED_OUTREACH_EMAIL:\nHello.\n\nKNOWLEDGE_BASE_ENHANCEMENT:\nOpen Tuesday through Friday.\n",
        confidence: 80,
      },
    };
    const before = structuredClone(intelligence);
    assert.equal(
      readHistoricalKnowledgeBaseSuggestion(intelligence),
      "Open Tuesday through Friday.",
    );
    assert.deepEqual(intelligence, before);
    assert.equal(
      readHistoricalKnowledgeBaseSuggestion({ analysis: { suggested_cta: "Hello" } }),
      null,
    );
    assert.equal(
      knowledgeBaseSuggestionForEditor({
        directoryArtifactsAvailable: true,
        savedKnowledgeBase: null,
        currentKnowledgeBase: "Open Tuesday through Friday.",
      }),
      "Open Tuesday through Friday.",
    );
    assert.equal(
      knowledgeBaseSuggestionForEditor({
        directoryArtifactsAvailable: true,
        savedKnowledgeBase: { content: "Saved" },
        currentKnowledgeBase: "Open Tuesday through Friday.",
      }),
      null,
    );
    assert.equal(
      knowledgeBaseSuggestionForEditor({
        directoryArtifactsAvailable: false,
        savedKnowledgeBase: null,
        currentKnowledgeBase: "Open Tuesday through Friday.",
      }),
      null,
    );
  });

  it("requires an explicit save before a suggestion becomes revision 1", async () => {
    const store = storeOf();
    const suggestion = "Open Tuesday through Friday.";
    assert.equal(store.snapshot().length, 0);
    const saved = await saveProspect(store, "knowledge_base", suggestion, null);
    assert.equal(saved.ok && saved.revision, 1);
    assert.equal(store.snapshot()[0]?.content, suggestion);
  });
});

describe("getoblic content editor", () => {
  it("keeps a generated draft unsaved until Save, on both surfaces and artifacts", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("getoblic-content-draft")) {
        const artifact = url.endsWith("/knowledge-base") ? "knowledge_base" : "description";
        return jsonResponse({ ok: true, artifact, text: `Draft ${artifact}` });
      }
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        ok: true,
        artifactType: payload.artifactType,
        revision: 1,
        content: payload.content,
        created: true,
        savedAt: NOW.toISOString(),
      });
    }) as typeof fetch;

    try {
      for (const surface of ["prospect", "client"] as const) {
        for (const artifact of ["description", "knowledge_base"] as const) {
          calls.length = 0;
          const mounted = mountEditor({ surface, artifact });
          assert.equal(textarea(mounted.container, artifact).value, "");
          assert.equal(
            mounted.container.querySelector("section")?.getAttribute("data-getoblic-content-persistence"),
            "empty",
          );
          await clickAction(mounted.container, "generate");
          assert.deepEqual(calls, [`POST ${draftUrl(surface, artifact)}`]);
          assert.equal(textarea(mounted.container, artifact).value, `Draft ${artifact}`);
          assert.equal(
            mounted.container.querySelector("section")?.getAttribute("data-getoblic-content-persistence"),
            "draft",
          );
          assert.equal(calls.some((call) => call.includes("getoblic-directory")), false);
          await clickAction(mounted.container, "save");
          assert.equal(calls.length, 2);
          assert.equal(calls[1].includes("getoblic-content-draft"), false);
          assert.equal(calls[1].includes("getoblic-directory"), false);
          const savedSection = mounted.container.querySelector("section");
          assert.equal(savedSection?.getAttribute("data-getoblic-content-state"), "saved");
          assert.equal(savedSection?.getAttribute("data-getoblic-content-revision"), "1");
          mounted.unmount();
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves a dirty draft across rerender and conflict, then reloads on request", async () => {
    const mounted = mountEditor({
      surface: "prospect",
      artifact: "description",
      saved: { revision: 2, content: "Saved description" },
      stamp: "first",
    });
    const originalFetch = globalThis.fetch;
    const originalConfirm = window.confirm;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return jsonResponse({
          ok: true,
          artifactType: "description",
          saved: {
            revision: 4,
            content: "Newer saved description",
            savedAt: NOW.toISOString(),
          },
        });
      }
      void input;
      return jsonResponse(
        { ok: false, error: { code: "CONFLICT", message: "A newer saved version exists." } },
        409,
      );
    }) as typeof fetch;
    window.confirm = () => true;

    try {
      commitValue(textarea(mounted.container, "description"), "Unsaved prospect draft");
      mounted.rerender("second");
      assert.equal(textarea(mounted.container, "description").value, "Unsaved prospect draft");
      assert.equal(mounted.container.querySelector("[data-stamp]")?.textContent, "second");
      await clickAction(mounted.container, "save");
      assert.equal(textarea(mounted.container, "description").value, "Unsaved prospect draft");
      const section = mounted.container.querySelector("section");
      assert.equal(section?.getAttribute("data-getoblic-content-state"), "conflict");
      assert.equal(section?.getAttribute("data-getoblic-content-dirty"), "true");
      assert.match(mounted.container.textContent ?? "", /A newer saved version exists/);
      await clickAction(mounted.container, "reload");
      assert.equal(textarea(mounted.container, "description").value, "Newer saved description");
      assert.equal(
        mounted.container.querySelector("section")?.getAttribute("data-getoblic-content-revision"),
        "4",
      );
      assert.equal(
        mounted.container.querySelector("section")?.getAttribute("data-getoblic-content-dirty"),
        "false",
      );
    } finally {
      globalThis.fetch = originalFetch;
      window.confirm = originalConfirm;
      mounted.unmount();
    }
  });

  it("asks before regenerate replaces a dirty draft and does not ask when the draft is clean", async () => {
    const mounted = mountEditor({
      surface: "client",
      artifact: "description",
      saved: { revision: 1, content: "Approved description" },
    });
    const originalFetch = globalThis.fetch;
    const originalConfirm = window.confirm;
    let confirmations = 0;
    let fetches = 0;
    window.confirm = () => {
      confirmations += 1;
      return false;
    };
    globalThis.fetch = (async () => {
      fetches += 1;
      return jsonResponse({
        ok: true,
        artifact: "description",
        text: "Replacement draft",
      });
    }) as typeof fetch;

    try {
      await clickAction(mounted.container, "generate");
      assert.equal(confirmations, 0);
      assert.equal(fetches, 1);
      assert.equal(textarea(mounted.container, "description").value, "Replacement draft");
      await clickAction(mounted.container, "generate");
      assert.equal(confirmations, 1);
      assert.equal(fetches, 1);
      assert.equal(textarea(mounted.container, "description").value, "Replacement draft");
      window.confirm = () => {
        confirmations += 1;
        return true;
      };
      await clickAction(mounted.container, "generate");
      assert.equal(fetches, 2);
    } finally {
      globalThis.fetch = originalFetch;
      window.confirm = originalConfirm;
      mounted.unmount();
    }
  });

  it("warns before unload only while the draft is dirty and ignores a second save click", async () => {
    const mounted = mountEditor({ surface: "prospect", artifact: "description" });
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async () => {
      calls += 1;
      await gate;
      return jsonResponse({
        ok: true,
        artifactType: "description",
        revision: 1,
        content: "Held draft",
        created: true,
        savedAt: NOW.toISOString(),
      });
    }) as typeof fetch;

    try {
      const idleEvent = new window.Event("beforeunload", { cancelable: true });
      window.dispatchEvent(idleEvent);
      assert.equal(idleEvent.defaultPrevented, false);
      commitValue(textarea(mounted.container, "description"), "Held draft");
      const dirtyEvent = new window.Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirtyEvent);
      assert.equal(dirtyEvent.defaultPrevented, true);
      const saveButton = actionButton(mounted.container, "save");
      await act(async () => {
        saveButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        saveButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      assert.equal(calls, 1);
      release?.();
      await act(async () => {
        await gate;
      });
    } finally {
      globalThis.fetch = originalFetch;
      mounted.unmount();
    }
  });

  it("shows the historical knowledge base as unsaved until Save", async () => {
    const mounted = mountEditor({
      surface: "client",
      artifact: "knowledge_base",
      historicalSuggestion: "Open Tuesday through Friday.",
    });
    const originalFetch = globalThis.fetch;
    let payload: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return jsonResponse({
        ok: true,
        artifactType: "knowledge_base",
        revision: 1,
        content: payload?.content,
        created: true,
        savedAt: NOW.toISOString(),
      });
    }) as typeof fetch;

    try {
      const section = mounted.container.querySelector("section");
      assert.equal(section?.getAttribute("data-getoblic-content-persistence"), "suggestion");
      assert.equal(section?.getAttribute("data-getoblic-content-state"), "suggestion");
      assert.equal(textarea(mounted.container, "knowledge_base").value, "Open Tuesday through Friday.");
      assert.match(mounted.container.textContent ?? "", /Not saved yet/);
      assert.match(mounted.container.textContent ?? "", /not saved until you choose Save/i);
      assert.equal(payload, null);
      await clickAction(mounted.container, "save");
      assert.deepEqual(payload, {
        artifactType: "knowledge_base",
        content: "Open Tuesday through Friday.",
        expectedRevision: null,
      });
      assert.equal(
        mounted.container.querySelector("section")?.getAttribute("data-getoblic-content-state"),
        "saved",
      );
    } finally {
      globalThis.fetch = originalFetch;
      mounted.unmount();
    }
  });

  it("blocks an over-limit description in the editor and keeps existing prospect controls", () => {
    assert.equal(getoblicContentMaxChars("description"), 4000);
    assert.equal(getoblicContentMaxChars("knowledge_base"), 20_000);
    assert.equal(
      canSaveGetoblicContent({
        activity: "idle",
        text: "K".repeat(20_001),
        maxChars: 20_000,
        revision: null,
        dirty: true,
        needsReload: false,
      }),
      false,
    );
    const mounted = mountEditor({
      surface: "prospect",
      artifact: "description",
      showGenerate: false,
    });
    commitValue(textarea(mounted.container, "description"), "A".repeat(4001));
    assert.equal(actionButton(mounted.container, "save").disabled, true);
    assert.match(mounted.container.textContent ?? "", /4000 characters or fewer/);
    assert.equal(mounted.container.querySelector("[data-getoblic-content-action='generate']"), null);
    mounted.unmount();

    const page = read("app/prospects/[id]/page.tsx");
    const cardStart = page.indexOf("<ProspectGetoblicDescriptionCard");
    const cardEnd = page.indexOf("/>", cardStart);
    const card = page.slice(cardStart, cardEnd);
    assert.match(card, /showGenerate=\{false\}/);
    assert.match(page, /showGenerate=\{showSyncAi\}/);
    assert.doesNotMatch(page, /GetOblicListingOutboundControls/);
    assert.match(page, /GetOblicListingReleaseControl/);
    assert.match(page, /ProspectFunnelShortLinks/);
    assert.match(page, /ProspectRefreshIntelligenceButton/);
    assert.match(page, /ProspectMetadataEditor/);
    assert.match(page, /ProspectConvertToClientAction/);
    assert.match(page, /ExecutiveIntelligenceWorkspace/);
    assert.match(page, /generatedListingDescription=\{prospect\.generated_listing_description\}/);
    assert.doesNotMatch(page, /hasCurrentKnowledgeBaseAsset/);
    assert.equal((page.match(/<GetoblicContentEditor/g) ?? []).length, 2);
    assert.doesNotMatch(page, /saveProspectDirectoryArtifact/);
    assert.equal(
      existsSync(join(ROOT, "app/api/prospects/[id]/getoblic-description/route.ts")),
      true,
    );

    const workspace = read(
      "components/clientProspectIntelligence/ClientProspectIntelligenceWorkspace.tsx",
    );
    assert.equal((workspace.match(/<GetoblicContentEditor/g) ?? []).length, 2);
    assert.match(workspace, /surface="client"/);
    assert.doesNotMatch(workspace, /prospectId=/);
    assert.doesNotMatch(
      workspace,
      /ExecutiveIntelligenceWorkspace|ProspectRefreshIntelligenceButton|GetOblicListing|ProspectConvertToClientAction/,
    );
    const editor = read("components/prospects/GetoblicContentEditor.tsx");
    assert.match(editor, /beforeunload/);
    assert.match(editor, /window\.confirm\(copy\.replaceDirtyConfirm\)/);
    assert.match(editor, /getoblic-content-draft\/\$\{leaf\}/);
    assert.match(editor, /"description" : "knowledge-base"/);
    assert.match(editor, /data-getoblic-content-action="send"/);
    assert.match(editor, /getoblic-publication/);
    assert.doesNotMatch(editor, /generated_listing_description|router\.refresh/);
    const sendFn = editor.slice(
      editor.indexOf("async function sendSaved"),
      editor.indexOf("async function reloadSaved"),
    );
    assert.match(sendFn, /method: "POST"/);
    assert.doesNotMatch(sendFn, /JSON\.stringify|body:/);
    const seeded = initialGetoblicEditorContent({
      artifact: "knowledge_base",
      saved: null,
      historicalSuggestion: "Open Tuesday through Friday.",
    });
    assert.equal(seeded.revision, null);
    assert.equal(seeded.text, "Open Tuesday through Friday.");
  });
});

describe("getoblic content editor catalog", () => {
  it("keeps the same editor keys in all six languages", () => {
    const canonical = Object.keys(en.clientProspectIntelligence.editor).sort();
    assert.ok(canonical.includes("historicalSuggestion"));
    assert.ok(canonical.includes("conflict"));
    assert.ok(canonical.includes("replaceDirtyConfirm"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const editor = CATALOGS[language].clientProspectIntelligence.editor;
      assert.deepEqual(Object.keys(editor).sort(), canonical);
      for (const key of canonical) {
        const text = editor[key as keyof typeof editor];
        assert.equal(typeof text, "string");
        assert.ok(text.trim().length > 0, `${language}.${key}`);
      }
      assert.match(editor.savedRevision, /\{revision\}/);
      assert.match(editor.characterCount, /\{count\}/);
      assert.match(editor.characterCount, /\{max\}/);
      assert.match(editor.descriptionTooLong, /4000/);
      assert.match(editor.knowledgeBaseTooLong, /20000/);
    }
    assert.notEqual(
      fr.clientProspectIntelligence.editor.save,
      en.clientProspectIntelligence.editor.save,
    );
    assert.notEqual(
      es.clientProspectIntelligence.editor.save,
      en.clientProspectIntelligence.editor.save,
    );
    assert.notEqual(
      itMessages.clientProspectIntelligence.editor.save,
      en.clientProspectIntelligence.editor.save,
    );
    assert.notEqual(
      de.clientProspectIntelligence.editor.save,
      en.clientProspectIntelligence.editor.save,
    );
    assert.notEqual(
      pt.clientProspectIntelligence.editor.save,
      en.clientProspectIntelligence.editor.save,
    );
  });
});

function draftUrl(surface: "prospect" | "client", artifact: ArtifactName): string {
  const leaf = artifact === "description" ? "description" : "knowledge-base";
  if (surface === "client") {
    return `/api/client-prospect-intelligence/getoblic-content-draft/${leaf}`;
  }
  return `/api/prospects/${PROSPECT}/getoblic-content-draft/${leaf}`;
}

function jsonResponse(bodyValue: unknown, status = 200): Response {
  return new Response(JSON.stringify(bodyValue), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ensureDom(): HTMLElement {
  const existing = document.getElementById("getoblic-content-editor-root");
  assert.ok(existing);
  return existing;
}

function mountEditor(input: {
  surface: "prospect" | "client";
  artifact: ArtifactName;
  saved?: { revision: number; content: string } | null;
  historicalSuggestion?: string | null;
  showGenerate?: boolean;
  stamp?: string;
}): {
  container: HTMLElement;
  rerender: (stamp: string) => void;
  unmount: () => void;
} {
  const container = ensureDom();
  container.replaceChildren();
  const root: Root = createRoot(container);
  const render = (stamp: string) => {
    act(() => {
      root.render(
        createElement(
          "div",
          null,
          createElement("p", { "data-stamp": stamp }, stamp),
          createElement(GetoblicContentEditor, {
            surface: input.surface,
            prospectId: input.surface === "prospect" ? PROSPECT : undefined,
            artifact: input.artifact,
            saved: input.saved ?? null,
            historicalSuggestion: input.historicalSuggestion ?? null,
            showGenerate: input.showGenerate,
            copy: en.clientProspectIntelligence.editor,
          }),
        ),
      );
    });
  };
  render(input.stamp ?? "mounted");
  return {
    container,
    rerender: render,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.replaceChildren();
    },
  };
}

function textarea(container: ParentNode, artifact: ArtifactName): HTMLTextAreaElement {
  const element = container.querySelector(
    `textarea[data-getoblic-content-field="${artifact}"]`,
  );
  assert.ok(element);
  return element as HTMLTextAreaElement;
}

function actionButton(container: ParentNode, action: string): HTMLButtonElement {
  const element = container.querySelector(
    `button[data-getoblic-content-action="${action}"]`,
  );
  assert.ok(element, action);
  return element as HTMLButtonElement;
}

async function clickAction(container: ParentNode, action: string) {
  const button = actionButton(container, action);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

function commitValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  const previous = element.value;
  setter.call(element, value);
  const tracker = (
    element as HTMLTextAreaElement & { _valueTracker?: { setValue: (next: string) => void } }
  )._valueTracker;
  tracker?.setValue(previous);
  act(() => {
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
