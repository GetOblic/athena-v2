import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";
import {
  SOCIAL_PLANNER_DETAIL_POLL_MS,
  SOCIAL_PLANNER_HISTORY_POLL_TICKS,
  SOCIAL_PLANNER_TRANSIENT_POLL_NOTICE_AFTER,
  buildSocialCalendarCreateBody,
  isSocialPlannerInFlight,
  mapSocialPlannerApiError,
  previewSocialCopy,
  shouldStopSocialPlannerPolling,
  socialPlannerCreateBodyKeys,
  socialPlannerWorkspacePath,
} from "../../components/socialPlanner/socialPlannerClient";
import {
  addCalendarDays,
  deriveSocialPlannerPeriodEnd,
  formatSocialPlannerDayHeader,
  formatSocialPlannerPeriodLabel,
  formatWeekRangePreview,
  listSocialPlannerPeriodDates,
  todayLocalCalendarDate,
} from "../../components/socialPlanner/socialPlannerDates";
import {
  socialPlannerAssetTypeLabel,
  socialPlannerGenerationModeLabel,
  socialPlannerHistoryStatusLabel,
  socialPlannerObjectiveLabel,
  socialPlannerPlatformLabel,
  socialPlannerStageLabel,
} from "../../components/socialPlanner/socialPlannerLabels";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L7 navigation", () => {
  it("adds Social Planner only to ordinary Athena nav at /social-planner", () => {
    const labels = dashboardNavItems.map((item) => item.label);
    const hrefs = dashboardNavItems.map((item) => item.href);
    assert.ok(labels.includes("Social Planner"));
    assert.equal(
      dashboardNavItems.find((item) => item.label === "Social Planner")?.href,
      "/social-planner",
    );
    assert.ok(labels.includes("Ads"));
    assert.ok(labels.includes("SEO Intelligence"));
    assert.ok(labels.includes("Personas"));
    assert.equal(labels.filter((label) => label === "Social Planner").length, 1);
    assert.ok(!hrefs.includes("/licensee/social-planner"));
    assert.ok(!hrefs.includes("/super/social-planner"));
  });

  it("does not appear in Licensee Master or Super Admin navigation", () => {
    const licensee = read("components/licensee/LicenseeDashboardClient.tsx");
    const superAdmin = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const licenseePage = read("app/licensee/page.tsx");
    const superPage = read("app/super/page.tsx");
    assert.doesNotMatch(licensee, /Social Planner|\/social-planner/);
    assert.doesNotMatch(superAdmin, /Social Planner|\/social-planner/);
    assert.doesNotMatch(licenseePage, /Social Planner|\/social-planner/);
    assert.doesNotMatch(superPage, /Social Planner|\/social-planner/);
    assert.doesNotMatch(licensee, /dashboardNavItems/);
    assert.doesNotMatch(superAdmin, /dashboardNavItems/);
  });
});

