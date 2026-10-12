export class CommunityDiscoveryRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CommunityDiscoveryRequestError";
    this.code = code;
    this.status = status;
  }
}

export function communityDiscoveryPersistenceFailure(): never {
  console.error("[ATHENA_COMMUNITY_DISCOVERY] persistence_unavailable");
  throw new CommunityDiscoveryRequestError(
    "PERSISTENCE_UNAVAILABLE",
    "Community discovery could not use the public catalog.",
    503,
  );
}
