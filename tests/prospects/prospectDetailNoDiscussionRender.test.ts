/**
 * CO-1C — Saved / no-discussion Prospect detail must render.
 * Source-contract and hook-boundary checks. No GetOblic, OpenRouter, or DB I/O.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  DiscussionRegenerationProvider,
  useDiscussionRegeneration,
} from "../../components/discussions/DiscussionRegenerationProvider";
import { ProspectMetadataEditor } from "../../components/prospects/ProspectMetadataEditor";
import { emptyRegenerationSnapshot } from "../../lib/discussionRegenerationStatus";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function RegenerationConsumer({ label }: { label: string }) {
  const { isGenerating, trackQueuedGeneration, startRegeneration } =
    useDiscussionRegeneration();
  return createElement(
    "div",
    { "data-label": label },
    isGenerating ? "generating" : "idle",
    typeof trackQueuedGeneration,
    typeof startRegeneration,
  );
}

const stubRouter = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

const savedProspectWithoutDiscussion: Prospect = {
  id: "d0173539-968e-4b10-a62f-d712d4d821da",
  created_at: "2026-09-08T00:00:00.000Z",
  updated_at: "2026-09-08T00:00:00.000Z",
  organization_id: "org-1",
  user_id: null,
  community_id: null,
  linked_discussion_id: null,
  business_name: "Salon Dallas",
  website: null,
  linkedin: null,
  facebook: null,
  instagram: null,
  industry: null,
  category: "Hair Salons",
  country: "United States",
  state: "TX",
  city: "Dallas",
  address: null,
  company_size: null,
  revenue: null,
  employee_count: null,
  technologies: null,
  pain_points: null,
  decision_maker: null,
  first_name: null,
  last_name: null,
  external_contact_id: null,
  timezone: null,
  job_title: null,
  email: null,
  phone: null,
  whatsapp_number: null,
  getoblic_type: null,
  google_business_url: null,
  notes: null,
  additional_context: null,
  source: "getoblic",
  status: "Saved",
  lifecycle_status: "New",
  ads_content: null,
  opportunity_score: null,
  priority: 1,
  website_intelligence: null,
  raw_json: null,
  last_activity: null,
  import_batch_id: null,
};

function renderWithProvider(
  children: ReactNode,
  discussionId: string | null,
) {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: stubRouter },
      createElement(
        DiscussionRegenerationProvider,
        {
          discussionId,
          initialSnapshot: emptyRegenerationSnapshot(),
        },
        children,
      ),
    ),
  );
}

describe("CO-1C no-discussion Prospect detail render", () => {
  it("1. ProspectMetadataEditor can render without a discussion", () => {
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    assert.match(editor, /useDiscussionRegeneration/);
    assert.match(editor, /trackQueuedGeneration/);

    const html = renderWithProvider(
      createElement(ProspectMetadataEditor, {
        prospect: savedProspectWithoutDiscussion,
        discussionId: null,
        defaultOpen: true,
      }),
      null,
    );
    assert.match(html, /Salon Dallas|Prospect profile|Business Name/);
    assert.doesNotMatch(
      html,
      /useDiscussionRegeneration must be used within DiscussionRegenerationProvider/,
    );

    const genericSaved = renderWithProvider(
      createElement(ProspectMetadataEditor, {
        prospect: {
          ...savedProspectWithoutDiscussion,
          id: "manual-saved-no-discussion",
          business_name: "Manual Saved Prospect",
          source: "manual",
        },
        discussionId: null,
        defaultOpen: true,
      }),
      null,
    );
    assert.match(genericSaved, /Manual Saved Prospect|Prospect profile/);

    assert.throws(
      () =>
        renderToStaticMarkup(
          createElement(
            AppRouterContext.Provider,
            { value: stubRouter },
            createElement(ProspectMetadataEditor, {
              prospect: savedProspectWithoutDiscussion,
              discussionId: null,
            }),
          ),
        ),
      /useDiscussionRegeneration must be used within DiscussionRegenerationProvider/,
    );
  });

  it("2. No-discussion Prospect detail always supplies the provider and does not throw", () => {
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /DiscussionRegenerationProvider/);
    assert.match(page, /discussionId=\{discussion\?\.id \?\? null\}/);
    assert.doesNotMatch(page, /if \(!discussion\) \{\s*return pageBody;/);
    assert.match(page, /ProspectMetadataEditor/);
    assert.match(page, /linked_discussion_id/);

    assert.doesNotThrow(() => {
      renderWithProvider(
        createElement(RegenerationConsumer, { label: "prospect-detail" }),
        null,
      );
    });
  });

  it("3. Discussion-backed Prospect detail still mounts the live session provider", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );

    assert.match(page, /discussionId=\{discussion\?\.id \?\? null\}/);
    assert.match(page, /ExecutiveIntelligenceWorkspace/);
    assert.match(page, /ProspectRefreshIntelligenceButton/);
    assert.match(provider, /DiscussionRegenerationSessionProvider/);
    assert.match(
      provider,
      /if \(!discussionId\) \{[\s\S]*IDLE_DISCUSSION_REGENERATION/,
    );
    assert.match(
      provider,
      /<DiscussionRegenerationSessionProvider[\s\S]*discussionId=\{discussionId\}/,
    );
  });

  it("4. Regeneration hook still requires a provider and the live session is unchanged", () => {
    assert.throws(
      () =>
        renderToStaticMarkup(
          createElement(RegenerationConsumer, { label: "missing-provider" }),
        ),
      /useDiscussionRegeneration must be used within DiscussionRegenerationProvider/,
    );

    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    const session = provider.slice(
      provider.indexOf("function DiscussionRegenerationSessionProvider"),
    );
    assert.match(session, /fetchRegenerationStatus/);
    assert.match(session, /startRegeneration/);
    assert.match(session, /startThinkDifferently/);
    assert.match(session, /trackQueuedGeneration/);
    assert.match(session, /\/api\/discussions\/\$\{discussionId\}\/analyze/);
    assert.match(session, /\/api\/discussions\/\$\{discussionId\}\/think-differently/);
    assert.match(session, /useBackgroundActionCompletionSound/);
    const idleWrapper = provider.slice(
      provider.indexOf("const IDLE_DISCUSSION_REGENERATION"),
      provider.indexOf("function DiscussionRegenerationSessionProvider"),
    );
    assert.doesNotMatch(idleWrapper, /fetchRegenerationStatus/);
    assert.match(idleWrapper, /if \(!discussionId\)/);
  });

  it("5. GetOblic claim and conversion semantics are unchanged", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    const convert = read("app/api/prospects/from-getoblic/route.ts");
    const discovery = read(
      "components/prospects/GetOblicOpportunityDiscovery.tsx",
    );

    assert.doesNotMatch(page, /from-getoblic|getoblic-directory\/claim/);
    assert.doesNotMatch(editor, /from-getoblic|getoblic-directory\/claim/);
    assert.doesNotMatch(provider, /from-getoblic|getoblic-directory\/claim/);
    assert.match(convert, /export async function POST/);
    assert.match(discovery, /\/api\/prospects\/from-getoblic/);
    assert.match(page, /GetOblicWebsiteCompletionCard/);
    assert.match(
      page,
      /prospect\.source === "getoblic" && !prospect\.website/,
    );
  });

  it("6. Idle no-discussion path does not create a discussion or start generation", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    const idle = provider.slice(
      provider.indexOf("const IDLE_DISCUSSION_REGENERATION"),
      provider.indexOf("function DiscussionRegenerationSessionProvider"),
    );

    assert.doesNotMatch(idle, /fetchRegenerationStatus/);
    assert.doesNotMatch(idle, /writeRegenerationSession/);
    assert.doesNotMatch(idle, /enqueueDiscussionGenerationJob/);
    assert.doesNotMatch(idle, /\/api\/discussions\/.+\/analyze/);
    assert.doesNotMatch(idle, /createDiscussion/);
    assert.doesNotMatch(page, /createDiscussion|enqueueDiscussionGenerationJob/);
    assert.doesNotMatch(editor, /createDiscussion|enqueueDiscussionGenerationJob/);
    assert.match(idle, /startRegeneration: noopAsync/);
    assert.match(idle, /trackQueuedGeneration: noop/);
  });
});
