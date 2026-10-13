/**
 * COMM-SAVED-NOTES-1 — organization-private notes on Saved Communities cards.
 * Exercises the editor, the saves request, and the unchanged Find/manual save.
 */
import "./savedCommunityNotesTestDom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, useRef, useState, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import {
  CommunityDiscoveryCards,
  SavedCommunityCards,
  type SaveCommunityNotes,
} from "../../components/communityIntelligence/CommunityDiscoveryCards";
import { CommunityIntelligenceWorkspace } from "../../components/communityIntelligence/CommunityIntelligenceWorkspace";
import {
  parseCommunityDiscoveryPayload,
  parseSaveCommunityPayload,
  requestSaveCommunity,
  requestUpdateSavedCommunityNotes,
  savedCommunityNotesClientError,
  savedCommunityNotesRequestText,
  type SavedCommunityCard,
} from "../../lib/communityIntelligence/communityDiscoveryClient";
import { en } from "../../lib/tenantI18n/messages/en";
import { ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH } from "../../services/communityDiscovery/communityDiscoveryLimits";

const ROOT = process.cwd();
const GROUP_A = "https://www.facebook.com/groups/123456789012345";
const GROUP_B = "https://www.facebook.com/groups/223456789012345";
const copy = en.communityIntelligence;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function card(
  overrides: Partial<SavedCommunityCard> & Pick<SavedCommunityCard, "id" | "canonicalUrl">,
): SavedCommunityCard {
  return {
    displayName: "Independent Retailers",
    qualification: "relevant",
    notes: null,
    ...overrides,
  };
}

function notesField(container: ParentNode, id: string): HTMLTextAreaElement {
  const element = container.querySelector(`textarea[data-saved-notes="${id}"]`);
  assert.ok(element, id);
  return element as HTMLTextAreaElement;
}

function notesButton(container: ParentNode, id: string): HTMLButtonElement {
  const element = container.querySelector(`button[data-saved-notes-action="${id}"]`);
  assert.ok(element, id);
  return element as HTMLButtonElement;
}

function notesStatus(container: ParentNode, id: string): HTMLElement {
  const element = container.querySelector(`[data-saved-notes-status="${id}"]`);
  assert.ok(element, id);
  return element as HTMLElement;
}

function commitValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    element.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter);
  const previous = element.value;
  setter.call(element, value);
  const tracker = (
    element as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } }
  )._valueTracker;
  tracker?.setValue(previous);
  act(() => {
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function mount(node: ReactNode): { container: HTMLElement; unmount: () => void } {
  const container = document.getElementById("saved-community-notes-root");
  assert.ok(container);
  container.replaceChildren();
  const root: Root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.replaceChildren();
    },
  };
}

async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function saveRecord(
  input: SavedCommunityCard,
): SavedCommunityCard & { platform: "facebook_groups" } {
  return { platform: "facebook_groups", ...input };
}

function staticNotes(saves: SavedCommunityCard[]): string {
  return renderToStaticMarkup(
    createElement(SavedCommunityCards, {
      saves,
      copy,
      onSaveNotes: () => Promise.reject(new Error("static render must not save")),
    }),
  );
}

