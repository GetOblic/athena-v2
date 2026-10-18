/**
 * Independent GetOblic Description and Knowledge Base drafts.
 *
 * Returns validated text for an editor. Does not save, publish, update
 * Executive Intelligence, or change Client Brain.
 */

import { generateReview } from "@/services/aiService";
import {
  KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES,
  KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES,
} from "@/services/ai/prompts/knowledgeBaseEnhancementConstraints";
import { resolveClientProspectIntelligenceAuthority } from "@/services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import { GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS } from "@/lib/prospects/getoblicContentLimits";
import {
  GETOBLIC_DESCRIPTION_MAX_CHARS,
  formatGetoblicDescriptionUserPrompt,
  generateGetoblicDescriptionText,
  stripVolatilePricing,
  ProspectGetoblicDescriptionError,
} from "@/services/prospects/prospectGetoblicDescription";
import {
  GetoblicContentDraftError,
  hasBoundedExecutiveFacts,
  loadGetoblicContentGenerationContext,
  type GetoblicContentBusinessFacts,
  type GetoblicContentExecutiveFacts,
  type GetoblicContentGenerationContext,
  type GetoblicContentGenerationContextDeps,
} from "@/services/prospects/getoblicContentGenerationContext";

export {
  GetoblicContentDraftError,
  loadGetoblicContentGenerationContext,
  type GetoblicContentGenerationContext,
};

export const GETOBLIC_KNOWLEDGE_BASE_MAX_CHARS =
  GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS;

/** Stays inside the 60-second route contract without consuming the whole window. */
export const GETOBLIC_CONTENT_DRAFT_TIMEOUT_MS = 55_000;

export type GetoblicContentDraftArtifact = "description" | "knowledge_base";

export type GetoblicContentDraftResult = {
  ok: true;
  artifact: GetoblicContentDraftArtifact;
  text: string;
  executiveVersionId: string;
};

export type GetoblicContentDraftDeps = GetoblicContentGenerationContextDeps & {
  generateReview?: typeof generateReview;
  resolveAuthority?: typeof resolveClientProspectIntelligenceAuthority;
};

