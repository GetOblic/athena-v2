import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LIVE_EXECUTIVE_VERSION_SENTINEL,
  buildSocialCalendarAssetInteractionType,
} from "../../services/assetInteractions/assetInteractionKeys";
import {
  authorizeSocialCalendarInteractionAsset,
  authorizeSocialCalendarInteractionSource,
  isAllowedSocialCalendarExecutiveVersionId,
  resolveExactlyOneSocialCalendarDailyAsset,
} from "../../services/assetInteractions/socialCalendarAssetInteractionAccess";
import { ASSET_USAGE_TAGS } from "../../services/assetInteractions/assetUsageTags";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import type { SocialCalendar } from "../../services/socialPlanner/socialCalendarTypes";
import type { SocialCalendarPackageV1 } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  TEST_FOREIGN_ORG,
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();
const L3_MIGRATION =
  "supabase/migrations/20260821000001_expand_asset_interaction_source_types.sql";
const CREATE_INTERACTIONS =
  "supabase/migrations/20260718000001_create_athena_asset_interactions.sql";
const EXPAND_TYPES =
  "supabase/migrations/20260720000001_expand_asset_interaction_types.sql";
const REAL_EXECUTIVE_VERSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WEEK_DATES = [
  "2026-05-10",
  "2026-05-11",
  "2026-05-12",
  "2026-05-13",
  "2026-05-14",
  "2026-05-15",
  "2026-05-16",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function interactionIdentity(input: {
  sourceType: string;
  sourceId: string;
  executiveVersionId?: string;
  assetType: string;
  interactionType?: string;
}): string {
  return [
    input.sourceType,
    input.sourceId,
    input.executiveVersionId ?? LIVE_EXECUTIVE_VERSION_SENTINEL,
    input.assetType,
    input.interactionType ?? "copied",
  ].join("|");
}

function readyCalendar(
  overrides: Partial<Record<string, unknown>> = {},
): SocialCalendar {
  const context = buildGenerationContext();
  const socialPackage = buildValidatedPackage(context);
  return mapSocialCalendarRow({
    id: "cal-l3-ready",
    organization_id: TEST_ORG,
    user_id: "user-1",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: "Keep evenings bookable.",
    generation_mode: "standard",
    source_calendar_id: null,
    root_calendar_id: null,
    version_number: 1,
    status: "Ready",
    generation_stage: "completed",
    package_json: socialPackage as unknown as Record<string, unknown>,
    provenance_json: {},
    calendar_context_json: context.calendarContext as unknown as Record<
      string,
      unknown
    >,
    revision_context_json: null,
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

describe("Social Planner V30 L3 source_type migration", () => {
  it("recreates the source_type CHECK with discussion, prospect, and social_calendar", () => {
    const migration = read(L3_MIGRATION);
    assert.match(
      migration,
      /drop constraint if exists athena_asset_interactions_source_type_check/,
    );
    assert.match(
      migration,
      /add constraint athena_asset_interactions_source_type_check/,
    );
    assert.match(
      migration,
      /source_type in \('discussion', 'prospect', 'social_calendar'\)/,
    );
    assert.match(migration, /athena_social_calendars\.id/);
    assert.doesNotMatch(migration, /'persona'/);
    assert.doesNotMatch(migration, /'ad_campaign'/);
    assert.doesNotMatch(migration, /'seo_report'/);
    assert.doesNotMatch(migration, /'estimate'/);
  });

  it("does not alter interaction_type semantics, unique identity, columns, or RLS", () => {
    const migration = read(L3_MIGRATION);
    const create = read(CREATE_INTERACTIONS);
    const expand = read(EXPAND_TYPES);

    assert.doesNotMatch(
      migration,
      /athena_asset_interactions_interaction_type_check/,
    );
    assert.doesNotMatch(migration, /athena_asset_interactions_unique/);
    assert.doesNotMatch(migration, /add column/i);
    assert.doesNotMatch(migration, /drop column/i);
    assert.doesNotMatch(migration, /alter column\s+\w/i);
    assert.doesNotMatch(migration, /create index/i);
    assert.doesNotMatch(migration, /enable row level security/i);
    assert.doesNotMatch(migration, /create policy/i);
    assert.doesNotMatch(migration, /grant /i);
    assert.doesNotMatch(migration, /backfill/i);
    assert.doesNotMatch(migration, /update athena_asset_interactions/i);
    assert.doesNotMatch(migration, /alter table athena_social_calendars/i);
    assert.doesNotMatch(migration, /package_json/);

    assert.match(
      create,
      /organization_id,\s*user_id,\s*source_type,\s*source_id,\s*executive_version_id,\s*asset_type,\s*interaction_type/s,
    );
    assert.match(expand, /'copied'/);
    assert.match(expand, /'selected'/);
    assert.match(expand, /'scheduled'/);
    assert.match(expand, /'sent'/);
    assert.match(expand, /'published'/);
    assert.match(expand, /'used'/);
  });
});

describe("Social Planner V30 L3 authorization", () => {
  it("accepts a correct-org Ready calendar for GET and a matching daily POST key", async () => {
    const calendar = readyCalendar();
    const socialPackage = calendar.package_json as unknown as SocialCalendarPackageV1;
    const first = socialPackage.assets[0];

    const source = await authorizeSocialCalendarInteractionSource({
      organizationId: TEST_ORG,
      sourceId: calendar.id,
      getCalendar: async (id, organizationId) => {
        assert.equal(id, calendar.id);
        assert.equal(organizationId, TEST_ORG);
        return calendar;
      },
    });
    assert.equal(source.ok, true);
    if (source.ok) {
      assert.equal(source.calendar.id, calendar.id);
      assert.equal(source.calendar.status, "Ready");
    }

    const asset = authorizeSocialCalendarInteractionAsset({
      socialPackage,
      assetType: buildSocialCalendarAssetInteractionType(first.date),
    });
    assert.equal(asset.ok, true);
    if (asset.ok) {
      assert.equal(asset.date, first.date);
    }

    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /sourceType === "social_calendar"/);
    assert.match(route, /authorizeSocialCalendarInteractionSource/);
    assert.match(route, /authorizeSocialCalendarInteractionAsset/);
    assert.match(route, /listAssetInteractions/);
    assert.match(route, /recordAssetCopyInteraction/);
  });

  it("rejects wrong-org, missing, non-Ready, and unparseable Ready packages", async () => {
    const calendar = readyCalendar();

    const wrongOrg = await authorizeSocialCalendarInteractionSource({
      organizationId: TEST_FOREIGN_ORG,
      sourceId: calendar.id,
      getCalendar: async () => null,
    });
    assert.equal(wrongOrg.ok, false);
    if (!wrongOrg.ok) {
      assert.equal(wrongOrg.status, 404);
      assert.equal(wrongOrg.code, "NOT_FOUND");
    }

    const missing = await authorizeSocialCalendarInteractionSource({
      organizationId: TEST_ORG,
      sourceId: "missing-calendar",
      getCalendar: async () => null,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 404);
    }

    for (const status of ["Queued", "Processing", "Processing Failed"] as const) {
      const denied = await authorizeSocialCalendarInteractionSource({
        organizationId: TEST_ORG,
        sourceId: `cal-${status}`,
        getCalendar: async () =>
          readyCalendar({ id: `cal-${status}`, status }),
      });
      assert.equal(denied.ok, false);
      if (!denied.ok) {
        assert.equal(denied.status, 404);
      }
    }

    const unparseable = await authorizeSocialCalendarInteractionSource({
      organizationId: TEST_ORG,
      sourceId: "cal-malformed",
      getCalendar: async () =>
        readyCalendar({
          id: "cal-malformed",
          package_json: { schemaVersion: "not-a-package" },
        }),
    });
    assert.equal(unparseable.ok, false);
    if (!unparseable.ok) {
      assert.equal(unparseable.status, 400);
      assert.equal(unparseable.code, "VALIDATION_ERROR");
    }
  });

  it("rejects a valid key whose date is absent from the frozen package", () => {
    const socialPackage = buildValidatedPackage();
    const denied = authorizeSocialCalendarInteractionAsset({
      socialPackage,
      assetType: buildSocialCalendarAssetInteractionType("2026-12-31"),
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.status, 404);
    }
  });

  it("rejects a duplicate-date frozen package and reuses the exactly-one rule", () => {
    const socialPackage = buildValidatedPackage();
    const first = socialPackage.assets[0];
    const duplicated = {
      ...socialPackage,
      assets: [
        socialPackage.assets[0],
        { ...socialPackage.assets[1], date: first.date },
        ...socialPackage.assets.slice(2),
      ],
    } as SocialCalendarPackageV1;

    assert.equal(
      resolveExactlyOneSocialCalendarDailyAsset(socialPackage, first.date)?.date,
      first.date,
    );
    assert.equal(
      resolveExactlyOneSocialCalendarDailyAsset(duplicated, first.date),
      null,
    );

    const denied = authorizeSocialCalendarInteractionAsset({
      socialPackage: duplicated,
      assetType: buildSocialCalendarAssetInteractionType(first.date),
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.status, 404);
    }
  });

  it("rejects a real Executive Version id for social_calendar and keeps the sentinel", () => {
    assert.equal(isAllowedSocialCalendarExecutiveVersionId(undefined), true);
    assert.equal(isAllowedSocialCalendarExecutiveVersionId(null), true);
    assert.equal(isAllowedSocialCalendarExecutiveVersionId(""), true);
    assert.equal(isAllowedSocialCalendarExecutiveVersionId("   "), true);
    assert.equal(
      isAllowedSocialCalendarExecutiveVersionId(LIVE_EXECUTIVE_VERSION_SENTINEL),
      true,
    );
    assert.equal(
      isAllowedSocialCalendarExecutiveVersionId(REAL_EXECUTIVE_VERSION_ID),
      false,
    );

    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /isAllowedSocialCalendarExecutiveVersionId/);
    assert.match(
      route,
      /Social Calendar interactions do not accept an Executive Version/,
    );
    const evFn = route.slice(route.indexOf("async function assertExecutiveVersionAccess"));
    const socialBranch = evFn.slice(
      evFn.indexOf('sourceType === "social_calendar"'),
      evFn.indexOf("const versionId"),
    );
    assert.match(socialBranch, /isAllowedSocialCalendarExecutiveVersionId/);
    assert.doesNotMatch(socialBranch, /getProspectById|getDiscussionById/);

    const resolveFn = route.slice(
      route.indexOf("async function resolveDiscussionIdForSource"),
    );
    const socialResolve = resolveFn.slice(
      resolveFn.indexOf('sourceType === "social_calendar"'),
      resolveFn.indexOf("async function assertSourceAccess"),
    );
    assert.match(socialResolve, /return null/);
    assert.doesNotMatch(socialResolve, /getProspectById/);
  });
});

describe("Social Planner V30 L3 interaction identity", () => {
  it("gives seven dates independent interaction keys", () => {
    const keys = WEEK_DATES.map((date) =>
      buildSocialCalendarAssetInteractionType(date),
    );
    assert.equal(new Set(keys).size, 7);
    assert.deepEqual(
      keys,
      WEEK_DATES.map((date) => `social_day_${date}`),
    );

    const identities = keys.map((assetType) =>
      interactionIdentity({
        sourceType: "social_calendar",
        sourceId: "cal-week-1",
        assetType,
      }),
    );
    assert.equal(new Set(identities).size, 7);
  });

  it("does not collide when production asset types repeat", () => {
    const socialPackage = buildValidatedPackage();
    const byProductionType = new Map<string, string[]>();
    for (const asset of socialPackage.assets) {
      const dates = byProductionType.get(asset.assetType) ?? [];
      dates.push(asset.date);
      byProductionType.set(asset.assetType, dates);
    }

    for (const asset of socialPackage.assets) {
      const interactionKey = buildSocialCalendarAssetInteractionType(asset.date);
      assert.notEqual(interactionKey, asset.assetType);
      assert.equal(interactionKey, `social_day_${asset.date}`);
    }

    const allKeys = socialPackage.assets.map((asset) =>
      buildSocialCalendarAssetInteractionType(asset.date),
    );
    assert.equal(new Set(allKeys).size, socialPackage.assets.length);
  });

  it("keeps historical calendar rows isolated even with the same root and Monday", () => {
    const mondayKey = buildSocialCalendarAssetInteractionType(TEST_PERIOD_START);
    const original = interactionIdentity({
      sourceType: "social_calendar",
      sourceId: "cal-original",
      assetType: mondayKey,
    });
    const derivative = interactionIdentity({
      sourceType: "social_calendar",
      sourceId: "cal-think-differently",
      assetType: mondayKey,
    });
    assert.notEqual(original, derivative);
    assert.match(original, /cal-original/);
    assert.match(derivative, /cal-think-differently/);
    assert.doesNotMatch(original, /root_calendar_id|source_calendar_id/);
    assert.doesNotMatch(derivative, /root_calendar_id|source_calendar_id/);

    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const access = read(
      "services/assetInteractions/socialCalendarAssetInteractionAccess.ts",
    );
    assert.match(detail, /sourceId: calendar\.id/);
    assert.match(detail, /sourceType: "social_calendar"/);
    assert.match(detail, /key=\{calendar\.id\}/);
    assert.doesNotMatch(detail, /rootCalendarId|root_calendar_id/);
    assert.doesNotMatch(card, /root_calendar_id|source_calendar_id/);
    assert.match(access, /getSocialCalendarById/);
    assert.match(access, /input\.sourceId/);
    assert.doesNotMatch(access, /root_calendar_id/);
  });
});

describe("Social Planner V30 L3 Copy / Done / tags UI", () => {
  it("tracks the whole daily asset with social_calendar and a date key", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const copyButton = read("components/deployment/CopyButton.tsx");

    assert.match(card, /tracking=\{tracking\}/);
    assert.match(card, /initiallyDone=\{initiallyDone\}/);
    assert.match(card, /initiallyTags=\{initiallyTags\}/);
    assert.match(card, /assetType=\{asset\.assetType\}/);
    assert.match(card, /serializeSocialCalendarAsset\(asset\)/);
    assert.match(card, /showContinue/);
    assert.doesNotMatch(card, /assetType=\{interactionKey\}/);
    assert.doesNotMatch(card, /buildSocialCalendarAssetInteractionType/);

    assert.match(detail, /buildSocialCalendarAssetInteractionType\(\s*asset\.date/);
    assert.match(detail, /sourceType: "social_calendar"/);
    assert.match(detail, /sourceId: calendar\.id/);
    assert.match(detail, /executiveVersionId: null/);
    assert.match(detail, /assetType: interactionKey/);
    assert.match(detail, /\/api\/asset-interactions\?\$\{params\}/);
    assert.match(detail, /sourceType: "social_calendar"/);
    assert.match(detail, /executiveVersionId: null/);
    assert.doesNotMatch(detail, /executiveVersionId: executiveVersion/);
    assert.match(detail, /load_done_state_failed/);
    assert.match(detail, /if \(cancelled \|\| !response\.ok\)/);

    assert.match(
      copyButton,
      /sourceType: "discussion" \| "prospect" \| "social_calendar"/,
    );
    assert.match(copyButton, /writeClipboardText/);
    assert.match(copyButton, /response\.ok && payload\.ok/);
    assert.match(copyButton, /setDone\(true\)/);
  });

  it("hydrates Done and independent usage tags from one GET", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const copyButton = read("components/deployment/CopyButton.tsx");
    const controls = read("components/deployment/AssetUsageTagControls.tsx");

    assert.equal((detail.match(/\/api\/asset-interactions/g) ?? []).length, 1);
    assert.match(detail, /doneByAssetType/);
    assert.match(detail, /tagsByAssetType/);
    assert.match(detail, /initiallyDone=\{Boolean\(doneByAssetType\[interactionKey\]\)\}/);
    assert.match(detail, /initiallyTags=\{tagsByAssetType\[interactionKey\] \?\? \[\]\}/);
    assert.doesNotMatch(detail, /params\.set\("executiveVersionId"/);

    assert.match(copyButton, /AssetUsageTagControls/);
    assert.match(copyButton, /labels=\{labels\.usageTagLabels\}/);
    assert.match(copyButton, /saveFailed=\{labels\.saveTagFailed\}/);
    assert.match(controls, /ASSET_USAGE_TAGS\.map/);
    assert.deepEqual(ASSET_USAGE_TAGS, [
      "selected",
      "scheduled",
      "sent",
      "published",
      "used",
    ]);
    assert.match(controls, /action: wasActive \? "remove" : "add"/);
    assert.match(controls, /Could not save tag/);
  });

  it("keeps every field-level Copy clipboard-only", () => {
    const spec = read(
      "components/socialPlanner/SocialCalendarProductionSpec.tsx",
    );
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");

    const fieldCopies = spec.match(/<CopyButton[\s\S]*?\/>/g) ?? [];
    assert.ok(fieldCopies.length >= 2);
    for (const block of fieldCopies) {
      assert.match(block, /tracking=\{null\}/);
      assert.match(block, /showContinue=\{false\}/);
    }
    assert.match(card, /SocialPlannerCopyableField/);
    assert.match(spec, /SocialPlannerCopyableField/);
    assert.match(
      spec,
      /<CopyButton\s+text=\{value\}\s+tracking=\{null\}\s+showContinue=\{false\}/,
    );
    assert.doesNotMatch(spec, /initiallyDone|initiallyTags/);
    assert.doesNotMatch(spec, /social_calendar/);
    assert.doesNotMatch(spec, /AssetUsageTagControls/);
  });

  it("does not change the L1 serializer or L2 Discuss contract", () => {
    const serializer = read(
      "components/socialPlanner/socialPlannerAssetCopyText.ts",
    );
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const validation = read(
      "services/socialPlanner/conversation/socialPlannerConversationValidation.ts",
    );

    assert.match(serializer, /export function serializeSocialCalendarAsset/);
    assert.doesNotMatch(serializer, /asset-interactions|social_day_/);
    assert.match(card, /onDiscussWithAthena\(\{ date: asset\.date \}\)/);
    assert.match(detail, /setDiscussAssetReference\(\{ date: reference\.date \}\)/);
    assert.match(validation, /assetReference may not include content or title/);
    assert.match(card, /showContinue/);
    assert.doesNotMatch(card, /showContinue=\{false\}/);
  });
});

describe("Social Planner V30 L3 non-interference", () => {
  it("keeps discussion and prospect source parsing and access explicit", () => {
    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /value === "discussion"/);
    assert.match(route, /value === "prospect"/);
    assert.match(route, /sourceType === "discussion"/);
    assert.match(route, /sourceType === "prospect"/);
    assert.match(route, /getDiscussionById/);
    assert.match(route, /getProspectById/);

    const parseFn = route.slice(route.indexOf("function parseSourceType"));
    const parseBody = parseFn.slice(0, parseFn.indexOf("function socialCalendarDeniedJson"));
    assert.match(parseBody, /discussion/);
    assert.match(parseBody, /prospect/);
    assert.match(parseBody, /social_calendar/);

    const sourceFn = route.slice(route.indexOf("async function assertSourceAccess"));
    const prospectBranch = sourceFn.slice(
      sourceFn.indexOf('sourceType === "prospect"'),
      sourceFn.indexOf('sourceType === "social_calendar"'),
    );
    assert.match(prospectBranch, /getProspectById/);
    const socialSource = sourceFn.slice(
      sourceFn.indexOf('sourceType === "social_calendar"'),
      sourceFn.indexOf("async function assertExecutiveVersionAccess"),
    );
    assert.match(socialSource, /return false/);
    assert.doesNotMatch(socialSource, /getProspectById/);
  });

  it("does not copy interactions through Think Differently or conversation revision", () => {
    const think = read(
      "services/socialPlanner/thinkDifferently/generateThinkDifferentlySocialCalendar.ts",
    );
    const apply = read(
      "services/socialPlanner/conversationRevision/applySocialPlannerConversationRevision.ts",
    );
    const generateRevision = read(
      "services/socialPlanner/conversationRevision/generateConversationRevisionSocialCalendar.ts",
    );

    for (const source of [think, apply, generateRevision]) {
      assert.doesNotMatch(source, /athena_asset_interactions/);
      assert.doesNotMatch(source, /recordAssetCopyInteraction/);
      assert.doesNotMatch(source, /addAssetUsageTag/);
      assert.doesNotMatch(source, /listAssetInteractions/);
    }
  });

  it("does not rewrite Ready package_json or Social Calendar lineage", () => {
    const migration = read(L3_MIGRATION);
    const access = read(
      "services/assetInteractions/socialCalendarAssetInteractionAccess.ts",
    );
    assert.doesNotMatch(migration, /alter table athena_social_calendars/i);
    assert.match(access, /parsePersistedSocialCalendarPackage/);
    assert.doesNotMatch(access, /package_json:/);
    assert.doesNotMatch(access, /root_calendar_id|source_calendar_id|version_number/);
  });
});
