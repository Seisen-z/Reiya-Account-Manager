import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  const { data, error } = await supabase.from("app_ratings").select("rating");

  if (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
  }

  const count = data.length;
  const average = count ? data.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  return new Response(JSON.stringify({ success: true, average, count }), { status: 200 });
});
