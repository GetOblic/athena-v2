import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Community = {
    id: string;
    created_at: string;
    updated_at: string;
    platform: string;
    group_name: string;
    group_url: string | null;
    niche: string | null;
    member_count: number | null;
    status: string;
    priority: number;
    owner: string | null;
    notes: string | null;
};

export async function getCommunityCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("communities")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error("Error fetching community count:", error);
        return 0;
    }

    return count ?? 0;
}

export async function getCommunities(): Promise<Community[]> {
    const { data, error } = await supabaseAdmin
        .from("communities")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching communities:", error);
        return [];
    }

    return data ?? [];
}

export async function getCommunityById(
    id: string,
): Promise<Community | null> {
    const { data, error } = await supabaseAdmin
        .from("communities")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        console.error("Error fetching community:", error);
        return null;
    }

    return data;
}

export type CreateCommunityInput = {
    group_name: string;
    notes?: string | null;
    niche?: string | null;
    status?: string;
    platform?: string;
    priority?: number;
};

export async function createCommunity(
    input: CreateCommunityInput,
): Promise<Community | null> {
    const { data, error } = await supabaseAdmin
        .from("communities")
        .insert({
            platform: input.platform ?? "intelligence_domain",
            group_name: input.group_name.trim(),
            notes: input.notes?.trim() || null,
            niche: input.niche?.trim() || null,
            status: input.status ?? "active",
            priority: input.priority ?? 1,
            group_url: null,
            member_count: null,
            owner: null,
        })
        .select("*")
        .single();

    if (error) {
        console.error("Error creating community:", error);
        return null;
    }

    return data;
}