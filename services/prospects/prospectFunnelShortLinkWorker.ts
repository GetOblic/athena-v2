/**
 * Cloudflare Worker adapter for Prospect Funnel short links.
 * Retirement is PATCH { disabled: true }. DELETE is not disable.
 */

import {
  createGetOblicLink,
  getGetOblicLink,
  updateGetOblicLink,
} from "@/lib/getoblic-links/server";
import { GetOblicWorkerError } from "@/lib/getoblic-links/types";
import { ProspectFunnelWorkerError } from "@/services/prospects/prospectFunnelShortLinkErrors";
import type {
  ProspectFunnelShortLinkWorker,
  ProspectFunnelWorkerLink,
} from "@/services/prospects/prospectFunnelShortLinks";

function mapWorkerError(error: unknown): ProspectFunnelWorkerError {
  if (error instanceof ProspectFunnelWorkerError) return error;
  if (error instanceof GetOblicWorkerError) {
    if (error.code === "CONFIG_MISSING") {
      return new ProspectFunnelWorkerError(
        "CONFIG_MISSING",
        "GetOblic Links is not configured.",
      );
    }
    if (error.code === "TIMEOUT") {
      return new ProspectFunnelWorkerError("TIMEOUT", "GetOblic Links timed out.");
    }
    if (error.code === "NETWORK") {
      return new ProspectFunnelWorkerError(
        "NETWORK",
        "GetOblic Links is unavailable.",
      );
    }
    if (error.code === "CONFLICT") {
      return new ProspectFunnelWorkerError("CONFLICT", "GetOblic slug is already in use.");
    }
    if (error.code === "NOT_FOUND") {
      return new ProspectFunnelWorkerError("NOT_FOUND", "GetOblic link was not found.");
    }
  }
  return new ProspectFunnelWorkerError(
    "WORKER_ERROR",
    "GetOblic Links could not update this Prospect Funnel link.",
  );
}

function toLink(link: {
  slug: string;
  url: string;
  short_url: string;
  disabled: boolean;
}): ProspectFunnelWorkerLink {
  return {
    slug: link.slug,
    url: link.url,
    shortUrl: link.short_url,
    disabled: link.disabled,
  };
}

export function createProspectFunnelShortLinkWorker(): ProspectFunnelShortLinkWorker {
  return {
    async create(input) {
      try {
        const link = await createGetOblicLink({
          url: input.url,
          slug: input.slug,
        });
        return toLink(link);
      } catch (error) {
        throw mapWorkerError(error);
      }
    },
    async get(slug) {
      try {
        const link = await getGetOblicLink(slug);
        return toLink(link);
      } catch (error) {
        const mapped = mapWorkerError(error);
        if (mapped.code === "NOT_FOUND") return null;
        throw mapped;
      }
    },
    async disable(slug) {
      try {
        const link = await updateGetOblicLink(slug, { disabled: true });
        if (!link.disabled) {
          throw new ProspectFunnelWorkerError(
            "WORKER_ERROR",
            "GetOblic link was not disabled.",
          );
        }
      } catch (error) {
        const mapped = mapWorkerError(error);
        if (mapped.code === "NOT_FOUND") return;
        throw mapped;
      }
    },
    async enable(slug) {
      try {
        const link = await updateGetOblicLink(slug, { disabled: false });
        if (link.disabled) {
          throw new ProspectFunnelWorkerError(
            "WORKER_ERROR",
            "GetOblic link stayed disabled.",
          );
        }
      } catch (error) {
        throw mapWorkerError(error);
      }
    },
  };
}
