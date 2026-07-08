import {
  dedupeOpportunitiesByDiscussion,
  selectCanonicalOpportunity,
} from "@/lib/canonicalRecords";
import {
  isProtectedOpportunityStatus,
  isValidOpportunityStatusKey,
  toOpportunityStatusStorage,
  type OpportunityStatusKey,
} from "@/lib/opportunityStatus";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Opportunity = {
    id: string;
    created_at: string;
    updated_at: string;
    organization_id?: string | null;

    discussion_id: string | null;
    community_id: string | null;
    user_id?: string | null;

    type: string;
    status: string;

    score: number;
    urgency: string | null;
    intent: string | null;
    risk_level: string | null;

    title: string;
    reason: string | null;
    recommended_action: string | null;
    suggested_cta: string | null;

    assigned_to: string | null;
    due_at: string | null;

    ai_summary: string | null;
    ai_recommendation: string | null;

    raw_json: Record<string, unknown> | null;
};

export class OpportunityNotFoundError extends Error {
  constructor(opportunityId: string) {
    super(`Opportunity not found: ${opportunityId}`);
    this.name = "OpportunityNotFoundError";
  }
}

export class OpportunityUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityUpdateError";
  }
}

export async function getOpportunityCount(
    organizationId: string,
): Promise<number> {
    const opportunities = await getCanonicalOpportunities(organizationId);
    return opportunities.length;
}

export async function getOpportunities(
    organizationId: string,
): Promise<Opportunity[]> {
    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .select("*")
        .eq("organization_id", organizationId)
        .order("score", { ascending: false });

    if (error) {
        console.error(error);
        return [];
    }

    return data ?? [];
}

export async function getCanonicalOpportunities(
    organizationId: string,
): Promise<Opportunity[]> {
    const opportunities = await getOpportunities(organizationId);
    return dedupeOpportunitiesByDiscussion(opportunities);
}

export async function getOpportunityById(
    id: string,
    organizationId: string,
): Promise<Opportunity | null> {
    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (error) {
        console.error(error);
        return null;
    }

    return data;
}

export async function getOpportunitiesByDiscussionId(
    discussionId: string,
    organizationId: string,
): Promise<Opportunity[]> {
    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .select("*")
        .eq("discussion_id", discussionId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return [];
    }

    return data ?? [];
}

export async function getOpportunityByDiscussionId(
    discussionId: string,
    organizationId: string,
): Promise<Opportunity | null> {
    const opportunities = await getOpportunitiesByDiscussionId(
        discussionId,
        organizationId,
    );

    return selectCanonicalOpportunity(opportunities);
}

export type CreateOpportunityInput = {
    organization_id: string;
    discussion_id?: string | null;
    community_id?: string | null;
    user_id?: string | null;
    type?: string;
    status?: string;
    score?: number;
    urgency?: string | null;
    intent?: string | null;
    risk_level?: string | null;
    title: string;
    reason?: string | null;
    recommended_action?: string | null;
    suggested_cta?: string | null;
    assigned_to?: string | null;
    due_at?: string | null;
    ai_summary?: string | null;
    ai_recommendation?: string | null;
    raw_json?: Record<string, unknown> | null;
};

export async function createOpportunity(
    input: CreateOpportunityInput,
): Promise<Opportunity | null> {
    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .insert({
            organization_id: input.organization_id,
            discussion_id: input.discussion_id ?? null,
            community_id: input.community_id ?? null,
            user_id: input.user_id ?? null,
            type: input.type ?? "community_discussion",
            status: input.status ?? "draft",
            score: input.score ?? 0,
            urgency: input.urgency ?? null,
            intent: input.intent ?? null,
            risk_level: input.risk_level ?? null,
            title: input.title,
            reason: input.reason ?? null,
            recommended_action: input.recommended_action ?? null,
            suggested_cta: input.suggested_cta ?? null,
            assigned_to: input.assigned_to ?? null,
            due_at: input.due_at ?? null,
            ai_summary: input.ai_summary ?? null,
            ai_recommendation: input.ai_recommendation ?? null,
            raw_json: input.raw_json ?? null,
        })
        .select("*")
        .single();

    if (error) {
        console.error("Error creating opportunity:", error);
        return null;
    }

    return data;
}

export async function updateOpportunityFromAnalysis(
    id: string,
    organizationId: string,
    input: CreateOpportunityInput,
    existingStatus: string,
): Promise<Opportunity | null> {
    const status = isProtectedOpportunityStatus(existingStatus)
        ? existingStatus
        : (input.status ?? existingStatus ?? "draft");

    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .update({
            community_id: input.community_id ?? null,
            type: input.type ?? "community_discussion",
            status,
            score: input.score ?? 0,
            urgency: input.urgency ?? null,
            intent: input.intent ?? null,
            risk_level: input.risk_level ?? null,
            title: input.title,
            reason: input.reason ?? null,
            recommended_action: input.recommended_action ?? null,
            suggested_cta: input.suggested_cta ?? null,
            ai_summary: input.ai_summary ?? null,
            ai_recommendation: input.ai_recommendation ?? null,
            raw_json: input.raw_json ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

    if (error) {
        console.error("Error updating opportunity from analysis:", error);
        return null;
    }

    return data;
}

export async function upsertOpportunityFromAnalysis(
    input: CreateOpportunityInput,
): Promise<Opportunity | null> {
    if (!input.discussion_id) {
        return createOpportunity(input);
    }

    const existingRows = await getOpportunitiesByDiscussionId(
        input.discussion_id,
        input.organization_id,
    );
    const existing = selectCanonicalOpportunity(existingRows);

    if (existing) {
        return updateOpportunityFromAnalysis(
            existing.id,
            input.organization_id,
            input,
            existing.status,
        );
    }

    return createOpportunity(input);
}

export async function updateOpportunityStatus(
    id: string,
    organizationId: string,
    statusKey: OpportunityStatusKey,
): Promise<Opportunity> {
    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .update({
            status: toOpportunityStatusStorage(statusKey),
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select("*")
        .maybeSingle();

    if (error) {
        throw new OpportunityUpdateError(error.message);
    }

    if (!data) {
        throw new OpportunityNotFoundError(id);
    }

    return data;
}

export function parseOpportunityStatusKey(
    value: unknown,
): OpportunityStatusKey | null {
    if (typeof value !== "string" || !isValidOpportunityStatusKey(value)) {
        return null;
    }

    return value;
}
