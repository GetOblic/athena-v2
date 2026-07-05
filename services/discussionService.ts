import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Discussion = {
    id: string;
    created_at: string;
    updated_at: string;
    community_id: string | null;
    platform: string;
    title: string;
    author: string | null;
    url: string | null;
    body: string | null;
    status: string;
    priority: number;
    opportunity_score: number;
    sentiment: string | null;
    summary: string | null;
    ai_notes: string | null;
    last_activity: string | null;
    raw_json: Record<string, unknown> | null;
};

export async function getDiscussionCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("discussions")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error("Error fetching discussion count:", error);
        return 0;
    }

    return count ?? 0;
}

export async function getHighPriorityDiscussions(
    limit = 5,
): Promise<Discussion[]> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .in("status", ["New", "Needs Review"])
        .order("opportunity_score", { ascending: false })
        .order("priority", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching high-priority discussions:", error);
        return [];
    }

    return data ?? [];
}

export async function getDiscussions(): Promise<Discussion[]> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching discussions:", error);
        return [];
    }

    return data ?? [];
}

export async function getDiscussionById(
    id: string,
): Promise<Discussion | null> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        console.error("Error fetching discussion:", error);
        return null;
    }

    return data;
}

export async function getDiscussionsByCommunityId(
    communityId: string,
): Promise<Discussion[]> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .eq("community_id", communityId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching community discussions:", error);
        return [];
    }

    return data ?? [];
}