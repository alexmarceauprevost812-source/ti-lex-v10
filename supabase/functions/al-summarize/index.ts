import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const rl = await checkRateLimit(getIdentifier(req, user.id), { prefix: "al-summarize", max: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, corsHeaders(req));

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: msgs } = await supabase
      .from("al_messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!msgs?.length) {
      return new Response(JSON.stringify({ summary: null }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const transcript = msgs
      .map((m: { role: string; content: string }) =>
        `${m.role}: ${m.content.slice(0, 300)}`
      )
      .join("\n");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content:
            "Résume en 2-3 phrases, en français québécois, sur quoi l'utilisateur a travaillé cette semaine. " +
            "Sois chaleureux et direct.\n\nTranscript:\n" + transcript.slice(0, 8000),
        }],
      }),
    });

    const ai = await aiRes.json();
    const summary = (ai.content ?? [])
      .map((b: { text?: string }) => b.text ?? "")
      .join("")
      .trim();

    if (summary) {
      await supabase.from("al_memory_summary").insert({
        user_id: user.id,
        summary,
        period_start: since,
        period_end: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
