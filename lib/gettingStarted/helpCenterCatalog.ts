/**
 * Structured Help Center catalog.
 * IDs, section membership, accents, hrefs, and default-open metadata only.
 * User-facing prose lives in tenant i18n.
 */

import type { HelpAccent } from "@/lib/gettingStarted/helpCenterPresentation";

export const HELP_SECTION_ANCHORS = {
  start: "start",
  quickStart: "quick-start",
  define: "define",
  visibility: "visibility",
  traction: "traction",
  convert: "convert",
  concepts: "concepts",
  howTo: "how-to",
  tools: "tools",
  troubleshoot: "troubleshoot",
  ask: "ask",
} as const;

export type HelpSectionAnchor =
  (typeof HELP_SECTION_ANCHORS)[keyof typeof HELP_SECTION_ANCHORS];

export type HelpSectionId =
  | "start"
  | "quick-start"
  | "outcomes"
  | "concepts"
  | "how-to"
  | "tools"
  | "troubleshoot"
  | "ask";

export type HelpTopicKind =
  | "orientation"
  | "quick-start"
  | "outcome"
  | "concept"
  | "howto"
  | "tool"
  | "troubleshoot";

export type HelpCopyPath = readonly string[];

export type HelpTopicId =
  | "start-here"
  | "qs-train-brain"
  | "qs-visibility"
  | "qs-audience"
  | "qs-prospect"
  | "outcome-define"
  | "outcome-visibility"
  | "outcome-traction"
  | "outcome-convert"
  | "concept-brain"
  | "concept-train-retrain"
  | "concept-website-intelligence"
  | "concept-deep-scrape"
  | "concept-intelligence"
  | "concept-observation"
  | "concept-audience"
  | "concept-prospect"
  | "concept-audience-vs-prospect"
  | "concept-refresh"
  | "concept-discuss"
  | "concept-think-differently"
  | "concept-ready-failed-retry"
  | "concept-working-vs-readiness"
  | "concept-saved-work"
  | "howto-just-joined"
  | "howto-teach-business"
  | "howto-improve-knowledge"
  | "howto-understand-visibility"
  | "howto-create-audience"
  | "howto-suggest-audience"
  | "howto-audience-from-prospect"
  | "howto-social-for-audience"
  | "howto-ads-for-audience"
  | "howto-generic-ads-social"
  | "howto-find-prospect"
  | "howto-research-prospect"
  | "howto-move-prospect"
  | "howto-audience-vs-prospect"
  | "howto-incomplete-intelligence"
  | "howto-retry-failed"
  | "howto-find-saved-work"
  | "howto-getoblic-capacity"
  | "howto-apply-social-suggestions"
  | "tool-brain"
  | "tool-visibility"
  | "tool-audiences"
  | "tool-ads"
  | "tool-social"
  | "tool-prospects"
  | "tool-identity-secondary"
  | "tool-legacy-note"
  | "ts-generation-slow"
  | "ts-generation-failed"
  | "ts-website-research"
  | "ts-technical-visibility"
  | "ts-incomplete-intelligence"
  | "ts-wrong-audience"
  | "ts-wrong-prospect"
  | "ts-identity-changes"
  | "ts-getoblic-full"
  | "ts-audience-from-prospect-unavailable"
  | "ts-discuss-readonly";

export type HelpTopicDefinition = {
  id: HelpTopicId;
  section: HelpSectionId;
  kind: HelpTopicKind;
  accent: HelpAccent;
  anchor: string;
  hrefs: readonly string[];
  primaryCta?: string;
  relatedIds: readonly HelpTopicId[];
  defaultOpen: boolean;
  searchable: boolean;
  copyPath: HelpCopyPath;
};

export const HELP_SAFE_INTERNAL_HREF_PATTERN =
  /^\/(?:identity|seo(?:\/new)?|personas(?:\/import)?|ads(?:\/new)?|social-planner|prospects(?:\/find|\/import)?|getting-started)?$/;

export const HELP_FORBIDDEN_PRIMARY_HREFS = [
  "/inbox",
  "/discussions",
  "/opportunities",
  "/briefings",
  "/intelligence-domains",
  "/communities",
  "/reviews",
  "/licensee",
  "/super",
  "/quote",
] as const;

export const HELP_PRIMARY_V2_HREFS = [
  "/",
  "/identity",
  "/seo",
  "/seo/new",
  "/personas",
  "/personas/import",
  "/ads",
  "/ads/new",
  "/social-planner",
  "/prospects",
  "/prospects/find",
] as const;

