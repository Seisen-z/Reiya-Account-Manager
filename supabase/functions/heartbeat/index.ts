import { installationId, json, supabase } from "../_shared/installation.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false }, 405);

  try {
    const id = await installationId(req);
    if (!id) return json({ success: false, message: "Installation sign-in required" }, 401);

    const { error } = await supabase
      .from("app_presence")
      .upsert({ hwid: `auth:${id}`, auth_user_id: id, last_seen: new Date().toISOString() },
        { onConflict: "auth_user_id" });

    if (error) return json({ success: false, message: "Could not record presence" }, 500);
    return json({ success: true });
  } catch {
    return json({ success: false, message: "Could not record presence" }, 500);
  }
});
