// ============================================================
// MIDAS — Edge Function (Deno) · ti-lex-AL v10 ⚜️
// ------------------------------------------------------------
// Suit le pattern INDAR : CORS, getUser() interne, appel Claude
// via fetch, journalisation dans indar_analyses (agent_id, analyse).
//
// ACTIONS (POST { action, ... }) :
//   - "recherche"      : recherche web finance (Canada/USA) via Claude + web_search
//   - "analyse_actif"  : Claude INTERPRÈTE des indicateurs déjà calculés (jamais inventer un prix)
//   - "scan_actions"   : cotations Finnhub (US) côté serveur (clé secrète)
//
// SECRETS à configurer (supabase secrets set ...) :
//   ANTHROPIC_API_KEY   (déjà présent dans ton projet)
//   FINNHUB_API_KEY     (gratuit — finnhub.io — pour le scan d'actions US)
//   [optionnel] FMP_API_KEY pour le TSX/Canada
//
// config.toml :  [functions.midas-agent]  verify_jwt = false
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// --- System prompt MIDAS (Québec) — blindé pour protéger la plateforme ---
const SYSTEME_MIDAS = `Tu es MIDAS, l'agent stratège financier de la plateforme ti-lex-AL (Produit du Québec ⚜️).
Tu fais de l'analyse financière et crypto rigoureuse, structurée et HONNÊTE.

RÈGLES ABSOLUES (non négociables — elles protègent l'utilisateur ET la plateforme) :
1. Tu fournis de l'INFORMATION et de l'ÉDUCATION, jamais un conseil financier personnalisé.
   Tu n'es pas un conseiller inscrit à l'AMF. Tu ne dis jamais « achète » ou « vends » comme un ordre :
   tu décris des CONDITIONS de marché et des SIGNAUX, en langage de probabilité.
2. Tu ne garantis JAMAIS un rendement. Aucun système ne prédit le sommet ou le creux parfait.
   Tu nommes explicitement les risques et l'incertitude de chaque analyse.
3. Tu n'inventes JAMAIS un prix, un chiffre ou une donnée. Tu utilises uniquement les données
   fournies dans la requête ou récupérées par recherche web, avec leur source et leur horodatage.
4. La GESTION DU RISQUE passe avant le signal : taille de position, stop-loss (basé sur l'ATR),
   ne jamais risquer un capital qu'on ne peut pas perdre. Tu le rappelles dans chaque analyse.
5. Tu termines TOUJOURS par un court rappel : « Information éducative, pas un conseil personnalisé.
   Consultez un conseiller inscrit à l'AMF. »

STYLE :
- Français québécois clair, professionnel, structuré (sections courtes, listes quand utile).
- Tu cites tes sources et la date des données quand tu fais de la recherche web.
- Tu distingues le marché canadien (TSX, Banque du Canada, REER/CELI, fiscalité ARC : crypto = bien,
  gains en capital inclus à 50 %) du marché américain (NYSE/NASDAQ, Fed, 401k).
- Pour la crypto : tu rappelles la volatilité extrême et le marché 24/7.
- DEVISE : les données crypto de la plateforme sont en DOLLARS CANADIENS (CAD). Précise toujours
  la devise quand tu cites un prix (« 148 000 $ CAD », jamais un « $ » tout nu) et ne convertis
  pas en USD sauf si on te le demande. Si une donnée arrive dans une autre devise, dis-le.

MÉTHODE D'ANALYSE (confluence) : tu combines tendance (MACD, croisement de moyennes),
momentum (RSI, stochastique), volatilité (Bollinger, ATR) et volume (OBV). Un signal n'est crédible
que si plusieurs indicateurs s'accordent. Tu expliques toujours POURQUOI, en nuançant.`;

const MODELE = "claude-sonnet-4-6";

