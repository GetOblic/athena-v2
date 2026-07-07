import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type DiscussionUpdate = {
  id: string;
  discussion_id: string;
  author: string | null;
  url: string | null;
  body: string;
  created_at: string;
};

export type CreateDiscussionUpdateInput = {
  discussionId: string;
  author?: string | null;
  url?: string | null;
  body: string;
  capturedAt?: string | null;
};

export async function getDiscussionUpdatesByDiscussionId(
  discussionId: string,
): Promise<DiscussionUpdate[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_updates")
    .select("*")
    .eq("discussion_id", discussionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching discussion updates:", error);
    return [];
  }

  return data ?? [];
}

export async function createDiscussionUpdate(
  input: CreateDiscussionUpdateInput,
): Promise<DiscussionUpdate | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_updates")
    .insert({
      discussion_id: input.discussionId,
      author: input.author?.trim() || null,
      url: input.url?.trim() || null,
      body: input.body.trim(),
      created_at: input.capturedAt ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating discussion update:", error);
    return null;
  }

  return data;
}
