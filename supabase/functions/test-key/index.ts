import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  const rl = await checkRateLimit(getIdentifier(req), { prefix: "test-key", max: 5, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl, cors);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: data.error?.message ?? `HTTP ${res.status}`,
          status: res.status,
          key_present: !!ANTHROPIC_KEY,
        }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e.message,
        key_present: !!ANTHROPIC_KEY,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