// --- Appel Claude (avec ou sans web_search) ---
async function appelerClaude(messages: unknown[], avecRecherche: boolean) {
  const cle = Deno.env.get("ANTHROPIC_API_KEY");
  if (!cle) throw new Error("ANTHROPIC_API_KEY manquante (secret Supabase).");

  const corps: Record<string, unknown> = {
    model: MODELE,
    max_tokens: 2600,
    // ⚡ Prompt caching : le system MIDAS (stable) est mis en cache (−90% sur les répétitions).
    system: [{ type: "text", text: SYSTEME_MIDAS, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (avecRecherche) {
    corps.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cle,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(corps),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Claude HTTP " + r.status + " : " + t.slice(0, 300));
  }
  const data = await r.json();
  const texte = (data?.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text || "")
    .join("\n")
    .trim();
  return texte || "Aucune réponse générée.";
}

// --- Scan d'actions via Finnhub (US) ---
async function scanActions(symboles: string[]) {
  const cle = Deno.env.get("FINNHUB_API_KEY");
  if (!cle) throw new Error("FINNHUB_API_KEY manquante (secret Supabase).");
  const resultats: unknown[] = [];

  for (const sym of symboles.slice(0, 25)) {
    try {
      const url = "https://finnhub.io/api/v1/quote?symbol=" +
        encodeURIComponent(sym) + "&token=" + cle;
      const r = await fetch(url);
      if (!r.ok) { resultats.push({ symbole: sym, erreur: "HTTP " + r.status }); continue; }
      const q = await r.json();
      // Finnhub /quote : c=actuel, d=variation, dp=variation%, h, l, o, pc=clôture précédente
      resultats.push({
        symbole: sym,
        prix: q.c,
        variation: q.d,
        variationPct: q.dp,
        haut: q.h,
        bas: q.l,
        ouverture: q.o,
        cloturePrec: q.pc,
        horodatage: q.t,
      });
    } catch (e) {
      resultats.push({ symbole: sym, erreur: String(e) });
    }
  }
  return resultats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non permise" }, 405);

  // --- Auth manuelle (compatible clés API 2026) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return json({ error: "Non authentifié" }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  const action = String(payload.action || "");

  try {
    // ===== Action : scan d'actions (pas d'IA, juste données) =====
    if (action === "scan_actions") {
      const symboles = Array.isArray(payload.symboles) ? payload.symboles : [];
      if (symboles.length === 0) return json({ error: "Aucun symbole fourni" }, 400);
      const resultats = await scanActions(symboles);
      return json({ resultats });
    }

    // ===== Action : recherche web finance =====
    if (action === "recherche") {
      const sujet = String(payload.sujet || "").slice(0, 800);
      const marche = String(payload.marche || "both");
      if (!sujet) return json({ error: "Sujet manquant" }, 400);

      const contexteMarche = marche === "CA"
        ? "Concentre-toi sur le marché canadien (TSX, Banque du Canada, fiscalité ARC/Revenu Québec)."
        : marche === "US"
        ? "Concentre-toi sur le marché américain (NYSE/NASDAQ, Réserve fédérale)."
        : "Couvre à la fois le marché canadien (TSX, ARC) et américain (NYSE/NASDAQ, Fed), et compare-les.";

      const analyse = await appelerClaude([{
        role: "user",
        content: "Recherche approfondie et à jour sur ce sujet financier : « " + sujet + " ». " +
          contexteMarche + " Utilise la recherche web pour des données récentes, cite tes sources " +
          "et la date. Structure : contexte, données clés, scénarios (haussier/baissier), risques, " +
          "et points de vigilance. Termine par le rappel éducatif obligatoire.",
      }], true);

      await supabase.from("indar_analyses")
        .insert({ user_id: user.id, agent_id: "MIDAS", analyse })
        .then((r: any) => { if (r.error) console.error("insert:", r.error.message); });

      return json({ analyse });
    }

    // ===== Action : analyse approfondie d'un actif =====
    if (action === "analyse_actif") {
      const type = String(payload.type_actif || "actif");
      const symbole = String(payload.symbole || "?").slice(0, 40);
      const indicateurs = payload.indicateurs ?? {};
      const verdict = payload.verdict ?? {};

      const analyse = await appelerClaude([{
        role: "user",
        content: "Interprète ces indicateurs DÉJÀ CALCULÉS pour " + type + " " + symbole +
          " (n'invente aucun chiffre, base-toi uniquement sur ces données) :\n\n" +
          "Indicateurs : " + JSON.stringify(indicateurs) + "\n" +
          "Verdict de confluence : " + JSON.stringify(verdict) + "\n\n" +
          "Explique en français québécois : ce que disent les indicateurs ensemble, le scénario " +
          "le plus probable, les niveaux à surveiller, la gestion du risque (stop-loss ATR, taille " +
          "de position), et les risques. Nuance tout. Termine par le rappel éducatif obligatoire.",
      }], false);

      await supabase.from("indar_analyses")
        .insert({ user_id: user.id, agent_id: "MIDAS", analyse })
        .then((r: any) => { if (r.error) console.error("insert:", r.error.message); });

      return json({ analyse });
    }

    return json({ error: "Action inconnue : " + action }, 400);
  } catch (e) {
    return json({ error: "Échec MIDAS", detail: String(e) }, 502);
  }
});
