/**
 * Appendix heading keystrokes must keep the same section input mounted.
 * Heading text is content, not section identity.
 */
import "./clientQuoteAppendixHeadingTestDom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it } from "node:test";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import type { ClientQuoteEditorDraft } from "../../lib/licensee/clientQuoteEditorModel";

const messages = getLicenseeLocalization("en").messages;

function address() {
  return {
    line1: "1 Market Street",
    line2: "",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "United States",
  };
}

function editorWithSections(): ClientQuoteEditorDraft {
  return {
    issuer: {
      legalName: "Acme Legal",
      tradingName: "Acme",
      postalAddress: address(),
      phone: "",
      email: "",
      website: "",
      registrationNumber: "",
      taxIdentifier: "",
      taxIdentifierLabel: "",
      contactName: "",
      jobTitle: "",
      additionalNote: "",
    },
    customer: {
      name: "Northwind Studio",
      contactName: "",
      jobTitle: "",
      postalAddress: address(),
      phone: "",
      email: "",
      taxIdentifier: "",
    },
    projectTitle: "Website rebuild",
    scopeSummary: "Rebuild the marketing site.",
    lines: [],
    discountKind: "none",
    discountAmountText: "",
    discountPercentText: "",
    taxKind: "none",
    taxPercentText: "",
    taxLabel: "",
    paymentSummary: "Due on receipt.",
    paymentScheduleNote: "",
    validForDaysText: "30",
    validUntil: "",
    validityNote: "",
    appendixEnabled: true,
    appendixSections: [
      { heading: "Pricing rationale", body: "Keep this detail." },
      { heading: "Second heading", body: "Other detail." },
    ],
    contentLanguage: "en",
  };
}

function ensureDom(): HTMLElement {
  const existing = document.getElementById("client-quote-appendix-heading-root");
  assert.ok(existing);
  return existing;
}

function mountEditor(initial: ClientQuoteEditorDraft): {
  container: HTMLElement;
  unmount: () => void;
} {
  const container = ensureDom();
  container.replaceChildren();
  const root: Root = createRoot(container);
  function Harness() {
    const [editor, setEditor] = useState(initial);
    return createElement(ClientQuoteEditorView, {
      mode: "draft",
      quoteNumber: null,
      issuedAtLabel: null,
      currencyCode: "USD",
      editor,
      lineTotalsMinor: null,
      totals: null,
      locale: "en-US",
      messages,
      pending: null,
      notice: null,
      error: null,
      missingRequirements: [],
      revisedFromQuoteId: null,
      sourceEstimateId: null,
      onChange: setEditor,
      onSave: () => undefined,
      onIssue: () => undefined,
      onRevise: () => undefined,
    });
  }
  act(() => {
    root.render(createElement(Harness));
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

function input(container: HTMLElement, field: string): HTMLInputElement {
  const element = container.querySelector(`input[data-field="${field}"]`);
  assert.ok(element, field);
  return element as HTMLInputElement;
}

function textarea(container: HTMLElement, field: string): HTMLTextAreaElement {
  const element = container.querySelector(`textarea[data-field="${field}"]`);
  assert.ok(element, field);
  return element as HTMLTextAreaElement;
}

function commitValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    element.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter);
  const previous = element.value;
  setter.call(element, value);
  const tracker = (
    element as HTMLInputElement & {
      _valueTracker?: { setValue: (next: string) => void };
    }
  )._valueTracker;
  tracker?.setValue(previous);
  act(() => {
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

describe("client quote appendix heading editing", () => {
  it("keeps the same heading input mounted while the heading text changes", () => {
    const view = mountEditor(editorWithSections());
    try {
      const heading = input(view.container, "appendix.0.heading");
      const detail = textarea(view.container, "appendix.0.body");
      const sibling = input(view.container, "appendix.1.heading");
      const section = heading.closest("[data-client-quote-appendix]");
      assert.equal(section?.getAttribute("data-client-quote-appendix"), "0");
      heading.focus();
      heading.setSelectionRange(8, 8);

      commitValue(heading, "Pricing extra rationale");
      const afterInsert = input(view.container, "appendix.0.heading");
      assert.equal(afterInsert, heading);
      assert.equal(document.activeElement, heading);
      assert.equal(heading.value, "Pricing extra rationale");
      assert.equal(heading.selectionStart, "Pricing extra rationale".length);
      assert.equal(detail, textarea(view.container, "appendix.0.body"));
      assert.equal(detail.value, "Keep this detail.");
      assert.equal(sibling, input(view.container, "appendix.1.heading"));
      assert.equal(sibling.value, "Second heading");
      assert.equal(
        heading.closest("[data-client-quote-appendix]"),
        section,
      );

      commitValue(heading, "Pricing extra rationale ");
      assert.equal(input(view.container, "appendix.0.heading"), heading);
      assert.equal(document.activeElement, heading);
      assert.equal(heading.value, "Pricing extra rationale ");
      assert.equal(textarea(view.container, "appendix.1.body").value, "Other detail.");
    } finally {
      view.unmount();
    }
  });

  it("keeps the heading input mounted while the section detail changes", () => {
    const view = mountEditor(editorWithSections());
    try {
      const heading = input(view.container, "appendix.0.heading");
      const detail = textarea(view.container, "appendix.0.body");
      detail.focus();
      commitValue(detail, "Keep this detail. More.");
      assert.equal(textarea(view.container, "appendix.0.body"), detail);
      assert.equal(document.activeElement, detail);
      assert.equal(detail.value, "Keep this detail. More.");
      assert.equal(input(view.container, "appendix.0.heading"), heading);
      assert.equal(heading.value, "Pricing rationale");
    } finally {
      view.unmount();
    }
  });

  it("keys each appendix section by position, not by heading text", () => {
    const source = readFileSync(
      join(process.cwd(), "components/licensee/clientQuotes/ClientQuoteEditorView.tsx"),
      "utf8",
    );
    const start = source.indexOf("editor.appendixSections.map");
    const end = source.indexOf("data-client-quote-add-section");
    assert.ok(start > 0 && end > start);
    const block = source.slice(start, end);
    assert.match(block, /key=\{index\}/);
    assert.doesNotMatch(block, /key=\{[^}]*heading/);
    assert.match(block, /field=\{`appendix\.\$\{index\}\.heading`\}/);
    assert.match(block, /field=\{`appendix\.\$\{index\}\.body`\}/);
    assert.match(block, /removeClientQuoteAppendixSection\(editor, index\)/);
    assert.match(source, /data-field="appendix\.enabled"/);
    assert.match(source, /addClientQuoteAppendixSection\(editor\)/);
  });
});
