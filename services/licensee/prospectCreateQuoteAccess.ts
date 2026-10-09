/**
 * Server adapter for Prospect Create Quote visibility.
 *
 * The Prospect page runs in the handed-off sub-account session. A Master
 * cannot open it directly. Visibility uses the signed origin cookie plus a
 * live sub-account relationship and an active Master account. Ordinary
 * sub-account sessions have no origin cookie and see nothing.
 *
 * This does not switch sessions and does not authorize /licensee/estimate.
 * The Estimate page checks the restored Master session on its own.
 */

import { cookies } from "next/headers";
import {
  confirmProspectCreateQuoteAccess,
  evaluateProspectCreateQuoteOrigin,
  type ProspectCreateQuoteAccess,
  type ProspectCreateQuoteAccessDeps,
} from "@/lib/licensee/prospectCreateQuoteAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { LICENSEE_ORIGIN_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import {
  AccountAccessDeniedError,
  assertAccountAccessActive,
} from "@/services/superAdmin/accountAccessStatus";

async function defaultDeps(): Promise<ProspectCreateQuoteAccessDeps> {
  return {
    async getAccount(masterUserId) {
      const account = await getLicenseeAccountByUserId(masterUserId);
      if (!account) return null;
      return { id: account.id, defaultLanguage: account.default_language };
    },
    async isMasterActive(masterUserId) {
      try {
        await assertAccountAccessActive(masterUserId);
        return true;
      } catch (error) {
        if (error instanceof AccountAccessDeniedError) return false;
        throw error;
      }
    },
    async ownsSubAccount(licenseeAccountId, organizationId) {
      const { data, error } = await supabaseAdmin
        .from("licensee_sub_accounts")
        .select("id")
        .eq("licensee_account_id", licenseeAccountId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error || !data?.id) return false;
      return true;
    },
  };
}

export async function resolveProspectCreateQuoteAccess(input: {
  organizationId: string;
  prospectId: string;
  originCookieValue?: string | null;
  deps?: ProspectCreateQuoteAccessDeps;
}): Promise<ProspectCreateQuoteAccess | null> {
  let originCookieValue = input.originCookieValue;
  if (originCookieValue === undefined) {
    const store = await cookies();
    originCookieValue = store.get(LICENSEE_ORIGIN_COOKIE)?.value ?? null;
  }
  const origin = evaluateProspectCreateQuoteOrigin({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
    originCookieValue,
  });
  if (!origin) return null;
  try {
    return await confirmProspectCreateQuoteAccess(
      origin,
      input.deps ?? (await defaultDeps()),
    );
  } catch (error) {
    console.error("[PROSPECT_CREATE_QUOTE] access_check_failed", error);
    return null;
  }
}