type DraftRunInput = {
  prospectId: string;
  sourceOrganizationId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const KB_CONTAMINATION: RegExp[] = [
  /\bSTAGE\s*[12]\b/i,
  /\bFACT\s+SELECTION\b/i,
  /\bconfidence\s+score\b/i,
  /\bsource\s+analysis\b/i,
  /\bgeneration\s+method\b/i,
  /\bmeta[- ]analysis\b/i,
  /generateDeploymentAssets/,
  /publishExecutiveIntelligenceVersion/,
  /updateDiscussionAnalysisDeploymentFields/,
];

const KB_UNSUPPORTED: RegExp[] = [
  /\bclient brain\b/i,
  /\bAthena\b/i,
  /\bathena_identity\b/i,
  /\bmaster_profile\b/i,
  /\bstrategic blueprint\b/i,
  /\bdeployment assets?\b/i,
  /\bexecutive intelligence\b/i,
  /\bRules for Knowledge Base Enhancement\b/,
];

function isProviderAbort(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

function timeoutError(): GetoblicContentDraftError {
  return new GetoblicContentDraftError(
    "GENERATION_TIMEOUT",
    "Athena timed out while drafting this GetOblic content.",
    504,
  );
}

function generationFailed(): GetoblicContentDraftError {
  return new GetoblicContentDraftError(
    "GENERATION_FAILED",
    "Athena could not generate this GetOblic draft.",
    502,
  );
}

function invalidKnowledgeBase(): GetoblicContentDraftError {
  return new GetoblicContentDraftError(
    "INVALID_OUTPUT",
    "Athena returned an unusable Knowledge Base.",
    502,
  );
}

function wrapDraftError(error: unknown): never {
  if (error instanceof GetoblicContentDraftError) throw error;
  if (error instanceof ProspectGetoblicDescriptionError) {
    throw new GetoblicContentDraftError(
      error.code,
      error.message,
      error.httpStatus,
    );
  }
  if (isProviderAbort(error)) throw timeoutError();
  throw generationFailed();
}

type DraftSignalScope = {
  signal: AbortSignal;
  close: () => void;
};

function openDraftSignal(input: {
  parent?: AbortSignal;
  timeoutMs: number;
}): DraftSignalScope {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException("GetOblic content draft timed out.", "TimeoutError"),
    );
  }, input.timeoutMs);

  const onParentAbort = () => {
    controller.abort(input.parent?.reason);
  };
  if (input.parent) {
    if (input.parent.aborted) onParentAbort();
    else input.parent.addEventListener("abort", onParentAbort, { once: true });
  }

  return {
    signal: controller.signal,
    close: () => {
      clearTimeout(timer);
      input.parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

function abortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error("GetOblic content draft aborted.");
  error.name = "AbortError";
  return error;
}

async function withDraftSignal<T>(
  scope: DraftSignalScope,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  try {
    if (scope.signal.aborted) throw abortReason(scope.signal);
    return await new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortReason(scope.signal));
      scope.signal.addEventListener("abort", onAbort, { once: true });
      operation(scope.signal).then(
        (value) => {
          scope.signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          scope.signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  } finally {
    scope.close();
  }
}

function draftResult(
  artifact: GetoblicContentDraftArtifact,
  text: string,
  executiveVersionId: string,
): GetoblicContentDraftResult {
  return {
    ok: true,
    artifact,
    text,
    executiveVersionId,
  };
}

function formatFactLines(
  lines: Array<[string, string | null | undefined]>,
): string {
  return lines
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([label, value]) => `- ${label}: ${value!.trim()}`)
    .join("\n");
}

function pricedExecutiveLines(
  facts: GetoblicContentExecutiveFacts,
  stripPricing: boolean,
): string {
  const read = (value: string | null) => {
    if (!value) return null;
    if (!stripPricing) return value;
    const stripped = stripVolatilePricing(value);
    return stripped.trim() ? stripped : null;
  };
  return formatFactLines([
    ["Summary", read(facts.summary)],
    ["Pain points", read(facts.painPoints)],
    ["Intent", read(facts.intent)],
    ["Opportunity", read(facts.opportunityTitle)],
    ["Opportunity reason", read(facts.opportunityReason)],
    ["Briefing summary", read(facts.briefingSummary)],
  ]);
}

export function formatGetoblicDescriptionDraftUserPrompt(
  context: Pick<
    GetoblicContentGenerationContext,
    "identity" | "websiteIntelligence" | "executiveFacts"
  >,
): string {
  const base = formatGetoblicDescriptionUserPrompt({
    identity: context.identity,
    websiteIntelligence: context.websiteIntelligence,
  });
  const facts = pricedExecutiveLines(context.executiveFacts, true);
  if (!facts) return base;
  return [
    base,
    [
      "Current Executive Intelligence (current version only):",
      "Use these facts only when they agree with stored Website Intelligence.",
      "Do not add services, geography, prices, or claims that Website Intelligence does not support.",
      "Do not copy strategy, scores, deployment assets, or historical versions.",
      facts,
    ].join("\n"),
  ].join("\n\n");
}

function formatBusinessFactLines(facts: GetoblicContentBusinessFacts): string {
  return formatFactLines([
    ["Industry", facts.industry],
    ["Category", facts.category],
    ["Website", facts.website],
    ["Phone", facts.phone],
    ["Email", facts.email],
    ["Address", facts.address],
    ["Operator notes", facts.notes],
    ["Additional context", facts.additionalContext],
  ]);
}

export function formatGetoblicKnowledgeBaseDraftUserPrompt(
  context: GetoblicContentGenerationContext,
): string {
  const business = formatBusinessFactLines(context.businessFacts);
  const website = formatFactLines(
    Object.entries(context.websiteIntelligence).map(([key, value]) => [
      key,
      value,
    ]),
  );
  const executive = pricedExecutiveLines(context.executiveFacts, false);
  const depth = context.usesDeepWebsiteIntelligence
    ? "Stored website research includes deep website intelligence. Use the extracted sections below. Do not invent page lists."
    : "Stored website research is the extracted sections below. Do not invent a new scrape.";

  return [
    "Write one standalone GetOblic Knowledge Base from the current Executive Intelligence facts and stored Prospect website research below.",
    "Identity anchors identify the business. They are not a substitute for missing operational facts.",
    "Operator notes and additional context may be used only when they state a business fact. Do not treat them as public website copy.",
    depth,
    `Stay within ${GETOBLIC_KNOWLEDGE_BASE_MAX_CHARS} characters.`,
    formatFactLines([
      ["Name", context.identity.name],
      ["City", context.identity.city],
      ["State", context.identity.state],
      ["Country", context.identity.country],
    ])
      ? `Identity:\n${formatFactLines([
          ["Name", context.identity.name],
          ["City", context.identity.city],
          ["State", context.identity.state],
          ["Country", context.identity.country],
        ])}`
      : "",
    business ? `Business facts:\n${business}` : "",
    website ? `Stored Website Intelligence:\n${website}` : "",
    executive ? `Current Executive Intelligence:\n${executive}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildGetoblicKnowledgeBaseSystemPrompt(
  usesDeepWebsiteIntelligence: boolean,
): string {
  return [
    "You write one standalone GetOblic Knowledge Base for voice and support use.",
    "Return only the finished knowledge base body.",
    "Do not generate deployment assets, a strategic blueprint, executive analysis, or a directory description.",
    "Do not prefix the body with KNOWLEDGE_BASE_ENHANCEMENT.",
    KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES,
    usesDeepWebsiteIntelligence ? KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES : "",
    "Standalone adaptation:",
    "- Omit empty sections.",
    "- Do not include raw page lists, scrape metadata, confidence scores, or internal system names.",
    "- Do not mention Athena, Client Brain, or Executive Intelligence.",
    `- Never exceed ${GETOBLIC_KNOWLEDGE_BASE_MAX_CHARS} characters.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function sanitizeGetoblicKnowledgeBaseDraft(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  const fenced = text.match(/^```(?:[a-z]+)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  }
  return text.replace(/^KNOWLEDGE_BASE_ENHANCEMENT:\s*/i, "").trim();
}

function hasUsableKnowledgeBody(text: string): boolean {
  if (!/^##\s+\S/m.test(text)) return false;
  const prose = text
    .replace(/^#{1,6}\s+.+$/gm, "")
    .replace(/^[-*]\s*$/gm, "")
    .trim();
  return prose.length >= 12;
}

export function validateGetoblicKnowledgeBaseDraft(raw: unknown): string {
  if (typeof raw !== "string") throw invalidKnowledgeBase();
  if (KB_CONTAMINATION.some((pattern) => pattern.test(raw))) {
    throw invalidKnowledgeBase();
  }
  if (KB_UNSUPPORTED.some((pattern) => pattern.test(raw))) {
    throw invalidKnowledgeBase();
  }

  const sanitized = sanitizeGetoblicKnowledgeBaseDraft(raw);
  if (!sanitized) throw invalidKnowledgeBase();
  const trimmed = sanitized.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    throw invalidKnowledgeBase();
  }
  if (
    KB_CONTAMINATION.some((pattern) => pattern.test(sanitized)) ||
    KB_UNSUPPORTED.some((pattern) => pattern.test(sanitized))
  ) {
    throw invalidKnowledgeBase();
  }
  if (!hasUsableKnowledgeBody(sanitized)) throw invalidKnowledgeBase();
  if (sanitized.length > GETOBLIC_KNOWLEDGE_BASE_MAX_CHARS) {
    throw new GetoblicContentDraftError(
      "OUTPUT_LIMIT_EXCEEDED",
      "The Knowledge Base draft exceeded the 20,000 character limit.",
      422,
    );
  }
  return sanitized;
}

function assertKnowledgeBaseHasSource(
  context: GetoblicContentGenerationContext,
): void {
  const hasWebsite = Object.values(context.websiteIntelligence).some(
    (value) => value.trim().length > 0,
  );
  const hasBusinessDetail = Object.values(context.businessFacts).some(
    (value) => Boolean(value?.trim()),
  );
  if (
    hasWebsite ||
    hasBoundedExecutiveFacts(context.executiveFacts) ||
    hasBusinessDetail
  ) {
    return;
  }
  throw new GetoblicContentDraftError(
    "SOURCE_INTELLIGENCE_REQUIRED",
    "Athena needs stored Website Intelligence or current Executive Intelligence before drafting a Knowledge Base.",
    422,
  );
}

async function runDraft<T>(
  input: { signal?: AbortSignal; timeoutMs?: number },
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const scope = openDraftSignal({
    parent: input.signal,
    timeoutMs: input.timeoutMs ?? GETOBLIC_CONTENT_DRAFT_TIMEOUT_MS,
  });
  try {
    return await withDraftSignal(scope, operation);
  } catch (error) {
    wrapDraftError(error);
  }
}

async function loadDraftContext(
  input: DraftRunInput,
  deps: GetoblicContentDraftDeps,
): Promise<GetoblicContentGenerationContext> {
  return loadGetoblicContentGenerationContext(
    {
      prospectId: input.prospectId,
      sourceOrganizationId: input.sourceOrganizationId,
    },
    deps,
  );
}

export async function generateProspectGetoblicDescriptionDraft(
  input: DraftRunInput,
  deps: GetoblicContentDraftDeps = {},
): Promise<GetoblicContentDraftResult> {
  const context = await loadDraftContext(input, deps);
  const userPrompt = formatGetoblicDescriptionDraftUserPrompt(context);
  const text = await runDraft(input, (signal) =>
    generateGetoblicDescriptionText(
      {
        identity: context.identity,
        websiteIntelligence: context.websiteIntelligence,
      },
      {
        generateReview: deps.generateReview,
        signal,
        userPrompt,
      },
    ),
  );
  if (text.length > GETOBLIC_DESCRIPTION_MAX_CHARS) {
    throw new GetoblicContentDraftError(
      "INVALID_OUTPUT",
      "Athena returned an unusable GetOblic description.",
      502,
    );
  }
  return draftResult("description", text, context.executiveVersionId);
}

export async function generateProspectGetoblicKnowledgeBaseDraft(
  input: DraftRunInput,
  deps: GetoblicContentDraftDeps = {},
): Promise<GetoblicContentDraftResult> {
  const context = await loadDraftContext(input, deps);
  assertKnowledgeBaseHasSource(context);
  const generate = deps.generateReview ?? generateReview;
  const userPrompt = formatGetoblicKnowledgeBaseDraftUserPrompt(context);
  const systemPrompt = buildGetoblicKnowledgeBaseSystemPrompt(
    context.usesDeepWebsiteIntelligence,
  );

  const text = await runDraft(input, async (signal) => {
    let raw = "";
    try {
      raw = await generate(userPrompt, {
        systemPrompt,
        generationKind: "generic_review",
        athenaStage: "generic_review",
        stage: "prospect.getoblic_knowledge_base_draft",
        promptSource: "services/prospects/getoblicContentDraftGeneration.ts",
        signal,
      });
    } catch (error) {
      if (error instanceof GetoblicContentDraftError) throw error;
      if (isProviderAbort(error)) throw error;
      throw generationFailed();
    }
    return validateGetoblicKnowledgeBaseDraft(raw);
  });

  return draftResult("knowledge_base", text, context.executiveVersionId);
}

async function resolveClientSource(
  clientOrganizationId: string,
  deps: GetoblicContentDraftDeps,
): Promise<{ prospectId: string; sourceOrganizationId: string }> {
  const resolve =
    deps.resolveAuthority ?? resolveClientProspectIntelligenceAuthority;
  const authority = await resolve(clientOrganizationId);
  if (!authority.ok) {
    throw new GetoblicContentDraftError(
      "CONVERSION_UNAVAILABLE",
      "GetOblic content is not available for this account.",
      404,
    );
  }
  return {
    prospectId: authority.conversion.prospectId,
    sourceOrganizationId: authority.conversion.sourceOrganizationId,
  };
}

export async function generateClientGetoblicDescriptionDraft(
  input: {
    clientOrganizationId: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
  deps: GetoblicContentDraftDeps = {},
): Promise<GetoblicContentDraftResult> {
  const source = await resolveClientSource(input.clientOrganizationId, deps);
  return generateProspectGetoblicDescriptionDraft(
    {
      prospectId: source.prospectId,
      sourceOrganizationId: source.sourceOrganizationId,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    },
    deps,
  );
}

export async function generateClientGetoblicKnowledgeBaseDraft(
  input: {
    clientOrganizationId: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
  deps: GetoblicContentDraftDeps = {},
): Promise<GetoblicContentDraftResult> {
  const source = await resolveClientSource(input.clientOrganizationId, deps);
  return generateProspectGetoblicKnowledgeBaseDraft(
    {
      prospectId: source.prospectId,
      sourceOrganizationId: source.sourceOrganizationId,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    },
    deps,
  );
}

export function mapGetoblicContentDraftError(error: unknown): {
  status: number;
  body: {
    ok: false;
    error: { code: string; message: string };
  };
} {
  if (error instanceof GetoblicContentDraftError) {
    return {
      status: error.httpStatus,
      body: {
        ok: false,
        error: { code: error.code, message: error.message },
      },
    };
  }

  return {
    status: 502,
    body: {
      ok: false,
      error: {
        code: "GENERATION_FAILED",
        message: "Athena could not generate this GetOblic draft.",
      },
    },
  };
}
