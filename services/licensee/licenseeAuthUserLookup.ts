import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AuthUserSummary = {
  id: string;
  email: string;
};

/**
 * Resolve an auth user by email via Auth Admin HTTP API.
 * listUsers has no email filter in the installed client.
 */
export async function findAuthUserByEmail(
  email: string,
): Promise<AuthUserSummary | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceRole) {
    throw new Error("Supabase admin configuration is missing.");
  }

  const url = new URL(`${baseUrl}/auth/v1/admin/users`);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "50");
  // GoTrue supports email as a filter query on admin users.
  url.searchParams.set("email", normalized);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Auth user lookup failed (${response.status})${body ? `: ${body}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    users?: Array<{ id?: string; email?: string | null }>;
    user?: { id?: string; email?: string | null };
  };

  const users = payload.users ?? (payload.user ? [payload.user] : []);
  const match = users.find(
    (user) => user.email?.trim().toLowerCase() === normalized && user.id,
  );

  if (!match?.id || !match.email) {
    return null;
  }

  return { id: match.id, email: match.email };
}

export async function createConfirmedAuthUser(
  email: string,
): Promise<AuthUserSummary> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: normalized,
    email_confirm: true,
  });

  if (error || !data.user?.id || !data.user.email) {
    throw new Error(error?.message || "Failed to create auth user.");
  }

  return { id: data.user.id, email: data.user.email };
}
