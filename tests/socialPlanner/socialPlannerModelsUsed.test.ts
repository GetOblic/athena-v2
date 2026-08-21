import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { toSocialCalendarListItemDto } from "../../services/socialPlanner/socialCalendarDto";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  deriveSocialCalendarModelsUsed,
  formatSocialPlannerModelLabel,
} from "../../services/socialPlanner/socialCalendarModelsUsed";
import type { SocialCalendar } from "../../services/socialPlanner/socialCalendarTypes";
import { TEST_PERIOD_END, TEST_PERIOD_START } from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function calendarRow(overrides: Partial<Record<string, unknown>> = {}): SocialCalendar {
  return mapSocialCalendarRow({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: null,
    generation_mode: "standard",
    source_calendar_id: null,
    root_calendar_id: null,
    version_number: 1,
    status: "Queued",
    generation_stage: "queued",
    package_json: null,
    provenance_json: {},
    calendar_context_json: {},
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

function readyWithStages(
  stages: Array<{ model?: string }>,
  extras: Partial<Record<string, unknown>> = {},
): SocialCalendar {
  return calendarRow({
    status: "Ready",
    package_json: {
      generationMetadata: { stages },
    },
    ...extras,
  });
}

describe("Social Planner modelsUsed derivation", () => {
  it("formats supported routing IDs to Prospect display labels", () => {
    assert.equal(
      formatSocialPlannerModelLabel("anthropic/claude-sonnet-4"),
      "Claude Sonnet 4",
    );
    assert.equal(
      formatSocialPlannerModelLabel("google/gemini-2.5-flash"),
      "Gemini 2.5 Flash",
    );
    assert.equal(formatSocialPlannerModelLabel("claude-sonnet-4"), "Claude Sonnet 4");
    assert.equal(formatSocialPlannerModelLabel("sonnet-4"), "Claude Sonnet 4");
    assert.equal(formatSocialPlannerModelLabel("claude-opus-4"), "Claude Opus 4");
    assert.equal(formatSocialPlannerModelLabel("o3"), "OpenAI o3");
    assert.equal(formatSocialPlannerModelLabel("gpt-4"), "GPT-4");
  });

  it("derives Claude Sonnet 4 from a single persisted Claude stage", () => {
    assert.equal(
      deriveSocialCalendarModelsUsed({
        generationMetadata: {
          stages: [{ model: "anthropic/claude-sonnet-4" }],
        },
      }),
      "Claude Sonnet 4",
    );
    const item = toSocialCalendarListItemDto(
      readyWithStages([{ model: "anthropic/claude-sonnet-4" }]),
    );
    assert.equal(item.modelsUsed, "Claude Sonnet 4");
  });

  it("deduplicates exact model IDs while preserving first-seen order", () => {
    assert.equal(
      deriveSocialCalendarModelsUsed({
        generationMetadata: {
          stages: [
            { model: "anthropic/claude-sonnet-4" },
            { model: "anthropic/claude-sonnet-4" },
            { model: "anthropic/claude-sonnet-4" },
          ],
        },
      }),
      "Claude Sonnet 4",
    );
  });

  it("joins Claude + Gemini repair as unique persisted labels", () => {
    assert.equal(
      deriveSocialCalendarModelsUsed({
        generationMetadata: {
          stages: [
            { model: "anthropic/claude-sonnet-4" },
            { model: "google/gemini-2.5-flash" },
          ],
        },
      }),
      "Claude Sonnet 4 + Gemini 2.5 Flash",
    );
  });

  it("uses persisted stage order for the display string", () => {
    assert.equal(
      deriveSocialCalendarModelsUsed({
        generationMetadata: {
          stages: [
            { model: "google/gemini-2.5-flash" },
            { model: "anthropic/claude-sonnet-4" },
          ],
        },
      }),
      "Gemini 2.5 Flash + Claude Sonnet 4",
    );
  });

  it("returns null when generationMetadata is missing", () => {
    assert.equal(deriveSocialCalendarModelsUsed({ strategySummary: "Week" }), null);
    assert.equal(
      toSocialCalendarListItemDto(
        calendarRow({
          status: "Ready",
          package_json: { strategySummary: "Week" },
        }),
      ).modelsUsed,
      null,
    );
  });

  it("returns null when stages are empty", () => {
    assert.equal(
      deriveSocialCalendarModelsUsed({
        generationMetadata: { stages: [] },
      }),
      null,
    );
    assert.equal(toSocialCalendarListItemDto(readyWithStages([])).modelsUsed, null);
  });

  it("does not fabricate a model for a non-Ready calendar", () => {
    const queued = toSocialCalendarListItemDto(
      calendarRow({
        status: "Queued",
        package_json: {
          generationMetadata: {
            stages: [{ model: "anthropic/claude-sonnet-4" }],
          },
        },
      }),
    );
    assert.equal(queued.modelsUsed, null);
    assert.equal(queued.status, "Queued");
  });

  it("Think Differently calendars use their own persisted stage models", () => {
    const item = toSocialCalendarListItemDto(
      readyWithStages(
        [
          { model: "anthropic/claude-sonnet-4" },
          { model: "google/gemini-2.5-flash" },
        ],
        { generation_mode: "think_differently" },
      ),
    );
    assert.equal(item.generationMode, "think_differently");
    assert.equal(item.modelsUsed, "Claude Sonnet 4 + Gemini 2.5 Flash");
  });

  it("conversation revision calendars use their own persisted stage models", () => {
    const item = toSocialCalendarListItemDto(
      readyWithStages([{ model: "google/gemini-2.5-flash" }], {
        generation_mode: "conversation_revision",
      }),
    );
    assert.equal(item.generationMode, "conversation_revision");
    assert.equal(item.modelsUsed, "Gemini 2.5 Flash");
  });

  it("does not hardcode a fallback model or read live routing", () => {
    const helper = read("services/socialPlanner/socialCalendarModelsUsed.ts");
    const dto = read("services/socialPlanner/socialCalendarDto.ts");
    assert.doesNotMatch(helper, /resolveModelForStage|Athena model|Claude Sonnet 4\.5/);
    assert.doesNotMatch(dto, /resolveModelForStage|Athena model|Claude Sonnet 4\.5/);
    assert.doesNotMatch(helper, /models_used|executive_versions/);
    assert.doesNotMatch(dto, /provenance_json/);
    assert.equal(deriveSocialCalendarModelsUsed(null), null);
    assert.equal(deriveSocialCalendarModelsUsed(undefined), null);
    assert.equal(
      deriveSocialCalendarModelsUsed({
        generationMetadata: {
          stages: [{ model: "   " }, { model: "" }, {}],
        },
      }),
      null,
    );
  });
});
