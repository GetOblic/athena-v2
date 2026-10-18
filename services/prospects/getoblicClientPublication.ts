/**
 * Client send of the shared saved Description or Knowledge Base.
 *
 * The session client organization is the only caller identity. Exactly one
 * active conversion supplies the source Prospect and source organization.
 * The browser cannot choose a Prospect, organization, listing, or body.
 *
 * Active conversion is resolved again immediately before the outbound
 * service rechecks source authorization and calls WordPress. A reversal
 * that commits during the remote PUT can still reach WordPress.
 */

import type { ClientProspectIntelligenceDenial } from "@/services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import { resolveClientProspectIntelligenceAuthority } from "@/services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import {
  syncGetOblicListingDescription,
  toPublicGetOblicDescriptionSync,
  type DescriptionSyncResult,
  type DescriptionWordpressPort,
} from "@/services/getoblicDirectory/getoblicDirectoryDescriptionService";
import {
  syncGetOblicListingKnowledgeBase,
  toPublicGetOblicKnowledgeBaseSync,
  type KnowledgeBaseSyncResult,
  type KnowledgeBaseWordpressPort,
} from "@/services/getoblicDirectory/getoblicDirectoryKnowledgeBaseService";
import type { ActiveLicenseeProspectClientConversionRef } from "@/services/licensee/licenseeProspectClientConversionReads";

export class GetoblicClientPublicationDenied extends Error {
  readonly reason: ClientProspectIntelligenceDenial;

  constructor(reason: ClientProspectIntelligenceDenial) {
    super(reason);
    this.name = "GetoblicClientPublicationDenied";
    this.reason = reason;
  }
}

export type GetoblicClientPublicationSuccess<T> = {
  ok: true;
  result: T;
};

export type GetoblicClientPublicationFailure = {
  ok: false;
  reason: ClientProspectIntelligenceDenial;
};

type ResolveAuthority = typeof resolveClientProspectIntelligenceAuthority;

const DENIAL_HTTP: Record<
  ClientProspectIntelligenceDenial,
  { status: number; code: string; message: string }
> = {
  missing_client_organization: {
    status: 401,
    code: "UNAUTHORIZED",
    message: "Authentication required.",
  },
  no_active_conversion: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  ambiguous_conversion: {
    status: 409,
    code: "AMBIGUOUS_CONVERSION",
    message: "GetOblic content is not available for this account.",
  },
  incomplete_conversion: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  client_mismatch: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  source_mismatch: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  lookup_failed: {
    status: 503,
    code: "UNAVAILABLE",
    message: "Saved content is temporarily unavailable.",
  },
};

export function getoblicClientPublicationDeniedHttp(
  reason: ClientProspectIntelligenceDenial,
): {
  status: number;
  body: { ok: false; success: false; error: { code: string; message: string } };
} {
  const mapped = DENIAL_HTTP[reason];
  return {
    status: mapped.status,
    body: {
      ok: false,
      success: false,
      error: { code: mapped.code, message: mapped.message },
    },
  };
}

function sameActiveConversion(
  left: ActiveLicenseeProspectClientConversionRef,
  right: ActiveLicenseeProspectClientConversionRef,
): boolean {
  return (
    left.prospectId === right.prospectId &&
    left.sourceOrganizationId === right.sourceOrganizationId &&
    left.clientOrganizationId === right.clientOrganizationId &&
    left.licenseeAccountId === right.licenseeAccountId &&
    left.status === "active" &&
    right.status === "active"
  );
}

async function recheckActiveConversion(input: {
  clientOrganizationId: string;
  expected: ActiveLicenseeProspectClientConversionRef;
  resolveAuthority: ResolveAuthority;
}): Promise<void> {
  const again = await input.resolveAuthority(input.clientOrganizationId);
  if (!again.ok) {
    throw new GetoblicClientPublicationDenied(again.reason);
  }
  if (!sameActiveConversion(again.conversion, input.expected)) {
    throw new GetoblicClientPublicationDenied("source_mismatch");
  }
}

async function requireActiveConversion(input: {
  clientOrganizationId: string;
  resolveAuthority?: ResolveAuthority;
}): Promise<
  | {
      ok: true;
      conversion: ActiveLicenseeProspectClientConversionRef;
      resolveAuthority: ResolveAuthority;
    }
  | GetoblicClientPublicationFailure
> {
  const resolveAuthority =
    input.resolveAuthority ?? resolveClientProspectIntelligenceAuthority;
  const authority = await resolveAuthority(input.clientOrganizationId);
  if (!authority.ok) return authority;
  return {
    ok: true,
    conversion: authority.conversion,
    resolveAuthority,
  };
}

export async function publishClientGetOblicDescription(input: {
  clientOrganizationId: string;
  resolveAuthority?: ResolveAuthority;
  wordpress?: DescriptionWordpressPort;
}): Promise<
  | GetoblicClientPublicationSuccess<DescriptionSyncResult>
  | GetoblicClientPublicationFailure
> {
  const authority = await requireActiveConversion(input);
  if (!authority.ok) return authority;
  try {
    const result = await syncGetOblicListingDescription(
      {
        organizationId: authority.conversion.sourceOrganizationId,
        prospectId: authority.conversion.prospectId,
        beforeOutbound: () =>
          recheckActiveConversion({
            clientOrganizationId: input.clientOrganizationId,
            expected: authority.conversion,
            resolveAuthority: authority.resolveAuthority,
          }),
      },
      input.wordpress,
    );
    return { ok: true, result };
  } catch (error) {
    if (error instanceof GetoblicClientPublicationDenied) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }
}

export async function publishClientGetOblicKnowledgeBase(input: {
  clientOrganizationId: string;
  resolveAuthority?: ResolveAuthority;
  wordpress?: KnowledgeBaseWordpressPort;
  now?: Date;
}): Promise<
  | GetoblicClientPublicationSuccess<KnowledgeBaseSyncResult>
  | GetoblicClientPublicationFailure
> {
  const authority = await requireActiveConversion(input);
  if (!authority.ok) return authority;
  try {
    const result = await syncGetOblicListingKnowledgeBase(
      {
        organizationId: authority.conversion.sourceOrganizationId,
        prospectId: authority.conversion.prospectId,
        now: input.now,
        beforeOutbound: () =>
          recheckActiveConversion({
            clientOrganizationId: input.clientOrganizationId,
            expected: authority.conversion,
            resolveAuthority: authority.resolveAuthority,
          }),
      },
      input.wordpress,
    );
    return { ok: true, result };
  } catch (error) {
    if (error instanceof GetoblicClientPublicationDenied) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }
}

export function publicClientDescriptionPublication(result: DescriptionSyncResult) {
  return toPublicGetOblicDescriptionSync(result);
}

export function publicClientKnowledgeBasePublication(result: KnowledgeBaseSyncResult) {
  return toPublicGetOblicKnowledgeBaseSync(result);
}
