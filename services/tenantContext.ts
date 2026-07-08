/**
 * Central tenant context for Athena SaaS isolation.
 *
 * Resolve tenant context once per request, then pass organizationId into services
 * or use createTenantScope(organizationId) for automatic query scoping.
 */

export {
  type Organization,
  type OrganizationContext as TenantContext,
  OrganizationAccessError,
  OrganizationContextMissingError,
  belongsToOrganization,
  getCurrentUserId,
  getOrganizationMembership,
  provisionTenantForAuthenticatedUser,
  requireCurrentOrganizationContext as requireTenantContext,
  requireCurrentOrganizationId as requireTenantOrganizationId,
  resolveOrganizationIdForIngestion,
  resolveOrganizationIdForUser,
} from "@/services/organizationService";

export {
  TENANT_TABLES,
  assertTenantRecord,
  createTenantScope,
  type TenantScope,
  type TenantTable,
} from "@/lib/tenantDatabase";
