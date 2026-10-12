import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { CommunityDiscoveryDb } from "@/services/communityDiscovery/communityDiscoveryPersistence";

export function communityDiscoveryDb(): CommunityDiscoveryDb {
  return supabaseAdmin as unknown as CommunityDiscoveryDb;
}
