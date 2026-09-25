import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import { licenseeErrorMessage } from "../../lib/licensee/licenseeErrorPresentation";

const ROOT = process.cwd();
const CLIENT = readFileSync(
  join(ROOT, "components/licensee/LicenseeDashboardClient.tsx"),
  "utf8",
);

const DASHBOARD_ACTION_BODIES = {
  openAthena: extractFunctionBody(CLIENT, "async function openAthena"),
  togglePin: extractFunctionBody(CLIENT, "function togglePin"),
  saveNotes: extractFunctionBody(CLIENT, "async function saveNotes"),
  saveDisplayName: extractFunctionBody(CLIENT, "async function saveDisplayName"),
} as const;

const ACTION_FALLBACKS = {
  openAthena: "messages.errors.openAthenaFailed",
  togglePin: "messages.errors.pinFailed",
  saveNotes: "messages.errors.noteSaveFailed",
  saveDisplayName: "messages.errors.displayNameSaveFailed",
} as const;

function extractFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const brace = source.indexOf("{", start);
  assert.ok(brace >= 0, `missing body for ${signature}`);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(brace, index + 1);
      }
    }
  }
  throw new Error(`unclosed body for ${signature}`);
}

describe("Licensee dashboard action error codes", () => {
  it("Open Athena, Pin, Save Master Note, and Save Master Display Name consume payload.error.code", () => {
    for (const [action, body] of Object.entries(DASHBOARD_ACTION_BODIES)) {
      assert.match(
        body,
        /licenseeErrorMessage\(\s*messages,\s*payload\.error\?\.code,/,
        `${action} must pass payload.error?.code`,
      );
      assert.match(
        body,
        /error\?: \{ code\?: string; message\?: string \}/,
        `${action} payload typing must expose error.code`,
      );
    }
  });

  it("does not use server English payload.error.message as the localized UI fallback", () => {
    for (const [action, body] of Object.entries(DASHBOARD_ACTION_BODIES)) {
      assert.doesNotMatch(
        body,
        /payload\.error\?\.message/,
        `${action} must not surface payload.error.message`,
      );
      assert.doesNotMatch(
        body,
        /licenseeErrorMessage\(\s*messages,\s*undefined,/,
        `${action} must not drop the error code`,
      );
      assert.match(
        body,
        new RegExp(
          `licenseeErrorMessage\\(\\s*messages,\\s*payload\\.error\\?\\.code,\\s*${ACTION_FALLBACKS[action as keyof typeof ACTION_FALLBACKS].replace(/\./g, "\\.")},`,
        ),
        `${action} must keep the localized action fallback`,
      );
    }
  });

  it("known codes map through messages.licensee.errors and unknown codes use the localized action fallback", () => {
    const { messages } = getLicenseeLocalization("fr");
    const englishServerMessage = "Authentication required.";

    const cases = [
      {
        action: "openAthena",
        knownCode: "UNAUTHORIZED",
        unknownCode: "ORG_MISMATCH",
        fallback: messages.errors.openAthenaFailed,
        known: messages.errors.unauthorized,
      },
      {
        action: "togglePin",
        knownCode: "INVALID_BODY",
        unknownCode: "PIN_FAILED",
        fallback: messages.errors.pinFailed,
        known: messages.errors.validation,
      },
      {
        action: "saveNotes",
        knownCode: "NOTES_TOO_LONG",
        unknownCode: "NOTES_SAVE_FAILED",
        fallback: messages.errors.noteSaveFailed,
        known: messages.errors.noteSaveFailed,
      },
      {
        action: "saveDisplayName",
        knownCode: "DISPLAY_NAME_TOO_LONG",
        unknownCode: "DISPLAY_NAME_SAVE_FAILED",
        fallback: messages.errors.displayNameSaveFailed,
        known: messages.errors.displayNameSaveFailed,
      },
    ] as const;

    for (const item of cases) {
      const knownPayload = {
        error: { code: item.knownCode, message: englishServerMessage },
      };
      const unknownPayload = {
        error: { code: item.unknownCode, message: englishServerMessage },
      };

      assert.equal(
        licenseeErrorMessage(
          messages,
          knownPayload.error.code,
          item.fallback,
        ),
        item.known,
        `${item.action} known code ${item.knownCode}`,
      );
      assert.equal(
        licenseeErrorMessage(
          messages,
          unknownPayload.error.code,
          item.fallback,
        ),
        item.fallback,
        `${item.action} unknown code ${item.unknownCode}`,
      );
      assert.notEqual(
        licenseeErrorMessage(
          messages,
          unknownPayload.error.code,
          item.fallback,
        ),
        englishServerMessage,
      );
      assert.notEqual(item.known, englishServerMessage);
      assert.notEqual(item.fallback, englishServerMessage);
    }
  });

  it("Category E: authenticated Licensee surfaces do not render payload.error.message", () => {
    const surfaces = [
      "app/licensee/page.tsx",
      "app/licensee/estimate/page.tsx",
      "app/licensee/quote/page.tsx",
      "app/licensee/useful-links/page.tsx",
      "app/licensee/sub-accounts/new/page.tsx",
      "components/licensee/LicenseeDashboardClient.tsx",
      "components/licensee/LicenseeUsefulLinksCard.tsx",
      "components/licensee/LicenseeUsefulLinksPanel.tsx",
      "components/licensee/LicenseePlanSection.tsx",
      "components/licensee/BackToMasterCta.tsx",
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
      "components/licensee/estimate/EstimateAskAthenaPanel.tsx",
      "components/licensee/estimate/EstimateProspectSelect.tsx",
    ];
    for (const file of surfaces) {
      const source = readFileSync(join(ROOT, file), "utf8");
      assert.doesNotMatch(
        source,
        /payload\.error\?\.message/,
        `${file} still uses payload.error.message`,
      );
      assert.doesNotMatch(
        source,
        /licenseeErrorMessage\(\s*messages,\s*undefined,/,
        `${file} still drops error codes`,
      );
    }
  });
});
