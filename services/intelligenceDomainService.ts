import type { Community } from "@/services/communityService";
import {
    createCommunity,
    getCommunities,
    getCommunityById,
} from "@/services/communityService";

export type IntelligenceDomain = Community;

export type CreateIntelligenceDomainInput = {
    name: string;
    description?: string | null;
    market?: string | null;
    status?: string;
};

export async function getIntelligenceDomains(): Promise<IntelligenceDomain[]> {
    return getCommunities();
}

export async function getIntelligenceDomainById(
    id: string,
): Promise<IntelligenceDomain | null> {
    return getCommunityById(id);
}

export async function createIntelligenceDomain(
    input: CreateIntelligenceDomainInput,
): Promise<IntelligenceDomain | null> {
    const name = input.name.trim();

    if (!name) {
        return null;
    }

    return createCommunity({
        group_name: name,
        notes: input.description ?? null,
        niche: input.market ?? null,
        status: input.status ?? "active",
    });
}

export function getIntelligenceDomainName(domain: IntelligenceDomain): string {
    return domain.group_name;
}
