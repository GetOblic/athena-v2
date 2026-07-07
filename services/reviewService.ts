import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AthenaReview = {
  id: string;
  created_at: string;
  updated_at: string;
  organization_id?: string | null;

  discussion_id: string | null;
  user_id?: string | null;
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

export type BriefingStatusUpdate = {
  id: string;
  status: string;
};

export class ReviewNotFoundError extends Error {
  constructor(reviewId: string) {
    super(`Review not found: ${reviewId}`);
    this.name = "ReviewNotFoundError";
  }
}

export class ReviewUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewUpdateError";
  }
}

export type CreateAthenaReviewInput = {
  organization_id: string;
  discussion_id?: string | null;
  user_id?: string | null;
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

function assertUpdatedReview(
  data: AthenaReview | null,
  reviewId: string,
): AthenaReview {
  if (!data) {
    throw new ReviewNotFoundError(reviewId);
  }

  return data;
}

export async function getReviewCount(
  organizationId: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) {
    console.error(error);
    return 0;
  }

  return count ?? 0;
}

export async function getReviews(
  organizationId: string,
): Promise<AthenaReview[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

export async function getReviewById(
  id: string,
  organizationId: string,
): Promise<AthenaReview | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
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

export async function getReviewsByOpportunityId(
  opportunityId: string,
  organizationId: string,
): Promise<AthenaReview[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

export async function getLatestReviewByOpportunityId(
  opportunityId: string,
  organizationId: string,
): Promise<AthenaReview | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .eq("organization_id", organizationId)
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
      organization_id: input.organization_id,
      discussion_id: input.discussion_id ?? null,
      user_id: input.user_id ?? null,
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

export async function approveReview(
  reviewId: string,
  organizationId: string,
): Promise<AthenaReview> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ReviewUpdateError(error.message);
  }

  return assertUpdatedReview(data, reviewId);
}

export async function requestBriefingRevision(
  reviewId: string,
  organizationId: string,
): Promise<AthenaReview> {
  const { data, error } = await supabaseAdmin
    .from("athena_reviews")
    .update({
      status: "needs_revision",
      approved_at: null,
    })
    .eq("id", reviewId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new ReviewUpdateError(error.message);
  }

  return assertUpdatedReview(data, reviewId);
}

/** @deprecated Use requestBriefingRevision */
export async function rejectReview(
  reviewId: string,
  organizationId: string,
): Promise<AthenaReview> {
  return requestBriefingRevision(reviewId, organizationId);
}

export function toBriefingStatusUpdate(
  review: AthenaReview,
): BriefingStatusUpdate {
  return {
    id: review.id,
    status: review.status,
  };
}
