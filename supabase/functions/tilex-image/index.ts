// ============================================================
//  ti-lex-AL v10 — Fonction Edge : tilex-image
//  Rôle : générer une image à partir d'une idée écrite en joual.
//
//  Pipeline (le schéma) :
//    1. Claude (Anthropic)  -> transforme ton idée en prompt clean
//    2. Moteur image        -> rend les pixels (compatible OpenAI)
//
//  SÉCURITÉ : les deux clés (Anthropic + moteur image) vivent ICITTE,
//  côté serveur, jamais côté client. Lues via Deno.env.get.
//  Auth manuelle avec getUser() + verify_jwt = false dans config.toml
//  (obligatoire pour les nouvelles clés sb_publishable_*).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ----------  En-têtes CORS (réutilisés partout)  ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ----------  Réponse JSON courte (jamais de fuite de clé)  ----------
function repondre(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ============================================================
//  ÉTAPE 1 — Claude raffine l'idée en prompt d'image
// ============================================================
async function raffinerPrompt(idee: string): Promise<string> {
  try {
    const cleAnthropic = Deno.env.get("ANTHROPIC_API_KEY");
    if (!cleAnthropic) {
      // Pas de clé Claude : on renvoie l'idée brute, l'image se fait pareil.
      console.warn("tilex-image: ANTHROPIC_API_KEY absente, prompt non raffiné");
      return idee;
    }

    const modele = Deno.env.get("ANTHROPIC_MODELE") || "claude-sonnet-4-6";

    const consigne =
      "Tu es un directeur artistique. On te donne une idée écrite en " +
      "français québécois (souvent vague). Transforme-la en UN prompt " +
      "d'image en anglais, riche et précis : sujet, style, cadrage, " +
      "lumière, ambiance, palette. Réponds UNIQUEMENT avec le prompt, " +
      "sans guillemets ni préambule.";

    const reponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cleAnthropic,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modele,
        max_tokens: 500,
        system: consigne,
        messages: [{ role: "user", content: idee }],
      }),
    });

    if (!reponse.ok) {
      console.error("tilex-image: Claude a répondu", reponse.status);
      return idee; // on continue quand même avec l'idée brute
    }

    const data = await reponse.json();
    const texte = data?.content?.[0]?.text?.trim();
    return texte && texte.length > 0 ? texte : idee;
  } catch (err) {
    console.error("tilex-image: erreur raffinerPrompt:", (err as Error).message);
    return idee; // jamais bloquant : on dégrade vers l'idée brute
  }
}

// ============================================================
//  ÉTAPE 2 — Le moteur image rend les pixels (compatible OpenAI)
// ============================================================
async function rendreImage(
  prompt: string,
  taille: string,
  qualite: string,
): Promise<{ image_base64?: string; image_url?: string }> {
  const cleImage = Deno.env.get("IMAGE_API_KEY");
  if (!cleImage) {
    throw new Error("config_manquante"); // message générique, pas la clé
  }

  // base_url configurable : OpenAI direct OU n'importe quel agrégateur
  // compatible OpenAI (juste un changement de base_url).
  const base = (Deno.env.get("IMAGE_API_BASE") || "https://api.openai.com/v1")
    .replace(/\/+$/, "");
  const modele = Deno.env.get("IMAGE_MODELE") || "gpt-image-1";

  const reponse = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cleImage}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modele,
      prompt: prompt,
      size: taille,
      quality: qualite,
      n: 1,
    }),
  });

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => "");
    console.error("tilex-image: moteur image", reponse.status, detail.slice(0, 200));
    throw new Error(`moteur_image_${reponse.status}`);
  }

  const data = await reponse.json();
  const item = data?.data?.[0];

  // Les modèles gpt-image renvoient du base64 ; certains agrégateurs une URL.
  if (item?.b64_json) return { image_base64: item.b64_json };
  if (item?.url) return { image_url: item.url };

  throw new Error("reponse_image_vide");
}

// ============================================================
//  POINT D'ENTRÉE
// ============================================================
Deno.serve(async (req: Request) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return repondre({ erreur: "Méthode non permise" }, 405);
  }

  try {
    // ----------  Auth manuelle (verify_jwt = false)  ----------
    const entete = req.headers.get("Authorization") || "";
    if (!entete.startsWith("Bearer ")) {
      return repondre({ erreur: "Connexion requise" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: entete } } },
    );

    const { data: { user }, error: errAuth } = await supabase.auth.getUser();
    if (errAuth || !user) {
      return repondre({ erreur: "Session invalide" }, 401);
    }

    // ----------  Lecture du corps  ----------
    const corps = await req.json().catch(() => ({}));
    const idee = (corps?.idee || "").toString().trim();
    if (!idee) {
      return repondre({ erreur: "Décris-moi ton idée d'image" }, 400);
    }

    const taille = (corps?.taille || "1024x1024").toString();
    const qualite = (corps?.qualite || "medium").toString();
    const raffiner = corps?.raffiner !== false; // raffinage actif par défaut

    // ----------  Étape 1 : le cerveau (Claude)  ----------
    const prompt = raffiner ? await raffinerPrompt(idee) : idee;

    // ----------  Étape 2 : les pixels (moteur image)  ----------
    const rendu = await rendreImage(prompt, taille, qualite);

    return repondre({
      ok: true,
      prompt_utilise: prompt,
      ...rendu,
    });
  } catch (err) {
    const code = (err as Error).message || "erreur_interne";
    // On mappe les codes internes vers des messages clairs, sans rien fuiter.
    const messages: Record<string, string> = {
      config_manquante: "Le moteur image n'est pas configuré (clé manquante).",
      reponse_image_vide: "Le moteur n'a renvoyé aucune image.",
    };
    const msg = messages[code] || "Erreur pendant la génération.";
    console.error("tilex-image: échec ->", code);
    return repondre({ erreur: msg, code }, 500);
  }
});