describe("Social Planner L7 form and week selection", () => {
  it("requires a start date and derives a seven-day end", () => {
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.match(form, /type="date"/);
    assert.match(form, /required/);
    assert.match(form, /Week starts/);
    assert.match(form, /deriveSocialPlannerPeriodEnd/);
    assert.match(form, /formatWeekRangePreview/);
    assert.equal(deriveSocialPlannerPeriodEnd("2026-08-23"), "2026-08-29");
    assert.equal(
      formatWeekRangePreview("2026-08-23", "2026-08-29"),
      "Sun Aug 23 → Sat Aug 29",
    );
    assert.deepEqual(listSocialPlannerPeriodDates("2026-08-23"), [
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  it("supports month and year transitions without a month business object", () => {
    assert.equal(addCalendarDays("2026-02-26", 6), "2026-03-04");
    assert.equal(deriveSocialPlannerPeriodEnd("2026-02-26"), "2026-03-04");
    assert.equal(
      formatSocialPlannerPeriodLabel("2026-02-26", "2026-03-04"),
      "February 26 – March 4, 2026",
    );
    assert.equal(addCalendarDays("2026-12-28", 6), "2027-01-03");
    assert.equal(
      formatSocialPlannerPeriodLabel("2026-12-28", "2027-01-03"),
      "December 28, 2026 – January 3, 2027",
    );
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.doesNotMatch(form, /month business|selectedMonth|ISO week/i);
  });

  it("formats same-month, cross-month, and cross-year week labels", () => {
    assert.equal(
      formatSocialPlannerPeriodLabel("2026-08-23", "2026-08-29"),
      "August 23–29, 2026",
    );
    assert.equal(
      formatSocialPlannerPeriodLabel("2026-08-30", "2026-09-05"),
      "August 30 – September 5, 2026",
    );
    assert.equal(
      formatSocialPlannerDayHeader("Monday", "2026-08-24"),
      "MONDAY · AUG 24",
    );
  });

  it("treats optional guidance as blank, bound to 4,000 characters", () => {
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.match(form, /Optional direction/);
    assert.match(form, /SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS/);
    assert.match(form, /Leave blank and Athena will decide/);
    assert.match(form, /Athena decides the week/);
    assert.match(form, /guidance.length\} \/ \{SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS\}/);
    const blank = buildSocialCalendarCreateBody({
      periodStart: "2026-08-23",
      periodEnd: "2026-08-29",
      userGuidance: "   ",
    });
    assert.equal(blank.userGuidance, "");
    const filled = buildSocialCalendarCreateBody({
      periodStart: "2026-08-23",
      periodEnd: "2026-08-29",
      userGuidance: "  Launch week  ",
    });
    assert.equal(filled.userGuidance, "Launch week");
  });

  it("POST body contains only period and guidance fields", () => {
    const body = buildSocialCalendarCreateBody({
      periodStart: "2026-08-23",
      periodEnd: "2026-08-29",
      userGuidance: "Launch week",
    });
    assert.deepEqual(socialPlannerCreateBodyKeys(body), [
      "periodEnd",
      "periodStart",
      "userGuidance",
    ]);
    assert.equal("organizationId" in body, false);
    assert.equal("userId" in body, false);
    assert.equal("status" in body, false);
    assert.equal("generationMode" in body, false);
    assert.equal("package" in body, false);
    assert.equal("provenance" in body, false);
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(form, /submitting/);
    assert.match(workspace, /submittingRef/);
    assert.match(client, /JSON.stringify\(body\)/);
    assert.doesNotMatch(workspace, /organizationId:/);
    assert.doesNotMatch(form, /organizationId|userId|generationMode/);
  });

  it("does not expose planner configuration selectors", () => {
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.doesNotMatch(form, /Persona selector|Prospect selector|format selector/i);
    assert.doesNotMatch(form, /platform selector|objective selector|holiday selector/i);
    assert.doesNotMatch(form, /model selector|advanced settings/i);
    assert.doesNotMatch(form, /number-of-posts|number of posts/i);
  });
});

describe("Social Planner L7 polling", () => {
  it("uses a 3s detail interval and stops on Ready or failed", () => {
    assert.equal(SOCIAL_PLANNER_DETAIL_POLL_MS, 3_000);
    assert.equal(SOCIAL_PLANNER_HISTORY_POLL_TICKS, 4);
    assert.equal(SOCIAL_PLANNER_TRANSIENT_POLL_NOTICE_AFTER, 2);
    assert.equal(isSocialPlannerInFlight("Queued"), true);
    assert.equal(isSocialPlannerInFlight("Processing"), true);
    assert.equal(isSocialPlannerInFlight("Ready"), false);
    assert.equal(shouldStopSocialPlannerPolling("Ready"), true);
    assert.equal(shouldStopSocialPlannerPolling("Processing Failed"), true);
    assert.equal(shouldStopSocialPlannerPolling("Processing"), false);
  });

  it("202 transitions into selected polling state and writes URL id", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(workspace, /createSocialCalendarRequest/);
    assert.match(workspace, /queuedDetailFromCreate/);
    assert.match(workspace, /selectCalendar\(created.id/);
    assert.match(workspace, /history.replaceState/);
    assert.match(workspace, /fetchSocialCalendarDetail/);
    assert.match(workspace, /cancelled = true/);
    assert.match(workspace, /requestInFlight/);
    assert.match(workspace, /Still checking your calendar/);
    assert.match(workspace, /window.clearInterval/);
    assert.match(client, /kind: "transient"/);
    assert.doesNotMatch(workspace, /status = "Processing Failed"/);
    assert.equal(socialPlannerWorkspacePath("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), "/social-planner?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(socialPlannerWorkspacePath(null), "/social-planner");
  });

  it("does not treat transient poll failures as persisted failure", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(client, /return \{ kind: "transient" \}/);
    assert.match(workspace, /result.kind === "not_found"/);
    assert.doesNotMatch(workspace, /setDetail\(\{[\s\S]*Processing Failed/);
    assert.match(workspace, /pollNotice/);
  });
});

describe("Social Planner L7 ready and production display", () => {
  it("maps asset, platform, and objective labels without snake_case", () => {
    assert.equal(socialPlannerAssetTypeLabel("talking_head_video"), "Talking Head Video");
    assert.equal(socialPlannerAssetTypeLabel("pdf_guide"), "PDF Guide");
    assert.equal(socialPlannerAssetTypeLabel("myth_vs_fact"), "Myth vs. Fact");
    assert.equal(socialPlannerPlatformLabel("youtube_shorts"), "YouTube Shorts");
    assert.equal(socialPlannerPlatformLabel("x"), "X");
    assert.equal(socialPlannerObjectiveLabel("build_authority"), "Build Authority");
    assert.equal(socialPlannerObjectiveLabel("thought_leadership"), "Thought Leadership");
    assert.equal(socialPlannerStageLabel("queued"), "Preparing your calendar");
    assert.equal(socialPlannerStageLabel("calendar_context"), "Reading the week");
    assert.equal(socialPlannerStageLabel("intelligence"), "Reviewing your Athena intelligence");
    assert.equal(socialPlannerStageLabel("generation"), "Creating your seven assets");
    assert.equal(socialPlannerStageLabel("diversity"), "Making sure the week feels original");
    assert.equal(socialPlannerStageLabel("finalizing"), "Finalizing your calendar");
    assert.equal(socialPlannerHistoryStatusLabel("Queued"), "Generating");
    assert.equal(socialPlannerHistoryStatusLabel("Processing"), "Generating");
    assert.equal(socialPlannerHistoryStatusLabel("Ready"), "Ready");
    assert.equal(socialPlannerHistoryStatusLabel("Processing Failed"), "Failed");
    assert.equal(socialPlannerGenerationModeLabel("standard"), "Standard");
  });

  it("renders Why This Week Works, seven day cards, and expand/collapse", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    assert.match(detail, /Your Social Week/);
    assert.match(detail, /Why This Week Works/);
    assert.match(detail, /socialPackage.assets.slice\(0, 7\)/);
    assert.match(detail, /Create Another Week/);
    assert.match(detail, /data-ready-actions/);
    assert.match(detail, /data-ask-athena-slot/);
    assert.match(detail, /Think Differently/);
    assert.match(detail, /SocialPlannerAskAthenaPanel/);
    assert.match(
      read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx"),
      /Ask Athena About This Calendar/,
    );
    assert.match(card, /Open Asset/);
    assert.match(card, /aria-expanded/);
    assert.match(card, /previewSocialCopy/);
    assert.match(card, /Calendar opportunity:/);
    assert.match(card, /recommendedPlatforms/);
  });

  it("renders each production-spec family and copy controls", () => {
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    assert.match(spec, /kind === "static"/);
    assert.match(spec, /Image Prompt/);
    assert.match(spec, /Composition/);
    assert.match(spec, /Overlay Guidance/);
    assert.match(spec, /kind === "carousel"/);
    assert.match(spec, /Visual Direction/);
    assert.match(spec, /Slide \{slide.index\}/);
    assert.match(spec, /kind === "video"/);
    assert.match(spec, /Video Concept/);
    assert.match(spec, /Scene \/ Shot Plan/);
    assert.match(spec, /Production Direction/);
    assert.match(spec, /kind === "document"/);
    assert.match(spec, /Document Concept/);
    assert.match(spec, /Design Prompt/);
    assert.match(spec, /spec.prompt/);
    assert.match(spec, /CopyButton/);
    assert.match(spec, /tracking=\{null\}/);
    assert.match(spec, /showContinue=\{false\}/);
    assert.match(card, /Social Copy/);
    assert.match(card, /asset.cta/);
    assert.equal(previewSocialCopy("a".repeat(200)).endsWith("…"), true);
  });

  it("does not render provenance, fingerprints, or sourceSignals", () => {
    const files = [
      "components/socialPlanner/SocialCalendarDetail.tsx",
      "components/socialPlanner/SocialCalendarDayCard.tsx",
      "components/socialPlanner/SocialCalendarProductionSpec.tsx",
      "components/socialPlanner/SocialPlannerHistory.tsx",
      "components/socialPlanner/SocialPlannerWorkspace.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /creativeFingerprint/);
      assert.doesNotMatch(source, /weekFingerprint/);
      assert.doesNotMatch(source, /sourceSignals/);
      assert.doesNotMatch(source, /generationMetadata/);
      assert.doesNotMatch(source, /personaIds/);
      assert.doesNotMatch(source, /from\("athena_social_calendars"\)/);
      assert.doesNotMatch(source, /supabaseAdmin|createSupabase/);
    }
  });
});

describe("Social Planner L7 history, failure, and layout", () => {
  it("history uses API order, Ready summaries, and Open Calendar detail fetch", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(history, /Your Social Calendars/);
    assert.match(history, /Open Calendar/);
    assert.match(history, /socialPlannerHistoryStatusLabel/);
    assert.match(history, /strategySummary/);
    assert.match(history, /whyThisWeekWorks/);
    assert.match(history, /assetCount/);
    assert.doesNotMatch(history, /calendars.sort|toReversed|localeCompare/);
    assert.match(workspace, /fetchSocialCalendarDetail\(id\)/);
    assert.doesNotMatch(workspace, /createSocialCalendarRequest\(\{[\s\S]*onOpen/);
  });

  it("empty state keeps generation primary", () => {
    const page = read("app/social-planner/page.tsx");
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(page, /Plan your next seven social assets with one push/);
    assert.match(history, /if \(calendars.length === 0\) \{\s*return null;/);
  });

  it("failed, malformed, and 404 states stay safe", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(detail, /Processing Failed/);
    assert.match(detail, /Create Another Week/);
    assert.match(detail, /This calendar could not be displayed/);
    assert.match(detail, /packageUnavailable/);
    assert.match(workspace, /This calendar could not be found/);
    assert.equal(mapSocialPlannerApiError(400, { message: "Choose a week." }, ""), "Choose a week.");
    assert.equal(mapSocialPlannerApiError(404, null, ""), "This calendar could not be found.");
    assert.equal(mapSocialPlannerApiError(500, { code: "DETAIL_FAILED" }, ""), "Something went wrong. Please try again.");
    assert.doesNotMatch(detail, /Retry generation|Regenerate/);
    assert.doesNotMatch(client, /error.code/);
  });

  it("page is authenticated, one-page URL state, and mobile-safe", () => {
    const page = read("app/social-planner/page.tsx");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(page, /requireCurrentOrganizationContext/);
    assert.match(page, /listSocialCalendars/);
    assert.match(page, /getSocialCalendarById/);
    assert.match(page, /searchParams/);
    assert.match(page, /px-5 py-8/);
    assert.match(page, /sm:p-10/);
    assert.doesNotMatch(page, /locale|fr-FR|en-GB/);
    assert.match(workspace, /replaceState/);
    assert.match(form, /w-full/);
    assert.match(form, /Generate My Week/);
    assert.match(card, /min-w-0/);
    assert.match(card, /break-words/);
    assert.match(card, /flex-wrap/);
    assert.match(history, /flex-col/);
    assert.doesNotMatch(card, /min-w-\[8|w-\[8|grid-cols-7/);
    assert.doesNotMatch(history, /<table/);
    assert.doesNotMatch(workspace, /<table/);
    assert.match(todayLocalCalendarDate(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("adds whole-asset Copy and Continue without changing field Copy or Discuss", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const panel = read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx");
    const serializer = read("components/socialPlanner/socialPlannerAssetCopyText.ts");

    assert.match(card, /data-asset-actions/);
    assert.match(card, /serializeSocialCalendarAsset/);
    assert.match(card, /<CopyButton/);
    assert.match(card, /tracking=\{null\}/);
    assert.match(card, /showContinue/);
    assert.doesNotMatch(card, /showContinue=\{false\}/);
    assert.doesNotMatch(card, /initiallyDone|initiallyTags/);
    assert.doesNotMatch(card, /AssetUsageTagControls/);
    assert.doesNotMatch(card, /Discuss with Athena/);
    assert.doesNotMatch(card, /\/api\/asset-interactions/);
    assert.doesNotMatch(card, /package_json/);

    assert.match(spec, /CopyButton/);
    assert.match(spec, /tracking=\{null\}/);
    assert.match(spec, /showContinue=\{false\}/);
    assert.doesNotMatch(spec, /showContinue(?!\=\{false\})/);

    assert.match(detail, /data-ask-athena-slot/);
    assert.match(detail, /SocialPlannerAskAthenaPanel/);
    assert.match(panel, /Ask Athena About This Calendar/);
    assert.doesNotMatch(detail, /Discuss with Athena/);

    assert.match(serializer, /export function serializeSocialCalendarAsset/);
    assert.doesNotMatch(serializer, /fetch\(|supabase|package_json/);
    assert.doesNotMatch(serializer, /creativeFingerprint|sourceSignals|personaIds/);
  });

  it("does not introduce lifecycle controls on the daily asset card", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");
    for (const source of [card, spec]) {
      assert.doesNotMatch(source, /AssetUsageTagControls/);
      assert.doesNotMatch(source, /\bSelected\b|\bScheduled\b|\bPublished\b|\bUsed\b/);
      assert.doesNotMatch(source, /usageTag/);
    }
  });

  it("uses Copy \/ Done conventions and accessibility semantics", () => {
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const status = read("components/socialPlanner/SocialPlannerStatus.tsx");
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.match(spec, /CopyButton/);
    assert.match(card, /aria-expanded=\{open\}/);
    assert.match(card, /aria-controls=\{panelId\}/);
    assert.match(status, /role="status"/);
    assert.match(status, /aria-live="polite"/);
    assert.match(form, /htmlFor="social-planner-week-start"/);
    assert.match(form, /htmlFor="social-planner-guidance"/);
    assert.match(form, /focus-visible:outline/);
  });

  it("does not query Supabase from UI and adds no L7 migration or dependency", () => {
    const uiFiles = readdirSync(join(ROOT, "components/socialPlanner")).filter((name) =>
      name.endsWith(".ts") || name.endsWith(".tsx"),
    );
    for (const name of uiFiles) {
      const source = read(`components/socialPlanner/${name}`);
      assert.doesNotMatch(source, /supabaseAdmin|createSupabaseServerClient|createBrowserClient/);
    }
    const page = read("app/social-planner/page.tsx");
    assert.doesNotMatch(page, /supabaseAdmin|from\("athena_social_calendars"\)/);
    assert.ok(existsSync(join(ROOT, "app/social-planner/page.tsx")));
    const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    const socialMigrations = migrations.filter((name) => name.includes("social_calendar"));
    assert.deepEqual(socialMigrations, [
      "20260819000001_create_athena_social_calendars.sql",
      "20260820000001_create_athena_social_calendar_conversation.sql",
    ]);
    const pkg = read("package.json");
    assert.doesNotMatch(pkg, /react-day-picker|react-datepicker|@internationalized\/date/);
  });
});

describe("Social Planner L7 non-interference", () => {
  it("does not change Ads, SEO, Licensee, or Super Admin workspace behavior", () => {
    assert.match(read("app/ads/page.tsx"), /AdsLibraryClient/);
    assert.match(read("app/seo/page.tsx"), /SeoLibraryClient/);
    assert.match(read("components/ads/AdsLibraryClient.tsx"), /Generate Ads/);
    assert.match(read("components/seo/SeoLibraryClient.tsx"), /Generate SEO Intelligence/);
    assert.doesNotMatch(read("components/ads/AdsLibraryClient.tsx"), /socialPlanner|Social Planner/);
    assert.doesNotMatch(read("components/seo/SeoLibraryClient.tsx"), /socialPlanner|Social Planner/);
    assert.doesNotMatch(read("app/ads/page.tsx"), /social-planner/);
    assert.doesNotMatch(read("app/seo/page.tsx"), /social-planner/);
    assert.match(read("app/licensee/page.tsx"), /LicenseeDashboardClient/);
    assert.match(read("app/super/page.tsx"), /SuperAdminDashboardClient/);
  });

  it("keeps regenerate unimplemented while Ask Athena lives in the reserved slot", () => {
    assert.equal(existsSync(join(ROOT, "app/api/social-planner/regenerate")), false);
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/conversation/route.ts")),
      true,
    );
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(detail, /data-ready-actions/);
    assert.match(detail, /data-ask-athena-slot/);
    assert.match(detail, /Think Differently/);
    assert.match(detail, /SocialPlannerAskAthenaPanel/);
    assert.match(
      read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx"),
      /Ask Athena About This Calendar/,
    );
  });
});
