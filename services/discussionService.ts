import { getOriginalDiscussionBody } from "@/lib/discussionContent";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createDiscussionUpdate } from "@/services/discussionUpdateService";

export type Discussion = {
    id: string;
    created_at: string;
    updated_at: string;
    organization_id?: string | null;
    community_id: string | null;
    user_id?: string | null;
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

export async function getDiscussionCount(
    organizationId: string,
): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("discussions")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);

    if (error) {
        console.error("Error fetching discussion count:", error);
        return 0;
    }

    return count ?? 0;
}

export async function getHighPriorityDiscussions(
    organizationId: string,
    limit = 5,
): Promise<Discussion[]> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .eq("organization_id", organizationId)
        .in("status", ["New", "Needs Review", "Reviewing"])
        .order("opportunity_score", { ascending: false })
        .order("priority", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching high-priority discussions:", error);
        return [];
    }

    return data ?? [];
}

export async function getDiscussions(
    organizationId: string,
): Promise<Discussion[]> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching discussions:", error);
        return [];
    }

    return data ?? [];
}

export async function getDiscussionById(
    id: string,
    organizationId: string,
): Promise<Discussion | null> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (error) {
        console.error("Error fetching discussion:", error);
        return null;
    }

    return data;
}

export async function getDiscussionIdsByCommunityId(
    communityId: string,
    organizationId: string,
): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("id")
        .eq("community_id", communityId)
        .eq("organization_id", organizationId);

    if (error) {
        console.error("Error fetching community discussion ids:", error);
        return [];
    }

    return (data ?? []).map((row) => row.id);
}

export async function getDiscussionsByCommunityId(
    communityId: string,
    organizationId: string,
): Promise<Discussion[]> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .select("*")
        .eq("community_id", communityId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching community discussions:", error);
        return [];
    }

    return data ?? [];
}

export type CreateDiscussionInput = {
    organization_id: string;
    community_id?: string | null;
    user_id?: string | null;
    platform: string;
    title: string;
    author?: string | null;
    url?: string | null;
    body?: string | null;
    status?: string;
    priority?: number;
    opportunity_score?: number;
    sentiment?: string | null;
    summary?: string | null;
    ai_notes?: string | null;
    last_activity?: string | null;
    raw_json?: Record<string, unknown> | null;
};

export async function createDiscussion(
    input: CreateDiscussionInput,
): Promise<Discussion | null> {
    const { data, error } = await supabaseAdmin
        .from("discussions")
        .insert({
            organization_id: input.organization_id,
            community_id: input.community_id ?? null,
            user_id: input.user_id ?? null,
            platform: input.platform,
            title: input.title,
            author: input.author ?? null,
            url: input.url ?? null,
            body: input.body ?? null,
            status: input.status ?? "New",
            priority: input.priority ?? 1,
            opportunity_score: input.opportunity_score ?? 0,
            sentiment: input.sentiment ?? null,
            summary: input.summary ?? null,
            ai_notes: input.ai_notes ?? null,
            last_activity: input.last_activity ?? new Date().toISOString(),
            raw_json: input.raw_json ?? null,
        })
        .select("*")
        .single();

    if (error) {
        console.error("Error creating discussion:", error);
        return null;
    }

    return data;
}

export type UpdateDiscussionInput = {
    platform?: string;
    community_id?: string | null;
    title?: string;
    author?: string | null;
    url?: string | null;
    body?: string | null;
    status?: string;
};

export async function updateDiscussion(
    id: string,
    organizationId: string,
    input: UpdateDiscussionInput,
): Promise<Discussion | null> {
    const existing = await getDiscussionById(id, organizationId);

    if (!existing) {
        return null;
    }

    const rawJson = existing.raw_json ?? {};
    const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };

    if (input.platform !== undefined) updatePayload.platform = input.platform;
    if (input.community_id !== undefined) {
        updatePayload.community_id = input.community_id;
    }
    if (input.title !== undefined) updatePayload.title = input.title;
    if (input.author !== undefined) updatePayload.author = input.author;
    if (input.url !== undefined) updatePayload.url = input.url;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.body !== undefined) {
        updatePayload.body = input.body;
        updatePayload.raw_json = {
            ...rawJson,
            original_body: input.body,
        };
    }

    const { data, error } = await supabaseAdmin
        .from("discussions")
        .update(updatePayload)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

    if (error) {
        console.error("Error updating discussion:", error);
        return null;
    }

    if (
        input.community_id !== undefined &&
        input.community_id !== existing.community_id
    ) {
        await supabaseAdmin
            .from("athena_discussion_analysis")
            .update({ community_id: input.community_id })
            .eq("discussion_id", id)
            .eq("organization_id", organizationId);

        await supabaseAdmin
            .from("opportunities")
            .update({ community_id: input.community_id })
            .eq("discussion_id", id)
            .eq("organization_id", organizationId);
    }

    return data;
}

