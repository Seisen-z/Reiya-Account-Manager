import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  try {
    const { hwid } = await req.json();

    if (typeof hwid !== "string" || !hwid) {
      return new Response(JSON.stringify({ success: false, message: "Invalid input" }), { status: 400 });
    }

    const { error } = await supabase
      .from("app_presence")
      .upsert({ hwid, last_seen: new Date().toISOString() }, { onConflict: "hwid" });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: String(e) }), { status: 500 });
  }
});
