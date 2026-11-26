/**
 * Actual PostgREST path for the category publication RPC.
 * This file is not part of the unit-test run and is not a production runtime file.
 * It refuses the production Supabase project and any hosted Supabase URL.
 */
import { createClient } from "@supabase/supabase-js";

import { MonitorOperationError } from "../../../services/monitor/monitorErrors";
import { createSupabaseMonitorStore } from "../../../services/monitor/monitorSupabaseStore";

const url = process.env.MONITOR_INTEGRATION_POSTGREST_URL ?? "";
const key = process.env.MONITOR_INTEGRATION_SERVICE_JWT ?? "";
const sourceId = process.env.MONITOR_INTEGRATION_SOURCE_ID ?? "";

function refuse(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!url || !key || !sourceId) {
  console.error("PostgREST integration requires MONITOR_INTEGRATION_POSTGREST_URL, MONITOR_INTEGRATION_SERVICE_JWT, and MONITOR_INTEGRATION_SOURCE_ID.");
  process.exit(2);
}
if (
  url.includes("xoueryfirdttowgglwtk") ||
  url.includes("supabase.co") ||
  url.includes("getoblic.com") ||
  url.includes("athena-v2")
) {
  refuse("Refusing to run the PostgREST integration against production.");
}

async function main(): Promise<void> {
const stamp = "2026-11-26T09:00:00.000Z";
const client = createClient(url, key, { auth: { persistSession: false } });
const store = await createSupabaseMonitorStore(client as never);
const published = await store.refreshSharedCategories({
  sourceId,
  discoveredAt: stamp,
  authoritativeTaxonomy: false,
  categories: [
    {
      categoryKey: "fr/pantalons-c-42.htm",
      displayName: "Pantalons",
      canonicalUrl: "https://toscane-boutique.fr/fr/pantalons-c-42.htm",
      parentCategoryKey: null,
      discoveredAt: stamp,
      discoveryStatus: "current",
      productFamilyCount: null,
      productFamilyCountBasis: null,
    },
  ],
});
if (published.outcome !== "published" && published.outcome !== "already_published") {
  refuse(`Unexpected publication outcome ${published.outcome}.`);
}
const category = published.categories.find((item) => item.categoryKey === "fr/pantalons-c-42.htm");
if (!category?.id) refuse("The RPC response did not map a category record.");

const same = await store.refreshSharedCategories({
  sourceId,
  discoveredAt: stamp,
  authoritativeTaxonomy: false,
  categories: [
    {
      categoryKey: "fr/pantalons-c-42.htm",
      displayName: "Different payload",
      canonicalUrl: "https://toscane-boutique.fr/fr/pantalons-c-42.htm",
      parentCategoryKey: null,
      discoveredAt: stamp,
      discoveryStatus: "current",
      productFamilyCount: null,
      productFamilyCountBasis: null,
    },
  ],
});
if (same.outcome !== "already_published" || same.categories.find((item) => item.categoryKey === "fr/pantalons-c-42.htm")?.displayName === "Different payload") {
  refuse("An equal-timestamp HTTP publication overwrote the stored category.");
}

try {
  await store.refreshSharedCategories({
    sourceId,
    discoveredAt: "2026-11-26T10:00:00.000Z",
    authoritativeTaxonomy: false,
    categories: [
      {
        categoryKey: "fr/pantalons-c-42.htm",
        displayName: "Pantalons",
        canonicalUrl: "https://toscane-boutique.fr/fr/pantalons-c-42.htm",
        parentCategoryKey: null,
        discoveredAt: "2026-11-26T10:00:00.000Z",
        discoveryStatus: "current",
        productFamilyCount: null,
        productFamilyCountBasis: null,
      },
      {
        categoryKey: "fr/robes-c-18.htm",
        displayName: "Robes",
        canonicalUrl: "https://toscane-boutique.fr/fr/pantalons-c-42.htm",
        parentCategoryKey: null,
        discoveredAt: "2026-11-26T10:00:00.000Z",
        discoveryStatus: "current",
        productFamilyCount: null,
        productFamilyCountBasis: null,
      },
    ],
  });
  refuse("A duplicate canonical URL was accepted.");
} catch (error) {
  if (!(error instanceof MonitorOperationError) || error.code === "CROSS_ORGANIZATION" || error.message !== "The request could not be saved.") {
    refuse("The HTTP constraint error was not classified as an ordinary persistence failure.");
  }
}

console.log("PostgREST category publication contract passed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "PostgREST integration failed.");
  process.exit(1);
});
