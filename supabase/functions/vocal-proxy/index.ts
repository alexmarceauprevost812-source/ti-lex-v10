import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const DEEPGRAM_KEY = Deno.env.get("DEEPGRAM_KEY")!;
const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_KEY")!;
const ELEVENLABS_VOICE_ID =
  Deno.env.get("ELEVENLABS_VOICE_ID") || "pNInz6obpgDQGcFmaJgB";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const { data, error } = await admin.rpc("check_rate_limit", {
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
  const allowed = await rateLimit(`vocal:${ip}`, 20, 60);
  if (!allowed) {
    return json(
      { error: "Trop de requêtes. Réessaie dans une minute." },
      429,
      { ...cors, "Retry-After": "60" },
    );
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── STT : client envoie audio/webm, on proxie vers Deepgram ──
  if (action === "stt" && req.method === "POST") {
    const audio = await req.arrayBuffer();
    if (!audio.byteLength) {
      return json({ error: "Empty audio" }, 400, cors);
    }

    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?language=fr-CA&model=nova-2&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_KEY}`,
          "Content-Type": "audio/webm",
        },
        body: audio,
      },
    );

    if (!dgRes.ok) {
      return json({ error: "Deepgram error", status: dgRes.status }, 502, cors);
    }

    const dgData = await dgRes.json();
    const transcript =
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return json({ transcript }, 200, cors);
  }

  // ── TTS : client envoie texte, on proxie vers ElevenLabs ──
  if (action === "tts" && req.method === "POST") {
    let body: { text?: string; voice_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }

    if (!body.text) {
      return json({ error: "text required" }, 400, cors);
    }

    const voiceId = body.voice_id || ELEVENLABS_VOICE_ID;

    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: body.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );

    if (!elRes.ok) {
      return json({ error: "ElevenLabs error", status: elRes.status }, 502, cors);
    }

    const audioBytes = await elRes.arrayBuffer();
    return new Response(audioBytes, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  }

  return json({ error: "Use ?action=stt (POST audio) or ?action=tts (POST json)" }, 400, cors);
});