describe("saved community notes editor", () => {
  it("renders an empty editor when notes are null and hydrates an existing note", () => {
    const html = staticNotes([
      card({
        id: "save-a",
        canonicalUrl: GROUP_A,
        displayName: "Independent Retailers",
        qualification: "not_relevant",
        notes: null,
      }),
      card({
        id: "save-b",
        canonicalUrl: GROUP_B,
        displayName: "Shop Owners",
        qualification: "relevant",
        notes: "Ask about winter buying.",
      }),
    ]);
    const fields = [...html.matchAll(/<textarea[^>]*>([\s\S]*?)<\/textarea>/g)];
    assert.equal(fields.length, 2);
    assert.equal(fields[0]?.[1], "");
    assert.equal(fields[1]?.[1], "Ask about winter buying.");
    assert.equal(html.match(/Save Notes/g)?.length, 2);
    assert.match(html, /Use plain text without line breaks/);
    assert.match(html, /Saved as not relevant/);
    assert.match(html, /Saved as relevant/);
    assert.ok(html.indexOf("Saved as not relevant") < html.indexOf("<textarea"));
    assert.ok(html.lastIndexOf("<textarea") < html.lastIndexOf(">Open Group<"));
    assert.equal(html.match(new RegExp(`href="${GROUP_A}"`, "g"))?.length, 1);
    assert.equal(html.match(new RegExp(`href="${GROUP_B}"`, "g"))?.length, 1);
  });

  it("sends the card qualification and notes, then shows the saved server text", async () => {
    const calls: Array<{ canonicalUrl: string; qualification: string; notes: string }> = [];
    function Harness() {
      const [saves, setSaves] = useState<SavedCommunityCard[]>([
        card({
          id: "save-a",
          canonicalUrl: GROUP_A,
          displayName: "Independent Retailers",
          qualification: "not_relevant",
          notes: null,
        }),
        card({
          id: "save-b",
          canonicalUrl: GROUP_B,
          displayName: "Shop Owners",
          notes: "Keep B",
        }),
      ]);
      const savesRef = useRef(saves);
      savesRef.current = saves;
      const onSaveNotes: SaveCommunityNotes = async (input) => {
        calls.push(input);
        const found = savesRef.current.find((save) => save.canonicalUrl === input.canonicalUrl);
        assert.ok(found);
        const notes = input.notes.trim() ? input.notes.trim() : null;
        const nextSave = { ...found, qualification: input.qualification, notes };
        setSaves((current) =>
          current.map((save) => (save.canonicalUrl === nextSave.canonicalUrl ? nextSave : save)),
        );
        return { ok: true, save: nextSave };
      };
      return createElement(SavedCommunityCards, { saves, copy, onSaveNotes });
    }

    const view = mount(createElement(Harness));
    try {
      assert.equal(notesField(view.container, "save-a").value, "");
      commitValue(notesField(view.container, "save-b"), "do not lose");
      commitValue(notesField(view.container, "save-a"), "  Private follow-up  ");
      await act(async () => {
        notesButton(view.container, "save-a").click();
      });
      assert.deepEqual(calls, [
        {
          canonicalUrl: GROUP_A,
          qualification: "not_relevant",
          notes: "  Private follow-up  ",
        },
      ]);
      assert.equal(notesField(view.container, "save-a").value, "Private follow-up");
      assert.equal(notesStatus(view.container, "save-a").textContent, copy.notesSaved);
      assert.equal(notesField(view.container, "save-b").value, "do not lose");
      assert.match(view.container.textContent ?? "", /Independent Retailers/);
      assert.match(view.container.textContent ?? "", /Shop Owners/);
      assert.equal(
        view.container.querySelectorAll('a[href="' + GROUP_A + '"]').length,
        1,
      );
    } finally {
      view.unmount();
    }
  });

  it("sends an empty note to clear whitespace and keeps the cleared field", async () => {
    const calls: string[] = [];
    function Harness() {
      const [saves, setSaves] = useState<SavedCommunityCard[]>([
        card({
          id: "save-a",
          canonicalUrl: GROUP_A,
          notes: "old note",
        }),
      ]);
      const onSaveNotes: SaveCommunityNotes = async (input) => {
        calls.push(input.notes);
        const nextSave = { ...saves[0], notes: null };
        setSaves([nextSave]);
        return { ok: true, save: nextSave };
      };
      return createElement(SavedCommunityCards, { saves, copy, onSaveNotes });
    }

    const view = mount(createElement(Harness));
    try {
      assert.equal(notesField(view.container, "save-a").value, "old note");
      commitValue(notesField(view.container, "save-a"), "   ");
      await act(async () => {
        notesButton(view.container, "save-a").click();
      });
      assert.deepEqual(calls, [""]);
      assert.equal(notesField(view.container, "save-a").value, "");
      assert.equal(notesStatus(view.container, "save-a").textContent, copy.notesCleared);
    } finally {
      view.unmount();
    }
  });

  it("keeps a dirty draft when another card refreshes or the stored note changes", () => {
    function Harness() {
      const [saves, setSaves] = useState<SavedCommunityCard[]>([
        card({ id: "save-a", canonicalUrl: GROUP_A, notes: "original note" }),
        card({
          id: "save-b",
          canonicalUrl: GROUP_B,
          displayName: "Shop Owners",
          qualification: "not_relevant",
          notes: null,
        }),
      ]);
      return createElement(
        "div",
        null,
        createElement(
          "button",
          {
            type: "button",
            id: "refresh-other",
            onClick: () => {
              setSaves((current) =>
                current.map((save) =>
                  save.id === "save-b"
                    ? { ...save, notes: "refreshed other" }
                    : { ...save },
                ),
              );
            },
          },
          "Refresh other",
        ),
        createElement(
          "button",
          {
            type: "button",
            id: "refresh-saved",
            onClick: () => {
              setSaves((current) =>
                current.map((save) =>
                  save.id === "save-a" ? { ...save, notes: "server replaced" } : save,
                ),
              );
            },
          },
          "Refresh saved note",
        ),
        createElement(SavedCommunityCards, {
          saves,
          copy,
          onSaveNotes: () => Promise.reject(new Error("refresh must not save")),
        }),
      );
    }

    const view = mount(createElement(Harness));
    try {
      commitValue(notesField(view.container, "save-a"), "dirty draft");
      act(() => {
        view.container.querySelector<HTMLButtonElement>("#refresh-other")?.click();
      });
      assert.equal(notesField(view.container, "save-a").value, "dirty draft");
      assert.equal(notesField(view.container, "save-b").value, "refreshed other");
      act(() => {
        view.container.querySelector<HTMLButtonElement>("#refresh-saved")?.click();
      });
      assert.equal(notesField(view.container, "save-a").value, "dirty draft");
      assert.equal(notesField(view.container, "save-b").value, "refreshed other");
    } finally {
      view.unmount();
    }
  });

  it("adopts a refreshed note when the local draft is still clean", () => {
    function Harness() {
      const [saves, setSaves] = useState<SavedCommunityCard[]>([
        card({ id: "save-a", canonicalUrl: GROUP_A, notes: "original note" }),
      ]);
      return createElement(
        "div",
        null,
        createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              setSaves((current) =>
                current.map((save) => ({ ...save, notes: "from another session" })),
              );
            },
          },
          "Refresh clean",
        ),
        createElement(SavedCommunityCards, {
          saves,
          copy,
          onSaveNotes: () => Promise.reject(new Error("clean refresh must not save")),
        }),
      );
    }

    const view = mount(createElement(Harness));
    try {
      assert.equal(notesField(view.container, "save-a").value, "original note");
      act(() => {
        view.container.querySelector("button")?.click();
      });
      assert.equal(notesField(view.container, "save-a").value, "from another session");
    } finally {
      view.unmount();
    }
  });

  it("keeps the draft and shows an error when saving fails", async () => {
    const view = mount(
      createElement(SavedCommunityCards, {
        saves: [card({ id: "save-a", canonicalUrl: GROUP_A, notes: "original note" })],
        copy,
        onSaveNotes: async () => ({ ok: false, error: "saveFailed" }),
      }),
    );
    try {
      commitValue(notesField(view.container, "save-a"), "keep this draft");
      await act(async () => {
        notesButton(view.container, "save-a").click();
      });
      assert.equal(notesField(view.container, "save-a").value, "keep this draft");
      assert.equal(notesStatus(view.container, "save-a").textContent, copy.errors.saveFailed);
      assert.equal(notesStatus(view.container, "save-a").getAttribute("role"), "alert");
      assert.equal(notesButton(view.container, "save-a").disabled, false);
    } finally {
      view.unmount();
    }
  });

  it("maps a server INVALID_NOTES response onto the notes message and keeps the draft", async () => {
    const view = mount(
      createElement(SavedCommunityCards, {
        saves: [card({ id: "save-a", canonicalUrl: GROUP_A, notes: null })],
        copy,
        onSaveNotes: async () => ({ ok: false, error: "invalidNotes" }),
      }),
    );
    try {
      commitValue(notesField(view.container, "save-a"), "still here");
      await act(async () => {
        notesButton(view.container, "save-a").click();
      });
      assert.equal(notesField(view.container, "save-a").value, "still here");
      assert.equal(notesStatus(view.container, "save-a").textContent, copy.errors.invalidNotes);
    } finally {
      view.unmount();
    }
  });

  it("ignores a second save while the same card is already saving", async () => {
    let started = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = mount(
      createElement(SavedCommunityCards, {
        saves: [
          card({ id: "save-a", canonicalUrl: GROUP_A, notes: null }),
          card({ id: "save-b", canonicalUrl: GROUP_B, displayName: "Shop Owners", notes: null }),
        ],
        copy,
        onSaveNotes: (input) => {
          if (input.canonicalUrl !== GROUP_A) {
            return Promise.resolve({
              ok: true as const,
              save: card({ id: "save-b", canonicalUrl: GROUP_B, displayName: "Shop Owners", notes: "b" }),
            });
          }
          started += 1;
          return gate.then(() => ({
            ok: true as const,
            save: card({ id: "save-a", canonicalUrl: GROUP_A, notes: "once" }),
          }));
        },
      }),
    );
    try {
      commitValue(notesField(view.container, "save-a"), "once");
      await act(async () => {
        notesButton(view.container, "save-a").click();
      });
      assert.equal(notesButton(view.container, "save-a").disabled, true);
      assert.equal(notesField(view.container, "save-a").disabled, true);
      assert.equal(notesButton(view.container, "save-a").textContent, copy.saving);
      assert.equal(notesButton(view.container, "save-b").disabled, false);
      await act(async () => {
        notesButton(view.container, "save-a").click();
      });
      assert.equal(started, 1);
      assert.ok(release);
      await act(async () => {
        release?.();
        await gate;
      });
      assert.equal(started, 1);
      assert.equal(notesField(view.container, "save-a").value, "once");
      assert.equal(notesButton(view.container, "save-a").disabled, false);
    } finally {
      view.unmount();
    }
  });

  it("rejects control characters and notes longer than 2000 without changing the draft", () => {
    const calls: unknown[] = [];
    const view = mount(
      createElement(SavedCommunityCards, {
        saves: [card({ id: "save-a", canonicalUrl: GROUP_A, notes: "hello" })],
        copy,
        onSaveNotes: (input) => {
          calls.push(input);
          return Promise.resolve({
            ok: true as const,
            save: card({ id: "save-a", canonicalUrl: GROUP_A, notes: input.notes }),
          });
        },
      }),
    );
    try {
      const field = notesField(view.container, "save-a");
      for (const rejected of ["hello\nthere", "hello\rthere", "hello\tthere", "hello\u007F", "a".repeat(2001)]) {
        commitValue(field, rejected);
        assert.equal(field.value, "hello");
        assert.equal(notesStatus(view.container, "save-a").textContent, copy.errors.invalidNotes);
      }
      assert.deepEqual(calls, []);

      const lineBreak = new window.InputEvent("beforeinput", {
        inputType: "insertLineBreak",
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(lineBreak);
      assert.equal(lineBreak.defaultPrevented, true);

      const enter = new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(enter);
      assert.equal(enter.defaultPrevented, true);
      assert.equal(field.value, "hello");
      assert.deepEqual(calls, []);

      commitValue(field, "a".repeat(ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH));
      assert.equal(field.value, "a".repeat(ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH));
      assert.equal(view.container.querySelector("[data-saved-notes-status='save-a']"), null);
    } finally {
      view.unmount();
    }
  });
});

