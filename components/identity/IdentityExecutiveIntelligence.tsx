import { IdentityWhatAthenaKnows } from "@/components/identity/IdentityWhatAthenaKnows";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { AthenaIdentity } from "@/services/identity/identityService";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type IdentityCopy = TenantMessages["identity"];

type IdentityExecutiveIntelligenceProps = {
  identity: AthenaIdentity | null;
  messages: IdentityCopy;
  language?: OrganizationLanguage;
};

/**
 * Presentation alias for What Athena knows.
 * Advanced diagnostics, calibration, and website evidence are composed separately.
 */
export function IdentityExecutiveIntelligence({
  identity,
  messages,
}: IdentityExecutiveIntelligenceProps) {
  return <IdentityWhatAthenaKnows identity={identity} messages={messages} />;
}
