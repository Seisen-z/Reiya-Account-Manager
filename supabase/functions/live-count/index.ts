import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// A device is "online" if it has heartbeat within this window. Client sends
// a heartbeat every 45s, so 2 minutes gives comfortable slack for jitter/retries.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

Deno.serve(async () => {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from("app_presence")
    .select("*", { count: "exact", head: true })
    .gte("last_seen", cutoff);

  if (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true, count: count ?? 0 }), { status: 200 });
});
