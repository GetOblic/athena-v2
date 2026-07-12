/**
 * Compatibility alias for Prospect imports.
 * Prefer POST /api/prospects (manual) and POST /api/prospects/import (CSV).
 */

import { POST as manualPost } from "@/app/api/prospects/route";
import { POST as importPost } from "@/app/api/prospects/import/route";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return importPost(request);
  }
  return manualPost(request);
}