export const HELP_NAV_ITEMS: readonly {
  id: HelpSectionAnchor;
  copyKey:
    | "start"
    | "quickStart"
    | "define"
    | "visibility"
    | "traction"
    | "convert"
    | "concepts"
    | "howTo"
    | "tools"
    | "troubleshoot"
    | "ask";
}[] = [
  { id: HELP_SECTION_ANCHORS.start, copyKey: "start" },
  { id: HELP_SECTION_ANCHORS.quickStart, copyKey: "quickStart" },
  { id: HELP_SECTION_ANCHORS.define, copyKey: "define" },
  { id: HELP_SECTION_ANCHORS.visibility, copyKey: "visibility" },
  { id: HELP_SECTION_ANCHORS.traction, copyKey: "traction" },
  { id: HELP_SECTION_ANCHORS.convert, copyKey: "convert" },
  { id: HELP_SECTION_ANCHORS.concepts, copyKey: "concepts" },
  { id: HELP_SECTION_ANCHORS.howTo, copyKey: "howTo" },
  { id: HELP_SECTION_ANCHORS.tools, copyKey: "tools" },
  { id: HELP_SECTION_ANCHORS.troubleshoot, copyKey: "troubleshoot" },
  { id: HELP_SECTION_ANCHORS.ask, copyKey: "ask" },
] as const;

export const HELP_OUTCOME_ORDER = [
  "outcome-define",
  "outcome-visibility",
  "outcome-traction",
  "outcome-convert",
] as const satisfies readonly HelpTopicId[];

export const HELP_QUICK_START_ORDER = [
  "qs-train-brain",
  "qs-visibility",
  "qs-audience",
  "qs-prospect",
] as const satisfies readonly HelpTopicId[];

export const HELP_DEFAULT_OPEN_SECTION_IDS = [
  "start",
  "quick-start",
] as const satisfies readonly HelpSectionId[];

