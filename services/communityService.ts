import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectBridgeMarker";

export type Community = {
    id: string;
    created_at: string;
    updated_at: string;
    organization_id?: string | null;
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

export async function getCommunityCount(
    organizationId: string,
): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("communities")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);

    if (error) {
        console.error("Error fetching community count:", error);
        return 0;
    }

    return count ?? 0;
}

export async function getCommunities(
    organizationId: string,
): Promise<Community[]> {
    const { data, error } = await supabaseAdmin
        .from("communities")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching communities:", error);
        return [];
    }

    return data ?? [];
}

export async function getCommunityById(
    id: string,
    organizationId: string,
): Promise<Community | null> {
    const { data, error } = await supabaseAdmin
        .from("communities")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (error) {
        console.error("Error fetching community:", error);
        return null;
    }

    return data;
}

export type CreateCommunityInput = {
    organization_id: string;
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
            organization_id: input.organization_id,
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

export type UpdateCommunityInput = {
    group_name?: string;
    notes?: string | null;
    niche?: string | null;
    status?: string;
    priority?: number;
};

export async function updateCommunity(
    id: string,
    organizationId: string,
    input: UpdateCommunityInput,
): Promise<Community | null> {
    const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };

    if (input.group_name !== undefined) {
        updatePayload.group_name = input.group_name.trim();
    }
    if (input.notes !== undefined) {
        updatePayload.notes = input.notes?.trim() || null;
    }
    if (input.niche !== undefined) {
        updatePayload.niche = input.niche?.trim() || null;
    }
    if (input.status !== undefined) {
        updatePayload.status = input.status;
    }
    if (input.priority !== undefined) {
        updatePayload.priority = input.priority;
    }

    const { data, error } = await supabaseAdmin
        .from("communities")
        .update(updatePayload)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

    if (error) {
        console.error("Error updating community:", error);
        return null;
    }

    return data;
}

export async function getCommunityDiscussionCount(
    communityId: string,
    organizationId: string,
): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("discussions")
        .select("*", { count: "exact", head: true })
        .eq("community_id", communityId)
        .eq("organization_id", organizationId)
        .neq("platform", PROSPECT_INTELLIGENCE_PLATFORM);

    if (error) {
        console.error("Error counting community discussions:", error);
        return 0;
    }

    return count ?? 0;
}

export async function deleteCommunity(
    id: string,
    organizationId: string,
): Promise<{ success: boolean; softDeleted: boolean }> {
    const discussionCount = await getCommunityDiscussionCount(
        id,
        organizationId,
    );

    if (discussionCount > 0) {
        const updated = await updateCommunity(id, organizationId, {
            status: "inactive",
        });

        return {
            success: Boolean(updated),
            softDeleted: true,
        };
    }

    const { error } = await supabaseAdmin
        .from("communities")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId);

    if (error) {
        console.error("Error deleting community:", error);
        return { success: false, softDeleted: false };
    }

    return { success: true, softDeleted: false };
}
