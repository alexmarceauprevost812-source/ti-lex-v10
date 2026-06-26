// ti-lex v10 — Edge Function : scan-headers
// Scan PASSIF des en-têtes de sécurité HTTP d'une URL.
// Légal : simple GET sur une page publique + lecture des en-têtes.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

function json(obj: unknown, status: number, hdrs: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...hdrs, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userSb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await userSb.auth.getUser();
  if (!user) return json({ error: "not_authenticated" }, 401, cors);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const url = String(body.url || "");
  if (!url) return json({ error: "url_required" }, 400, cors);

  try {
    new URL(url);
  } catch {
    return json({ error: "invalid_url" }, 400, cors);
  }

  try {
    const cible = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "ti-lex-v10-scanner/1.0 (security-audit)" },
    });

    const attendus = [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ];

    const presents: Record<string, string> = {};
    const manquants: string[] = [];
    attendus.forEach((h) => {
      const v = cible.headers.get(h);
      if (v) presents[h] = v;
      else manquants.push(h);
    });

    const score = Math.round((Object.keys(presents).length / attendus.length) * 100);
    let verdict = "Faible";
    if (score >= 80) verdict = "Bon";
    else if (score >= 50) verdict = "Moyen";

    const resultat = { url, statut: cible.status, score, presents, manquants, verdict };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await admin.from("indar_analyses").upsert({
      user_id: user.id,
      agent_id: "SENTINEL",
      analyse: JSON.stringify(resultat),
      scan_count: 1,
      created_at: new Date().toISOString(),
    }, { onConflict: "user_id,agent_id" }).catch(() => {});

    await admin.from("audit_events").insert({
      actor_id: user.id,
      action: "scan_headers",
      resource_type: "url",
      resource_id: url,
      details: { score, verdict, manquants },
    }).catch(() => {});

    return json(resultat, 200, cors);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500, cors);
  }
});