describe("saved community notes requests", () => {
  it("rejects the same notes the server rejects and clears whitespace to an empty string", () => {
    assert.equal(savedCommunityNotesClientError("hello"), null);
    assert.equal(savedCommunityNotesClientError("a".repeat(2000)), null);
    assert.equal(savedCommunityNotesClientError(` ${"a".repeat(2000)} `), null);
    assert.equal(savedCommunityNotesClientError(" ".repeat(3000)), null);
    assert.equal(savedCommunityNotesClientError("a".repeat(2001)), "invalidNotes");
    assert.equal(savedCommunityNotesClientError("hello\nthere"), "invalidNotes");
    assert.equal(savedCommunityNotesClientError("hello\rthere"), "invalidNotes");
    assert.equal(savedCommunityNotesClientError("hello\tthere"), "invalidNotes");
    assert.equal(savedCommunityNotesClientError("hello\u007F"), "invalidNotes");
    assert.equal(savedCommunityNotesRequestText("   "), "");
    assert.equal(savedCommunityNotesRequestText(""), "");
    assert.equal(savedCommunityNotesRequestText("  hello  "), "  hello  ");
    assert.deepEqual(
      parseSaveCommunityPayload({
        ok: false,
        error: {
          code: "INVALID_NOTES",
          message: "Notes must be plain text of at most 2000 characters.",
        },
      }),
      { ok: false, error: "invalidNotes" },
    );
  });

  it("posts notes with the card qualification and leaves Find/manual save without notes", async () => {
    const original = globalThis.fetch;
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      bodies.push(body);
      const notes = body && typeof body === "object" && "notes" in body ? body.notes : "existing private";
      const qualification =
        body && typeof body === "object" && body.qualification === "not_relevant"
          ? "not_relevant"
          : "relevant";
      return jsonResponse({
        ok: true,
        save: saveRecord(
          card({
            id: "save-1",
            canonicalUrl: typeof body?.canonicalUrl === "string" ? body.canonicalUrl : GROUP_A,
            qualification,
            notes: notes === "" ? null : notes,
          }),
        ),
      });
    }) as typeof fetch;

    try {
      const saved = await requestSaveCommunity(GROUP_A);
      assert.equal(saved.ok, true);
      assert.deepEqual(bodies[0], {
        canonicalUrl: GROUP_A,
        qualification: "relevant",
      });
      assert.equal(saved.ok && saved.save.notes, "existing private");

      const cleared = await requestUpdateSavedCommunityNotes({
        canonicalUrl: GROUP_B,
        qualification: "not_relevant",
        notes: "",
      });
      assert.deepEqual(bodies[1], {
        canonicalUrl: GROUP_B,
        qualification: "not_relevant",
        notes: "",
      });
      assert.equal(cleared.ok, true);
      if (!cleared.ok) return;
      assert.equal(cleared.save.qualification, "not_relevant");
      assert.equal(cleared.save.notes, null);
    } finally {
      globalThis.fetch = original;
    }

    const workspace = read("components/communityIntelligence/CommunityIntelligenceWorkspace.tsx");
    const onSave = workspace.slice(
      workspace.indexOf("async function onSave"),
      workspace.indexOf("async function onManualSave"),
    );
    const onManual = workspace.slice(
      workspace.indexOf("async function onManualSave"),
      workspace.indexOf("async function onSaveNotes"),
    );
    const onFindMore = workspace.slice(
      workspace.indexOf("async function onFindMore"),
      workspace.indexOf("async function onSave"),
    );
    assert.match(onSave, /requestSaveCommunity\(canonicalUrl\)/);
    assert.doesNotMatch(onSave, /requestUpdateSavedCommunityNotes|notes:/);
    assert.match(onManual, /requestSaveCommunity\(canonicalUrl\)/);
    assert.doesNotMatch(onManual, /requestUpdateSavedCommunityNotes|notes:/);
    assert.match(onFindMore, /requestMoreCommunities/);
    assert.match(onFindMore, /appendCommunityDiscoveryCards/);
    assert.doesNotMatch(onFindMore, /notes|requestUpdateSavedCommunityNotes/);
  });

  it("keeps a pasted group save from sending notes and leaves them off the find confirmation", async () => {
    const original = globalThis.fetch;
    const posts: unknown[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/saves") && init?.method === "POST") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
        posts.push(body);
        return jsonResponse({
          ok: true,
          save: saveRecord(
            card({
              id: "save-new",
              canonicalUrl: GROUP_A,
              displayName: "Independent Retailers",
              notes: "organization private note",
            }),
          ),
        });
      }
      return jsonResponse({ ok: true, saves: [] });
    }) as typeof fetch;

    const container = document.getElementById("saved-community-notes-root");
    assert.ok(container);
    container.replaceChildren();
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(CommunityIntelligenceWorkspace, { messages: en }));
      });
      await settle();
      const input = container.querySelector<HTMLInputElement>("#community-manual-url");
      assert.ok(input);
      commitValue(input, GROUP_A);
      const saveUrl = [...container.querySelectorAll("button")].find(
        (node) => node.textContent === copy.saveManualUrl,
      );
      assert.ok(saveUrl);
      await act(async () => {
        (saveUrl as HTMLButtonElement).click();
      });
      await settle();
      await settle();
      assert.deepEqual(posts, [
        { canonicalUrl: GROUP_A, qualification: "relevant" },
      ]);
      assert.equal((container.textContent ?? "").includes("organization private note"), false);
      const savedTab = [...container.querySelectorAll('[role="tab"]')].find(
        (node) => node.textContent === copy.viewSaved,
      );
      assert.ok(savedTab);
      await act(async () => {
        (savedTab as HTMLButtonElement).click();
      });
      await settle();
      assert.equal(notesField(container, "save-new").value, "organization private note");
      assert.equal(container.querySelectorAll(`a[href="${GROUP_A}"]`).length, 1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.replaceChildren();
      globalThis.fetch = original;
    }
  });

  it("merges a returned note into the saved list and leaves the other card's draft", async () => {
    const original = globalThis.fetch;
    const posts: unknown[] = [];
    const savedA = card({
      id: "save-a",
      canonicalUrl: GROUP_A,
      displayName: "Independent Retailers",
      qualification: "not_relevant",
      notes: null,
    });
    const savedB = card({
      id: "save-b",
      canonicalUrl: GROUP_B,
      displayName: "Shop Owners",
      notes: "Keep B",
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/saves") && init?.method === "POST") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
        posts.push(body);
        return jsonResponse({
          ok: true,
          save: saveRecord({ ...savedA, notes: "Private follow-up" }),
        });
      }
      return jsonResponse({
        ok: true,
        saves: [saveRecord(savedA), saveRecord(savedB)],
      });
    }) as typeof fetch;

    const container = document.getElementById("saved-community-notes-root");
    assert.ok(container);
    container.replaceChildren();
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(CommunityIntelligenceWorkspace, { messages: en }));
      });
      await settle();
      const savedTab = [...container.querySelectorAll('[role="tab"]')].find(
        (node) => node.textContent === copy.viewSaved,
      );
      assert.ok(savedTab);
      await act(async () => {
        (savedTab as HTMLButtonElement).click();
      });
      await settle();
      commitValue(notesField(container, "save-b"), "do not lose");
      commitValue(notesField(container, "save-a"), "Private follow-up");
      await act(async () => {
        notesButton(container, "save-a").click();
      });
      await settle();
      assert.deepEqual(posts, [
        {
          canonicalUrl: GROUP_A,
          qualification: "not_relevant",
          notes: "Private follow-up",
        },
      ]);
      assert.equal(notesField(container, "save-a").value, "Private follow-up");
      assert.equal(notesStatus(container, "save-a").textContent, copy.notesSaved);
      assert.equal(notesField(container, "save-b").value, "do not lose");
      assert.match(container.textContent ?? "", /Independent Retailers/);
      assert.match(container.textContent ?? "", /Shop Owners/);
      assert.equal(container.querySelectorAll(`a[href="${GROUP_A}"]`).length, 1);
      assert.equal(container.querySelectorAll(`a[href="${GROUP_B}"]`).length, 1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.replaceChildren();
      globalThis.fetch = original;
    }
  });
});

