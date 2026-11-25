import { json, supabase } from "../_shared/installation.ts";

Deno.serve(async () => {
  const { data, error } = await supabase.rpc("app_verified_rating_stats").single();
  if (error || !data) return json({ success: false, message: "Could not read ratings" }, 500);

  const { average, count } = data as { average: number; count: number };
  return json({ success: true, average, count });
});