async function deleteRelatedDiscussionRecords(
    discussionId: string,
    organizationId: string,
) {
    const { data: opportunities } = await supabaseAdmin
        .from("opportunities")
        .select("id")
        .eq("discussion_id", discussionId)
        .eq("organization_id", organizationId);

    const opportunityIds = (opportunities ?? []).map((row) => row.id);

    if (opportunityIds.length > 0) {
        await supabaseAdmin
            .from("athena_reviews")
            .delete()
            .in("opportunity_id", opportunityIds)
            .eq("organization_id", organizationId);
    }

    await supabaseAdmin
        .from("athena_reviews")
        .delete()
        .eq("discussion_id", discussionId)
        .eq("organization_id", organizationId);

    await supabaseAdmin
        .from("opportunities")
        .delete()
        .eq("discussion_id", discussionId)
        .eq("organization_id", organizationId);

    await supabaseAdmin
        .from("athena_discussion_analysis")
        .delete()
        .eq("discussion_id", discussionId)
        .eq("organization_id", organizationId);

    await supabaseAdmin
        .from("athena_discussion_updates")
        .delete()
        .eq("discussion_id", discussionId)
        .eq("organization_id", organizationId);

    await supabaseAdmin
        .from("athena_asset_blueprints")
        .delete()
        .eq("discussion_id", discussionId)
        .eq("organization_id", organizationId);
}

export async function deleteDiscussion(
    id: string,
    organizationId: string,
): Promise<boolean> {
    const existing = await getDiscussionById(id, organizationId);

    if (!existing) {
        return false;
    }

    await deleteRelatedDiscussionRecords(id, organizationId);

    const { error } = await supabaseAdmin
        .from("discussions")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId);

    if (error) {
        console.error("Error deleting discussion:", error);
        return false;
    }

    return true;
}

export type AppendDiscussionUpdateInput = {
    discussionId: string;
    organizationId: string;
    updateBody: string;
    updateAuthor?: string | null;
    updateUrl?: string | null;
    capturedAt?: string | null;
};

export async function appendDiscussionUpdate(
    input: AppendDiscussionUpdateInput,
): Promise<Discussion | null> {
    const existing = await getDiscussionById(
        input.discussionId,
        input.organizationId,
    );

    if (!existing) {
        return null;
    }

    const capturedAt = input.capturedAt ?? new Date().toISOString();
    const author = input.updateAuthor?.trim() || existing.author?.trim() || "Unknown";
    const updateBody = input.updateBody.trim();

    if (!updateBody) {
        throw new Error("Discussion update body is required.");
    }

    const rawJson = existing.raw_json ?? {};
    const originalBody =
        typeof rawJson.original_body === "string"
            ? rawJson.original_body
            : getOriginalDiscussionBody(existing);

    const savedUpdate = await createDiscussionUpdate({
        discussionId: input.discussionId,
        organizationId: input.organizationId,
        author,
        url: input.updateUrl ?? null,
        body: updateBody,
        capturedAt,
    });

    if (!savedUpdate) {
        return null;
    }

    const existingUpdates = Array.isArray(rawJson.thread_updates)
        ? rawJson.thread_updates
        : [];

    const { data, error } = await supabaseAdmin
        .from("discussions")
        .update({
            status: "Reviewing",
            last_activity: capturedAt,
            raw_json: {
                ...rawJson,
                original_body: originalBody,
                thread_updates: [
                    ...existingUpdates,
                    {
                        author,
                        url: input.updateUrl ?? null,
                        body: updateBody,
                        captured_at: capturedAt,
                    },
                ],
            },
        })
        .eq("id", input.discussionId)
        .eq("organization_id", input.organizationId)
        .select("*")
        .single();

    if (error) {
        console.error("Error appending discussion update:", error);
        return null;
    }

    return data;
}