describe("saved notes stay off the public catalog and discovery cards", () => {
  it("does not copy notes onto discovery cards or the public catalog write", () => {
    const parsed = parseCommunityDiscoveryPayload({
      ok: true,
      discovery: {
        platform: "facebook_groups",
        qualification: { status: "available" },
        results: [
          {
            platform: "facebook_groups",
            canonicalUrl: GROUP_A,
            displayName: "Independent Retailers",
            notes: "should not leak",
            evidence: { snippet: "Shop owners compare winter buying" },
            qualification: {
              status: "available",
              explanation: "The group discusses wholesale buying for independent shops.",
              engagementGuidance: "Ask how shop owners compare notes.",
              suggestedContribution:
                "Hello, I am looking for how shop owners compare notes on wholesale buying.",
            },
          },
        ],
      },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal("notes" in parsed.discovery.cards[0], false);
    assert.equal(JSON.stringify(parsed.discovery.cards).includes("should not leak"), false);

    const html = renderToStaticMarkup(
      createElement(CommunityDiscoveryCards, {
        cards: parsed.discovery.cards,
        copy,
        notices: {},
        onSave: () => undefined,
      }),
    );
    assert.equal(html.includes("should not leak"), false);
    assert.equal(html.includes("Save Notes"), false);
    assert.match(html, /Suggested contribution/);
    assert.match(html, />Open Group</);
    assert.match(html, /Hello, I am looking for how shop owners compare notes/);

    const persistence = read("services/communityDiscovery/communityDiscoveryPersistence.ts");
    const publicColumns = persistence.match(/const PUBLIC_COMMUNITY_COLUMNS =\s*\n\s*"([^"]+)"/);
    assert.ok(publicColumns);
    assert.equal(publicColumns[1].includes("notes"), false);
    const insertStart = persistence.indexOf("async function insertPublicCommunitiesIfAbsent");
    const insertEnd = persistence.indexOf("function acceptedDisplayNameRepair");
    assert.equal(persistence.slice(insertStart, insertEnd).includes("notes"), false);
    assert.match(persistence, /from\("athena_organization_communities"\)/);
    assert.match(persistence, /notes: input\.notes/);
  });

  it("still lets a suggested contribution be edited on a discovery card", () => {
    const view = mount(
      createElement(CommunityDiscoveryCards, {
        cards: [
          {
            canonicalUrl: GROUP_A,
            displayName: "Independent Retailers",
            explanation: "The group discusses wholesale buying for independent shops.",
            engagementGuidance: "Ask how shop owners compare notes.",
            suggestedContribution: "Hello from the qualification draft.",
            readyToPasteUnavailable: false,
            qualificationUnavailable: false,
            relevanceNoteUnavailable: false,
            listingSnippet: null,
          },
        ],
        copy,
        notices: {},
        onSave: () => undefined,
      }),
    );
    try {
      const suggestion = view.container.querySelector("textarea");
      assert.ok(suggestion);
      assert.equal(view.container.querySelector("[data-saved-notes]"), null);
      assert.equal(suggestion.value, "Hello from the qualification draft.");
      commitValue(suggestion, "Edited before I copy it myself.");
      assert.equal(suggestion.value, "Edited before I copy it myself.");
      assert.match(view.container.textContent ?? "", /Open Group/);
      assert.match(view.container.textContent ?? "", /Copy/);
      assert.equal((view.container.textContent ?? "").includes("Save Notes"), false);
    } finally {
      view.unmount();
    }
  });
});
