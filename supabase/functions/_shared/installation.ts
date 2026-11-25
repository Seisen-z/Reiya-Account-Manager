import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function installationId(req: Request): Promise<string | null> {
  const token = /^Bearer ([^\s]+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1];
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  return !error && data.user?.is_anonymous === true ? data.user.id : null;
}

export function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}
