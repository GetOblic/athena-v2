import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SOCIAL_CALENDAR_GENERATION_MODES,
  SOCIAL_CALENDAR_PERIOD_DAYS,
  SOCIAL_CALENDAR_READY_IMMUTABLE_FIELDS,
  SOCIAL_CALENDAR_STATUSES,
  SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS,
  ReadySocialCalendarImmutableError,
  SocialCalendarGuidanceError,
  SocialCalendarLineageError,
  SocialCalendarPeriodError,
  assertCanMutateSocialCalendarFields,
  assertSocialCalendarLineage,
  isSocialCalendarGenerationMode,
  isSocialCalendarLineageRoot,
  isSocialCalendarStatus,
  normalizeSocialCalendarGenerationMode,
  normalizeSocialCalendarPeriod,
  normalizeSocialCalendarUserGuidance,
  parseSocialCalendarDate,
  resolveSocialCalendarRootId,
} from "../../services/socialPlanner/socialCalendarTypes";

describe("Social Calendar L1 domain contracts", () => {
  it("status contract matches Ads/SEO/Estimate vocabulary", () => {
    assert.deepEqual(SOCIAL_CALENDAR_STATUSES, [
      "Queued",
      "Processing",
      "Ready",
      "Processing Failed",
    ]);
    assert.equal(isSocialCalendarStatus("Ready"), true);
    assert.equal(isSocialCalendarStatus("ready"), false);
    assert.equal(isSocialCalendarStatus("Completed"), false);
  });

  it("generation mode distinguishes standard, Think Differently, and revision", () => {
    assert.deepEqual(SOCIAL_CALENDAR_GENERATION_MODES, [
      "standard",
      "think_differently",
      "conversation_revision",
    ]);
    assert.equal(isSocialCalendarGenerationMode("think_differently"), true);
    assert.equal(isSocialCalendarGenerationMode("conversation_revision"), true);
    assert.equal(isSocialCalendarGenerationMode("regenerate"), false);
    assert.equal(normalizeSocialCalendarGenerationMode("standard"), "standard");
    assert.throws(
      () => normalizeSocialCalendarGenerationMode("think differently"),
      SocialCalendarLineageError,
    );
  });

  it("period validation requires exactly seven inclusive calendar dates", () => {
    assert.equal(SOCIAL_CALENDAR_PERIOD_DAYS, 7);
    assert.deepEqual(
      normalizeSocialCalendarPeriod("2026-08-19", "2026-08-25"),
      { periodStart: "2026-08-19", periodEnd: "2026-08-25" },
    );
    assert.equal(parseSocialCalendarDate("2026-02-28"), "2026-02-28");

    assert.throws(
      () => normalizeSocialCalendarPeriod("2026-08-19", "2026-08-24"),
      SocialCalendarPeriodError,
    );
    assert.throws(
      () => normalizeSocialCalendarPeriod("2026-08-19", "2026-08-26"),
      SocialCalendarPeriodError,
    );
    assert.throws(
      () => normalizeSocialCalendarPeriod("2026-08-25", "2026-08-19"),
      SocialCalendarPeriodError,
    );
    assert.throws(
      () => parseSocialCalendarDate("2026-02-30"),
      SocialCalendarPeriodError,
    );
    assert.throws(
      () => parseSocialCalendarDate("2026-08-19T00:00:00.000Z"),
      SocialCalendarPeriodError,
    );
    assert.throws(
      () => normalizeSocialCalendarPeriod("August 19, 2026", "August 25, 2026"),
      SocialCalendarPeriodError,
    );
  });

  it("user guidance is optional, trimmed, and bounded", () => {
    assert.equal(normalizeSocialCalendarUserGuidance(null), null);
    assert.equal(normalizeSocialCalendarUserGuidance("   "), null);
    assert.equal(
      normalizeSocialCalendarUserGuidance("  Product launch  "),
      "Product launch",
    );
    assert.throws(
      () => normalizeSocialCalendarUserGuidance(12),
      SocialCalendarGuidanceError,
    );
    assert.throws(
      () =>
        normalizeSocialCalendarUserGuidance(
          "x".repeat(SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS + 1),
        ),
      SocialCalendarGuidanceError,
    );
  });

  it("lineage allows original roots and requires source+root for derivatives", () => {
    assertSocialCalendarLineage({
      generationMode: "standard",
      sourceCalendarId: null,
      rootCalendarId: null,
      versionNumber: 1,
    });
    assertSocialCalendarLineage({
      generationMode: "standard",
      sourceCalendarId: "src",
      rootCalendarId: "root",
      versionNumber: 2,
    });
    assertSocialCalendarLineage({
      generationMode: "think_differently",
      sourceCalendarId: "src",
      rootCalendarId: "root",
      versionNumber: 2,
    });
    assertSocialCalendarLineage({
      generationMode: "conversation_revision",
      sourceCalendarId: "src",
      rootCalendarId: "root",
      versionNumber: 3,
    });

    assert.throws(
      () =>
        assertSocialCalendarLineage({
          generationMode: "think_differently",
          sourceCalendarId: null,
          rootCalendarId: null,
          versionNumber: 1,
        }),
      SocialCalendarLineageError,
    );
    assert.throws(
      () =>
        assertSocialCalendarLineage({
          generationMode: "standard",
          sourceCalendarId: "src",
          rootCalendarId: null,
          versionNumber: 2,
        }),
      SocialCalendarLineageError,
    );
    assert.throws(
      () =>
        assertSocialCalendarLineage({
          generationMode: "standard",
          sourceCalendarId: null,
          rootCalendarId: null,
          versionNumber: 0,
        }),
      SocialCalendarLineageError,
    );

    const original = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source_calendar_id: null,
      root_calendar_id: null,
    };
    const derivative = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      source_calendar_id: original.id,
      root_calendar_id: original.id,
    };
    assert.equal(isSocialCalendarLineageRoot(original), true);
    assert.equal(isSocialCalendarLineageRoot(derivative), false);
    assert.equal(resolveSocialCalendarRootId(original), original.id);
    assert.equal(resolveSocialCalendarRootId(derivative), original.id);
  });

  it("Ready calendars cannot rewrite frozen period, package, provenance, or lineage", () => {
    assert.deepEqual(SOCIAL_CALENDAR_READY_IMMUTABLE_FIELDS, [
      "period_start",
      "period_end",
      "user_guidance",
      "generation_mode",
      "source_calendar_id",
      "root_calendar_id",
      "version_number",
      "package_json",
      "provenance_json",
      "calendar_context_json",
      "revision_context_json",
    ]);

    assertCanMutateSocialCalendarFields("Processing", ["package_json"]);
    assertCanMutateSocialCalendarFields("Ready", ["updated_at", "error_code"]);
    assert.throws(
      () => assertCanMutateSocialCalendarFields("Ready", ["package_json"]),
      ReadySocialCalendarImmutableError,
    );
    assert.throws(
      () => assertCanMutateSocialCalendarFields("Ready", ["period_start"]),
      ReadySocialCalendarImmutableError,
    );
    assert.throws(
      () =>
        assertCanMutateSocialCalendarFields("Ready", ["calendar_context_json"]),
      ReadySocialCalendarImmutableError,
    );
    assert.throws(
      () =>
        assertCanMutateSocialCalendarFields("Ready", ["revision_context_json"]),
      ReadySocialCalendarImmutableError,
    );
  });
});
