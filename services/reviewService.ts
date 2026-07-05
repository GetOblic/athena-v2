import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AthenaReview = {
  id: string;
  created_at: string;
  updated_at: string;

  discussion_id: string | null;
  opportunity_id: string | null;

  status: string;

  summary: string | null;
  pain_points: string | null;
  buyer_stage: string | null;
  recommended_response: string | null;
  cta: string | null;

  confidence: number;

  raw_json: Record<string, unknown> | null;

  model: string | null;
  prompt_version: string | null;
  generation_time_ms: number | null;
  version: number | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
};

export type CreateAthenaReviewInput = {
  discussion_id?: string | null;
  opportunity_id?: string | null;
  status?: string;

  summary?: string | null;
  pain_points?: string | null;
  buyer_stage?: string | null;
  recommended_response?: string | null;
  cta?: string | null;

  confidence?: number;

  raw_json?: Record<string, unknown> | null;

  model?: string | null;
  prompt_version?: string | null;
  generation_time_ms?: number | null;
  version?: number | null;
  notes?: string | null;
};

export async function getReviewCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(error);
    return 0;
  }

  return count ?? 0;
}

export async function getReviews(): Promise<AthenaReview[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

export async function getReviewById(
  id: string,
): Promise<AthenaReview | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

export async function getReviewsByOpportunityId(
  opportunityId: string,
): Promise<AthenaReview[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

export async function getLatestReviewByOpportunityId(
  opportunityId: string,
): Promise<AthenaReview | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

export async function createReview(
  input: CreateAthenaReviewInput,
): Promise<AthenaReview | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .insert({
      discussion_id: input.discussion_id ?? null,
      opportunity_id: input.opportunity_id ?? null,
      status: input.status ?? "draft",

      summary: input.summary ?? null,
      pain_points: input.pain_points ?? null,
      buyer_stage: input.buyer_stage ?? null,
      recommended_response: input.recommended_response ?? null,
      cta: input.cta ?? null,

      confidence: input.confidence ?? 0,

      raw_json: input.raw_json ?? null,

      model: input.model ?? null,
      prompt_version: input.prompt_version ?? "opportunity_review_v1",
      generation_time_ms: input.generation_time_ms ?? null,
      version: input.version ?? 1,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

export async function approveReview(id: string): Promise<AthenaReview | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

export async function rejectReview(id: string): Promise<AthenaReview | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .update({
      status: "rejected",
      approved_at: null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}
