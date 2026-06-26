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

  const cleDeepgram = Deno.env.get("DEEPGRAM_API_KEY");
  if (!cleDeepgram) {
    console.error("[tilex-deepgram-proxy] DEEPGRAM_API_KEY absente des secrets");
    return json({ erreur: "Service indisponible" }, 500, cors);
  }

  let corps: any;
  try { corps = await req.json(); }
  catch { return json({ erreur: "JSON invalide" }, 400, cors); }

  const action = corps.action || "transcribe";

  try {
    if (action === "transcribe") {
      const audioBase64 = corps.audio_base64;
      if (!audioBase64) return json({ erreur: "audio_base64 requis" }, 400, cors);

      const audioBuffer = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));

      const reponse = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&language=fr&smart_format=true",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${cleDeepgram}`,
            "Content-Type": corps.content_type || "audio/webm",
          },
          body: audioBuffer,
        },
      );

      if (!reponse.ok) {
        console.error("[tilex-deepgram-proxy] Erreur Deepgram", reponse.status);
        return json({ erreur: "Erreur du service transcription" }, 502, cors);
      }

      const donnees = await reponse.json();
      const transcript = donnees.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      return json({ resultat: transcript }, 200, cors);
    }

    return json({ erreur: "Action inconnue" }, 400, cors);
  } catch (e) {
    console.error("[tilex-deepgram-proxy] Exception", e);
    return json({ erreur: "Erreur interne" }, 500, cors);
  }
});
