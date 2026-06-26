import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key, p_max: max, p_window_seconds: windowSec,
  });
  if (error) return true;
  return data === true;
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnu";
}

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

  const ip = clientIp(req);
  const allowed = await rateLimit(`savepage:${ip}`, 20, 60);
  if (!allowed) {
    return json(
      { error: "Trop de requêtes. Réessaie dans une minute." },
      429,
      { ...cors, "Retry-After": "60" },
    );
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) {
      return json({ error: "Missing slug" }, 400, cors);
    }

    const { data, error } = await supabase
      .from("generated_pages")
      .select("html_content, title")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      return new Response(
        "<html><body style='background:#0a0a0a;color:#ff7f27;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0'><h1>Page introuvable</h1></body></html>",
        { status: 404, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    await supabase.rpc("increment_page_views", { page_slug: slug }).catch(() => {});

    return new Response(data.html_content, {
      status: 200,
      headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (req.method === "POST") {
    let body: { user_id?: string; agent_id?: string; title: string; html_content: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }

    if (!body.title || !body.html_content) {
      return json({ error: "title and html_content required" }, 400, cors);
    }

    const slug =
      body.title
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) +
      "-" +
      Math.random().toString(36).slice(2, 8);

    const { error } = await supabase.from("generated_pages").insert({
      user_id: body.user_id || null,
      agent_id: body.agent_id || null,
      title: body.title,
      slug,
      html_content: body.html_content,
    });

    if (error) {
      return json({ error: error.message }, 500, cors);
    }

    const publicUrl = `${SUPABASE_URL}/functions/v1/save-page?slug=${slug}`;
    return json({ slug, url: publicUrl }, 200, cors);
  }

  return json({ error: "Method not allowed" }, 405, cors);
});
