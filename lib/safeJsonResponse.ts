export class UnexpectedServerResponseError extends Error {
  status: number;
  contentType: string | null;
  redirected: boolean;
  finalUrl: string;
  bodyPreview: string;

  constructor(input: {
    message: string;
    status: number;
    contentType: string | null;
    redirected: boolean;
    finalUrl: string;
    bodyPreview: string;
  }) {
    super(input.message);
    this.name = "UnexpectedServerResponseError";
    this.status = input.status;
    this.contentType = input.contentType;
    this.redirected = input.redirected;
    this.finalUrl = input.finalUrl;
    this.bodyPreview = input.bodyPreview;
  }
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().includes("application/json");
}

function sanitizeBodyPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

/**
 * Safely parse a fetch Response as JSON.
 * Never calls response.json() on HTML or other non-JSON bodies.
 */
export async function parseJsonResponse<T = Record<string, unknown>>(
  response: Response,
  options?: {
    allowEmpty?: boolean;
    unexpectedMessage?: string;
  },
): Promise<T> {
  const contentType = response.headers.get("content-type");
  const unexpectedMessage =
    options?.unexpectedMessage ??
    "Athena received an unexpected server response while queuing this discussion.";

  if (
    (response.status === 204 || response.status === 205) &&
    options?.allowEmpty
  ) {
    return {} as T;
  }

  const text = await response.text().catch(() => "");

  if (!isJsonContentType(contentType)) {
    const preview = sanitizeBodyPreview(text);

    console.error("[ATHENA_HTTP] Unexpected non-JSON response", {
      endpoint: response.url,
      status: response.status,
      contentType,
      redirected: response.redirected,
      bodyPreview: preview,
    });

    throw new UnexpectedServerResponseError({
      message: unexpectedMessage,
      status: response.status,
      contentType,
      redirected: response.redirected,
      finalUrl: response.url,
      bodyPreview: preview,
    });
  }

  if (!text.trim()) {
    if (options?.allowEmpty) {
      return {} as T;
    }

    throw new UnexpectedServerResponseError({
      message: unexpectedMessage,
      status: response.status,
      contentType,
      redirected: response.redirected,
      finalUrl: response.url,
      bodyPreview: "",
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UnexpectedServerResponseError({
      message: unexpectedMessage,
      status: response.status,
      contentType,
      redirected: response.redirected,
      finalUrl: response.url,
      bodyPreview: sanitizeBodyPreview(text),
    });
  }
}
