/**
 * Remove duplicate opportunities and briefings created by repeated intelligence refreshes.
 *
 * Run (dry-run):
 *   npx tsx scripts/deduplicate-opportunities-briefings.ts
 *
 * Execute deletions:
 *   npx tsx scripts/deduplicate-opportunities-briefings.ts --execute
 *
 * Scope to one organization:
 *   npx tsx scripts/deduplicate-opportunities-briefings.ts --org=<organization_id>
 */

import { createClient } from "@supabase/supabase-js";
import {
  dedupeBriefingsByOpportunity,
  dedupeOpportunitiesByDiscussion,
  selectCanonicalBriefing,
  selectCanonicalOpportunity,
} from "../lib/canonicalRecords";

type OpportunityRow = {
  id: string;
  organization_id: string;
  discussion_id: string | null;
  status: string;
  score: number;
  created_at: string;
  updated_at: string;
};

type ReviewRow = {
  id: string;
  organization_id: string;
  opportunity_id: string | null;
  discussion_id: string | null;
  status: string;
  confidence: number;
  created_at: string;
  updated_at: string;
};

const execute = process.argv.includes("--execute");
const orgArg = process.argv.find((arg) => arg.startsWith("--org="));
const organizationFilter = orgArg?.slice("--org=".length) ?? null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function groupBy<T>(
  items: T[],
  getKey: (item: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  return grouped;
}

async function loadOpportunities() {
  let query = supabase
    .from("opportunities")
    .select(
      "id, organization_id, discussion_id, status, score, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (organizationFilter) {
    query = query.eq("organization_id", organizationFilter);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load opportunities: ${error.message}`);
  }

  return (data ?? []) as OpportunityRow[];
}

async function loadReviews() {
  let query = supabase
    .from("athena_reviews")
    .select(
      "id, organization_id, opportunity_id, discussion_id, status, confidence, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (organizationFilter) {
    query = query.eq("organization_id", organizationFilter);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load briefings: ${error.message}`);
  }

  return (data ?? []) as ReviewRow[];
}

function findDuplicateOpportunityIds(opportunities: OpportunityRow[]) {
  const duplicateIds: string[] = [];
  const byOrgDiscussion = groupBy(
    opportunities.filter((row) => row.discussion_id),
    (row) => `${row.organization_id}:${row.discussion_id}`,
  );

  for (const group of byOrgDiscussion.values()) {
    if (group.length <= 1) {
      continue;
    }

    const canonical = selectCanonicalOpportunity(group);
    if (!canonical) {
      continue;
    }

    for (const row of group) {
      if (row.id !== canonical.id) {
        duplicateIds.push(row.id);
      }
    }
  }

  return duplicateIds;
}

function findDuplicateReviewIds(reviews: ReviewRow[]) {
  const duplicateIds: string[] = [];
  const byOrgKey = groupBy(reviews, (row) => {
    const entityKey =
      row.opportunity_id ??
      (row.discussion_id ? `discussion:${row.discussion_id}` : row.id);
    return `${row.organization_id}:${entityKey}`;
  });

  for (const group of byOrgKey.values()) {
    if (group.length <= 1) {
      continue;
    }

    const canonical = selectCanonicalBriefing(group);
    if (!canonical) {
      continue;
    }

    for (const row of group) {
      if (row.id !== canonical.id) {
        duplicateIds.push(row.id);
      }
    }
  }

  return duplicateIds;
}

async function deleteByIds(table: "opportunities" | "athena_reviews", ids: string[]) {
  if (ids.length === 0) {
    return 0;
  }

  const chunkSize = 100;
  let deleted = 0;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).delete().in("id", chunk);

    if (error) {
      throw new Error(`Failed deleting from ${table}: ${error.message}`);
    }

    deleted += chunk.length;
  }

  return deleted;
}

async function main() {
  const [opportunities, reviews] = await Promise.all([
    loadOpportunities(),
    loadReviews(),
  ]);

  const canonicalOpportunityCount = dedupeOpportunitiesByDiscussion(
    opportunities,
  ).length;
  const canonicalReviewCount = dedupeBriefingsByOpportunity(reviews).length;

  const duplicateOpportunityIds = findDuplicateOpportunityIds(opportunities);
  const duplicateReviewIds = findDuplicateReviewIds(reviews);

  console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
  if (organizationFilter) {
    console.log(`Organization filter: ${organizationFilter}`);
  }

  console.log(`Opportunities loaded: ${opportunities.length}`);
  console.log(`Canonical opportunities: ${canonicalOpportunityCount}`);
  console.log(`Duplicate opportunities to remove: ${duplicateOpportunityIds.length}`);

  console.log(`Briefings loaded: ${reviews.length}`);
  console.log(`Canonical briefings: ${canonicalReviewCount}`);
  console.log(`Duplicate briefings to remove: ${duplicateReviewIds.length}`);

  if (!execute) {
    console.log("\nNo rows deleted. Re-run with --execute to apply cleanup.");
    return;
  }

  const deletedOpportunities = await deleteByIds(
    "opportunities",
    duplicateOpportunityIds,
  );
  const deletedReviews = await deleteByIds("athena_reviews", duplicateReviewIds);

  console.log(`\nDeleted ${deletedOpportunities} duplicate opportunities.`);
  console.log(`Deleted ${deletedReviews} duplicate briefings.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
