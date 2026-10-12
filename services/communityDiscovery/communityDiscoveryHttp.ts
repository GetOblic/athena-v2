import { CommunityDiscoveryRequestError } from "@/services/communityDiscovery/communityDiscoveryErrors";
import { OrganizationAccessError } from "@/services/organizationService";

export async function readCommunityDiscoveryJson(
  request: Request,
): Promise<unknown> {
  try {
    const text = await request.text();
    if (!text.trim()) {
      throw new CommunityDiscoveryRequestError(
        "INVALID_JSON",
        "Request body must be JSON.",
        400,
      );
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof CommunityDiscoveryRequestError) throw error;
    throw new CommunityDiscoveryRequestError(
      "INVALID_JSON",
      "Request body must be JSON.",
      400,
    );
  }
}

export function communityDiscoveryAuthFailure(error: unknown): {
  status: number;
  code: string;
  message: string;
} | null {
  if (error instanceof OrganizationAccessError) {
    return {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Authentication required",
    };
  }
  if (
    error instanceof Error &&
    (error.name === "LicenseeMasterProvisionBlockedError" ||
      error.name === "SuperAdminProvisionBlockedError")
  ) {
    return {
      status: 403,
      code: "FORBIDDEN",
      message: "Organization access denied.",
    };
  }
  if (error instanceof CommunityDiscoveryRequestError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }
  return null;
}