export const HELP_CENTER_TOPICS: readonly HelpTopicDefinition[] = [
  {
    id: "start-here",
    section: "start",
    kind: "orientation",
    accent: "orange",
    anchor: HELP_SECTION_ANCHORS.start,
    hrefs: ["/"],
    relatedIds: ["qs-train-brain", "outcome-define"],
    defaultOpen: true,
    searchable: false,
    copyPath: ["startHere"],
  },
  {
    id: "qs-train-brain",
    section: "quick-start",
    kind: "quick-start",
    accent: "orange",
    anchor: "qs-train-brain",
    hrefs: ["/identity"],
    primaryCta: "/identity",
    relatedIds: ["howto-teach-business", "concept-brain"],
    defaultOpen: true,
    searchable: true,
    copyPath: ["quickStart", "steps", "trainBrain"],
  },
  {
    id: "qs-visibility",
    section: "quick-start",
    kind: "quick-start",
    accent: "sky",
    anchor: "qs-visibility",
    hrefs: ["/seo/new"],
    primaryCta: "/seo/new",
    relatedIds: ["howto-understand-visibility", "outcome-visibility"],
    defaultOpen: true,
    searchable: true,
    copyPath: ["quickStart", "steps", "visibility"],
  },
  {
    id: "qs-audience",
    section: "quick-start",
    kind: "quick-start",
    accent: "violet",
    anchor: "qs-audience",
    hrefs: ["/personas/import"],
    primaryCta: "/personas/import",
    relatedIds: ["howto-create-audience", "concept-audience"],
    defaultOpen: true,
    searchable: true,
    copyPath: ["quickStart", "steps", "audience"],
  },
  {
    id: "qs-prospect",
    section: "quick-start",
    kind: "quick-start",
    accent: "cyan",
    anchor: "qs-prospect",
    hrefs: ["/prospects/find"],
    primaryCta: "/prospects/find",
    relatedIds: ["howto-find-prospect", "concept-prospect"],
    defaultOpen: true,
    searchable: true,
    copyPath: ["quickStart", "steps", "prospect"],
  },
  {
    id: "outcome-define",
    section: "outcomes",
    kind: "outcome",
    accent: "orange",
    anchor: HELP_SECTION_ANCHORS.define,
    hrefs: ["/identity"],
    primaryCta: "/identity",
    relatedIds: ["tool-brain", "concept-train-retrain"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["outcomes", "define"],
  },
  {
    id: "outcome-visibility",
    section: "outcomes",
    kind: "outcome",
    accent: "sky",
    anchor: HELP_SECTION_ANCHORS.visibility,
    hrefs: ["/seo", "/seo/new"],
    primaryCta: "/seo",
    relatedIds: ["tool-visibility", "howto-understand-visibility"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["outcomes", "visibility"],
  },
  {
    id: "outcome-traction",
    section: "outcomes",
    kind: "outcome",
    accent: "violet",
    anchor: HELP_SECTION_ANCHORS.traction,
    hrefs: ["/personas", "/ads", "/social-planner"],
    primaryCta: "/personas",
    relatedIds: ["tool-audiences", "tool-ads", "tool-social"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["outcomes", "traction"],
  },
  {
    id: "outcome-convert",
    section: "outcomes",
    kind: "outcome",
    accent: "cyan",
    anchor: HELP_SECTION_ANCHORS.convert,
    hrefs: ["/prospects", "/prospects/find"],
    primaryCta: "/prospects",
    relatedIds: ["tool-prospects", "howto-find-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["outcomes", "convert"],
  },
  {
    id: "concept-brain",
    section: "concepts",
    kind: "concept",
    accent: "orange",
    anchor: "concept-brain",
    hrefs: ["/identity"],
    relatedIds: ["concept-train-retrain", "tool-brain"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "brain"],
  },
  {
    id: "concept-train-retrain",
    section: "concepts",
    kind: "concept",
    accent: "orange",
    anchor: "concept-train-retrain",
    hrefs: ["/identity"],
    relatedIds: ["concept-brain", "ts-identity-changes"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "trainVsRetrain"],
  },
  {
    id: "concept-website-intelligence",
    section: "concepts",
    kind: "concept",
    accent: "sky",
    anchor: "concept-website-intelligence",
    hrefs: ["/identity"],
    relatedIds: ["concept-deep-scrape", "ts-website-research"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "websiteIntelligence"],
  },
  {
    id: "concept-deep-scrape",
    section: "concepts",
    kind: "concept",
    accent: "sky",
    anchor: "concept-deep-scrape",
    hrefs: ["/identity"],
    relatedIds: ["concept-website-intelligence", "howto-research-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "deepScrape"],
  },
  {
    id: "concept-intelligence",
    section: "concepts",
    kind: "concept",
    accent: "green",
    anchor: "concept-intelligence",
    hrefs: [],
    relatedIds: ["concept-refresh", "concept-observation"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "intelligence"],
  },
  {
    id: "concept-observation",
    section: "concepts",
    kind: "concept",
    accent: "violet",
    anchor: "concept-observation",
    hrefs: ["/personas", "/prospects"],
    relatedIds: ["concept-intelligence", "howto-incomplete-intelligence"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "observation"],
  },
  {
    id: "concept-audience",
    section: "concepts",
    kind: "concept",
    accent: "violet",
    anchor: "concept-audience",
    hrefs: ["/personas"],
    relatedIds: ["concept-audience-vs-prospect", "howto-create-audience"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "audience"],
  },
  {
    id: "concept-prospect",
    section: "concepts",
    kind: "concept",
    accent: "cyan",
    anchor: "concept-prospect",
    hrefs: ["/prospects"],
    relatedIds: ["concept-audience-vs-prospect", "howto-find-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "prospect"],
  },
  {
    id: "concept-audience-vs-prospect",
    section: "concepts",
    kind: "concept",
    accent: "green",
    anchor: "concept-audience-vs-prospect",
    hrefs: ["/personas", "/prospects"],
    relatedIds: ["howto-audience-vs-prospect", "concept-audience"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "audienceVsProspect"],
  },
  {
    id: "concept-refresh",
    section: "concepts",
    kind: "concept",
    accent: "sky",
    anchor: "concept-refresh",
    hrefs: ["/personas", "/prospects"],
    relatedIds: ["concept-intelligence", "concept-think-differently"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "refresh"],
  },
  {
    id: "concept-discuss",
    section: "concepts",
    kind: "concept",
    accent: "muted",
    anchor: "concept-discuss",
    hrefs: ["/social-planner"],
    relatedIds: ["howto-apply-social-suggestions", "ts-discuss-readonly"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "discuss"],
  },
  {
    id: "concept-think-differently",
    section: "concepts",
    kind: "concept",
    accent: "green",
    anchor: "concept-think-differently",
    hrefs: ["/personas", "/prospects", "/social-planner", "/ads"],
    relatedIds: ["concept-refresh", "howto-generic-ads-social"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "thinkDifferently"],
  },
  {
    id: "concept-ready-failed-retry",
    section: "concepts",
    kind: "concept",
    accent: "orange",
    anchor: "concept-ready-failed-retry",
    hrefs: [],
    relatedIds: ["ts-generation-failed", "ts-generation-slow"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "readyFailedRetry"],
  },
  {
    id: "concept-working-vs-readiness",
    section: "concepts",
    kind: "concept",
    accent: "muted",
    anchor: "concept-working-vs-readiness",
    hrefs: ["/personas", "/prospects"],
    relatedIds: ["concept-ready-failed-retry", "howto-move-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "workingVsReadiness"],
  },
  {
    id: "concept-saved-work",
    section: "concepts",
    kind: "concept",
    accent: "green",
    anchor: "concept-saved-work",
    hrefs: [
      "/identity",
      "/seo",
      "/personas",
      "/ads",
      "/social-planner",
      "/prospects",
    ],
    relatedIds: ["howto-find-saved-work"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["concepts", "savedWork"],
  },
  {
    id: "howto-just-joined",
    section: "how-to",
    kind: "howto",
    accent: "orange",
    anchor: "howto-just-joined",
    hrefs: ["/identity"],
    primaryCta: "/identity",
    relatedIds: ["qs-train-brain", "howto-teach-business"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "justJoined"],
  },
  {
    id: "howto-teach-business",
    section: "how-to",
    kind: "howto",
    accent: "orange",
    anchor: "howto-teach-business",
    hrefs: ["/identity"],
    primaryCta: "/identity",
    relatedIds: ["concept-brain", "qs-train-brain"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "teachBusiness"],
  },
  {
    id: "howto-improve-knowledge",
    section: "how-to",
    kind: "howto",
    accent: "orange",
    anchor: "howto-improve-knowledge",
    hrefs: ["/identity"],
    primaryCta: "/identity",
    relatedIds: ["concept-train-retrain", "concept-deep-scrape"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "improveKnowledge"],
  },
  {
    id: "howto-understand-visibility",
    section: "how-to",
    kind: "howto",
    accent: "sky",
    anchor: "howto-understand-visibility",
    hrefs: ["/seo", "/seo/new"],
    primaryCta: "/seo/new",
    relatedIds: ["outcome-visibility", "ts-technical-visibility"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "understandVisibility"],
  },
  {
    id: "howto-create-audience",
    section: "how-to",
    kind: "howto",
    accent: "violet",
    anchor: "howto-create-audience",
    hrefs: ["/personas/import"],
    primaryCta: "/personas/import",
    relatedIds: ["howto-suggest-audience", "concept-audience"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "createAudience"],
  },
  {
    id: "howto-suggest-audience",
    section: "how-to",
    kind: "howto",
    accent: "violet",
    anchor: "howto-suggest-audience",
    hrefs: ["/personas/import"],
    primaryCta: "/personas/import",
    relatedIds: ["howto-create-audience", "concept-brain"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "suggestAudience"],
  },
  {
    id: "howto-audience-from-prospect",
    section: "how-to",
    kind: "howto",
    accent: "cyan",
    anchor: "howto-audience-from-prospect",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["ts-audience-from-prospect-unavailable", "concept-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "audienceFromProspect"],
  },
  {
    id: "howto-social-for-audience",
    section: "how-to",
    kind: "howto",
    accent: "violet",
    anchor: "howto-social-for-audience",
    hrefs: ["/social-planner"],
    primaryCta: "/social-planner",
    relatedIds: ["howto-apply-social-suggestions", "tool-social"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "socialForAudience"],
  },
  {
    id: "howto-ads-for-audience",
    section: "how-to",
    kind: "howto",
    accent: "violet",
    anchor: "howto-ads-for-audience",
    hrefs: ["/ads/new"],
    primaryCta: "/ads/new",
    relatedIds: ["howto-generic-ads-social", "tool-ads"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "adsForAudience"],
  },
  {
    id: "howto-generic-ads-social",
    section: "how-to",
    kind: "howto",
    accent: "violet",
    anchor: "howto-generic-ads-social",
    hrefs: ["/ads", "/social-planner"],
    primaryCta: "/ads",
    relatedIds: ["howto-ads-for-audience", "howto-social-for-audience"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "genericAdsSocial"],
  },
  {
    id: "howto-find-prospect",
    section: "how-to",
    kind: "howto",
    accent: "cyan",
    anchor: "howto-find-prospect",
    hrefs: ["/prospects/find", "/prospects/import"],
    primaryCta: "/prospects/find",
    relatedIds: ["qs-prospect", "howto-research-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "findProspect"],
  },
  {
    id: "howto-research-prospect",
    section: "how-to",
    kind: "howto",
    accent: "cyan",
    anchor: "howto-research-prospect",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["concept-deep-scrape", "howto-move-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "researchProspect"],
  },
  {
    id: "howto-move-prospect",
    section: "how-to",
    kind: "howto",
    accent: "cyan",
    anchor: "howto-move-prospect",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["concept-working-vs-readiness", "howto-research-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "moveProspect"],
  },
  {
    id: "howto-audience-vs-prospect",
    section: "how-to",
    kind: "howto",
    accent: "green",
    anchor: "howto-audience-vs-prospect",
    hrefs: ["/personas", "/prospects"],
    primaryCta: "/personas",
    relatedIds: ["concept-audience-vs-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "audienceVsProspect"],
  },
  {
    id: "howto-incomplete-intelligence",
    section: "how-to",
    kind: "howto",
    accent: "sky",
    anchor: "howto-incomplete-intelligence",
    hrefs: ["/personas", "/prospects", "/identity"],
    primaryCta: "/identity",
    relatedIds: ["ts-incomplete-intelligence", "concept-observation"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "incompleteIntelligence"],
  },
  {
    id: "howto-retry-failed",
    section: "how-to",
    kind: "howto",
    accent: "orange",
    anchor: "howto-retry-failed",
    hrefs: [],
    relatedIds: ["ts-generation-failed", "concept-ready-failed-retry"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "retryFailed"],
  },
  {
    id: "howto-find-saved-work",
    section: "how-to",
    kind: "howto",
    accent: "green",
    anchor: "howto-find-saved-work",
    hrefs: [
      "/identity",
      "/seo",
      "/personas",
      "/ads",
      "/social-planner",
      "/prospects",
    ],
    primaryCta: "/",
    relatedIds: ["concept-saved-work"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "findSavedWork"],
  },
  {
    id: "howto-getoblic-capacity",
    section: "how-to",
    kind: "howto",
    accent: "cyan",
    anchor: "howto-getoblic-capacity",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["ts-getoblic-full"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "getoblicCapacity"],
  },
  {
    id: "howto-apply-social-suggestions",
    section: "how-to",
    kind: "howto",
    accent: "green",
    anchor: "howto-apply-social-suggestions",
    hrefs: ["/social-planner"],
    primaryCta: "/social-planner",
    relatedIds: ["concept-discuss", "tool-social"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["howTo", "applySocialSuggestions"],
  },
  {
    id: "tool-brain",
    section: "tools",
    kind: "tool",
    accent: "orange",
    anchor: "tool-brain",
    hrefs: ["/identity"],
    primaryCta: "/identity",
    relatedIds: ["outcome-define"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["tools", "brain"],
  },
  {
    id: "tool-visibility",
    section: "tools",
    kind: "tool",
    accent: "sky",
    anchor: "tool-visibility",
    hrefs: ["/seo"],
    primaryCta: "/seo",
    relatedIds: ["outcome-visibility"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["tools", "visibility"],
  },
  {
    id: "tool-audiences",
    section: "tools",
    kind: "tool",
    accent: "violet",
    anchor: "tool-audiences",
    hrefs: ["/personas"],
    primaryCta: "/personas",
    relatedIds: ["outcome-traction"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["tools", "audiences"],
  },
  {
    id: "tool-ads",
    section: "tools",
    kind: "tool",
    accent: "violet",
    anchor: "tool-ads",
    hrefs: ["/ads"],
    primaryCta: "/ads",
    relatedIds: ["outcome-traction"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["tools", "ads"],
  },
  {
    id: "tool-social",
    section: "tools",
    kind: "tool",
    accent: "violet",
    anchor: "tool-social",
    hrefs: ["/social-planner"],
    primaryCta: "/social-planner",
    relatedIds: ["outcome-traction"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["tools", "social"],
  },
  {
    id: "tool-prospects",
    section: "tools",
    kind: "tool",
    accent: "cyan",
    anchor: "tool-prospects",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["outcome-convert"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["tools", "prospects"],
  },
  {
    id: "tool-identity-secondary",
    section: "tools",
    kind: "tool",
    accent: "muted",
    anchor: "tool-identity-secondary",
    hrefs: ["/identity"],
    relatedIds: ["tool-brain"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["tools", "identitySecondary"],
  },
  {
    id: "tool-legacy-note",
    section: "tools",
    kind: "tool",
    accent: "muted",
    anchor: "tool-legacy-note",
    hrefs: [],
    relatedIds: [],
    defaultOpen: false,
    searchable: false,
    copyPath: ["tools", "legacyNote"],
  },
  {
    id: "ts-generation-slow",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "muted",
    anchor: "ts-generation-slow",
    hrefs: ["/"],
    relatedIds: ["concept-ready-failed-retry"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "generationSlow"],
  },
  {
    id: "ts-generation-failed",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "orange",
    anchor: "ts-generation-failed",
    hrefs: [],
    relatedIds: ["howto-retry-failed"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "generationFailed"],
  },
  {
    id: "ts-website-research",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "sky",
    anchor: "ts-website-research",
    hrefs: ["/identity", "/prospects"],
    relatedIds: ["concept-deep-scrape"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "websiteResearch"],
  },
  {
    id: "ts-technical-visibility",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "sky",
    anchor: "ts-technical-visibility",
    hrefs: ["/identity", "/seo"],
    primaryCta: "/identity",
    relatedIds: ["howto-understand-visibility"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "technicalVisibility"],
  },
  {
    id: "ts-incomplete-intelligence",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "sky",
    anchor: "ts-incomplete-intelligence",
    hrefs: ["/personas", "/prospects"],
    relatedIds: ["howto-incomplete-intelligence"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "incompleteIntelligence"],
  },
  {
    id: "ts-wrong-audience",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "violet",
    anchor: "ts-wrong-audience",
    hrefs: ["/personas"],
    primaryCta: "/personas",
    relatedIds: ["concept-observation"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "wrongAudience"],
  },
  {
    id: "ts-wrong-prospect",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "cyan",
    anchor: "ts-wrong-prospect",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["concept-refresh"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "wrongProspect"],
  },
  {
    id: "ts-identity-changes",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "orange",
    anchor: "ts-identity-changes",
    hrefs: ["/identity"],
    primaryCta: "/identity",
    relatedIds: ["concept-train-retrain"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "identityChanges"],
  },
  {
    id: "ts-getoblic-full",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "cyan",
    anchor: "ts-getoblic-full",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["howto-getoblic-capacity"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "getoblicFull"],
  },
  {
    id: "ts-audience-from-prospect-unavailable",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "cyan",
    anchor: "ts-audience-from-prospect-unavailable",
    hrefs: ["/prospects"],
    primaryCta: "/prospects",
    relatedIds: ["howto-audience-from-prospect"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "audienceFromProspectUnavailable"],
  },
  {
    id: "ts-discuss-readonly",
    section: "troubleshoot",
    kind: "troubleshoot",
    accent: "muted",
    anchor: "ts-discuss-readonly",
    hrefs: ["/social-planner"],
    relatedIds: ["concept-discuss", "howto-apply-social-suggestions"],
    defaultOpen: false,
    searchable: true,
    copyPath: ["troubleshoot", "discussReadonly"],
  },
] as const;

const topicById = new Map(
  HELP_CENTER_TOPICS.map((topic) => [topic.id, topic]),
);

export function getHelpTopic(id: string): HelpTopicDefinition | undefined {
  return topicById.get(id as HelpTopicId);
}

export function isHelpTopicId(id: string): id is HelpTopicId {
  return topicById.has(id as HelpTopicId);
}

export function isHelpAskDestination(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  return normalized === HELP_SECTION_ANCHORS.ask;
}

export function listHelpTopicsBySection(
  section: HelpSectionId,
): HelpTopicDefinition[] {
  return HELP_CENTER_TOPICS.filter((topic) => topic.section === section);
}

export function listSearchableHelpTopics(): HelpTopicDefinition[] {
  return HELP_CENTER_TOPICS.filter((topic) => topic.searchable);
}

export function listPrimaryHelpCtas(): string[] {
  return HELP_CENTER_TOPICS.flatMap((topic) =>
    topic.primaryCta ? [topic.primaryCta] : [],
  );
}

export function isSafeHelpHref(href: string): boolean {
  if (href === "/") return true;
  return (
    HELP_SAFE_INTERNAL_HREF_PATTERN.test(href) &&
    !HELP_FORBIDDEN_PRIMARY_HREFS.some(
      (forbidden) => href === forbidden || href.startsWith(`${forbidden}/`),
    )
  );
}
