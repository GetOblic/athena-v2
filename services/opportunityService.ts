import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Opportunity = {
    id: string;
    created_at: string;
    updated_at: string;

    discussion_id: string | null;
    community_id: string | null;

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

export async function getOpportunityCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("opportunities")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error(error);
        return 0;
    }

    return count ?? 0;
}

export async function getOpportunities(): Promise<Opportunity[]> {
    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .select("*")
        .order("score", { ascending: false });

    if (error) {
        console.error(error);
        return [];
    }

    return data ?? [];
}

export async function getOpportunityById(
    id: string,
): Promise<Opportunity | null> {
    const { data, error } = await supabaseAdmin
        .from("opportunities")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        console.error(error);
        return null;
    }

    return data;
}