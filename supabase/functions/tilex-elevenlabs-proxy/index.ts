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

  if (req.method !== "POST") return json({ erreur: "POST uniquement" }, 405, cors);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ erreur: "Non authentifié" }, 401, cors);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: erreurAuth } = await supabase.auth.getUser();
  if (erreurAuth || !user) return json({ erreur: "Session invalide" }, 401, cors);

  const cleElevenLabs = Deno.env.get("ELEVENLABS_API_KEY");
  if (!cleElevenLabs) {
    console.error("[tilex-elevenlabs-proxy] ELEVENLABS_API_KEY absente des secrets");
    return json({ erreur: "Service indisponible" }, 500, cors);
  }

  let corps: any;
  try { corps = await req.json(); }
  catch { return json({ erreur: "JSON invalide" }, 400, cors); }

  const texte = corps.text || corps.texte;
  if (!texte) return json({ erreur: "text requis" }, 400, cors);

  const voiceId = corps.voice_id || "21m00Tcm4TlvDq8ikWAM";

  try {
    const reponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": cleElevenLabs,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: texte,
          model_id: corps.model_id || "eleven_multilingual_v2",
          voice_settings: {
            stability: corps.stability ?? 0.5,
            similarity_boost: corps.similarity_boost ?? 0.75,
          },
        }),
      },
    );

    if (!reponse.ok) {
      console.error("[tilex-elevenlabs-proxy] Erreur ElevenLabs", reponse.status);
      return json({ erreur: "Erreur du service synthèse vocale" }, 502, cors);
    }

    const audioBuffer = await reponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    return json({ audio_base64: base64, content_type: "audio/mpeg" }, 200, cors);
  } catch (e) {
    console.error("[tilex-elevenlabs-proxy] Exception", e);
    return json({ erreur: "Erreur interne" }, 500, cors);
  }
});
