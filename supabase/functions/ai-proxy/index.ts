// ti-lex-AL — Proxy IA securise (Anthropic chat + OpenAI images)
// Cles API cote serveur. Valide le body, limite l'usage.
// + Outils boursiers AL (FMP) exécutés côté serveur — clé jamais exposée.
// [SOURCES] émet {type:"sources",sources:["web"],confirmed:true} quand la
//           recherche web Anthropic s'exécute (logo Web côté front).
// [MEDIA]   Outil recherche_media (photos/vidéos) — Pexels si clé, sinon
//           Wikimedia Commons. Émet {type:"media",items:[...]} en SSE.
// [SILEX]   Outils lancer_scan_securite + lire_dernier_scan : AL déclenche un
//           vrai scan SILEX (security-agent, admin+SOW) et lit les résultats.
//           Le JWT de l'utilisateur est relayé — aucune escalade de privilège.
//           Accès anonyme conservé, PAS de verrou d'abonnement.
// [CERVEAU] AJOUT : ai-proxy charge AUTOMATIQUEMENT la mémoire long terme de
//           l'utilisateur (table memoire_ia) et l'injecte en tête du system,
//           dans un bloc caché. L'IA se souvient donc toujours de qui tu es,
//           sans dépendre du front. 100% additif — si ça échoue, on continue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const FMP_KEY = Deno.env.get("FMP_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-anthropic-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIMITS = { chat: 200, image: 20 };

// 🛡️ Anti-abus réseau — fenêtre glissante (Upstash Redis) AVANT l'appel au
//    fournisseur. Protège la clé Anthropic/OpenAI de la plateforme : un visiteur
//    anonyme est limité par ADRESSE IP (le chat public reste utilisable), un
//    connecté par user_id (en plus de son quota quotidien). Fail-open si Redis
//    est indisponible (rate-limit.ts) — on ne bloque jamais un usage légitime.
async function appliquerLimitesReseau(
  req: Request,
  userId: string,
  kind: "chat" | "image",
): Promise<Response | null> {
  const anon = userId === "anonymous";
  const ident = getIdentifier(req, anon ? null : userId);
  const configs = kind === "image"
    ? (anon
        ? [{ prefix: "aip-img-anon-h", max: 4, windowSec: 3600 }]
        : [{ prefix: "aip-img-min", max: 6, windowSec: 60 }])
    : (anon
        ? [
            { prefix: "aip-chat-anon-min", max: 12, windowSec: 60 },
            { prefix: "aip-chat-anon-h", max: 80, windowSec: 3600 },
          ]
        : [{ prefix: "aip-chat-min", max: 30, windowSec: 60 }]);
  for (const cfg of configs) {
    const rl = await checkRateLimit(ident, cfg);
    if (!rl.allowed) return tooManyRequests(rl, CORS);
  }
  return null;
}
const MAX_PROMPT_LEN = 4000;
const MAX_TOKENS_CAP = 8192;
const MAX_MESSAGES = 60;
const MAX_MSG_CHARS = 20_000_000;
const MAX_TOOL_LOOPS = 8;
const ALLOWED_MODELS = new Set([
  "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
]);
const ALLOWED_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);

// 📈 Outils boursiers (FMP) — exécutés côté serveur, clé jamais exposée.
const FINANCE_TOOLS = [
  {
    name: "get_stock_quote",
    description:
      "Cotation boursière en temps réel d'une action (prix, variation, volume) à partir de son symbole boursier (ex: AAPL, TSLA, SHOP.TO). Utilise-le dès que l'utilisateur demande un cours, un prix d'action ou la performance d'une entreprise cotée.",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Symbole boursier, ex: AAPL" } },
      required: ["symbol"],
    },
  },
  {
    name: "get_company_profile",
    description:
      "Profil complet d'une entreprise cotée (secteur, industrie, PDG, nombre d'employés, description, site web) à partir de son symbole boursier.",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Symbole boursier, ex: AAPL" } },
      required: ["symbol"],
    },
  },
];

const FINANCE_SYSTEM = `

## AIDE FINANCIÈRE
Tu peux aider l'utilisateur avec des informations boursières et financières :
- get_stock_quote → cours en temps réel (prix, variation, volume).
- get_company_profile → profil d'une entreprise cotée.
Donne des chiffres clairs et du contexte. Rappelle au besoin que ce sont des informations, pas des conseils financiers personnalisés.`;

// 🖼️ Outil média (Pexels / Wikimedia Commons) — exécuté côté serveur, clé jamais exposée.
const MEDIA_TOOL = {
  name: "recherche_media",
  description:
    "Cherche de vraies photos ou vidéos à afficher directement dans le chat. Utilise-le dès que l'utilisateur veut VOIR des images, des photos ou des vidéos d'un sujet (ex: « montre-moi des photos de Montréal »). Les médias trouvés s'affichent automatiquement en galerie dans la conversation.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Mots-clés de recherche (2 à 120 caractères)" },
      type: { type: "string", enum: ["photo", "video"], description: "photo (défaut) ou video" },
    },
    required: ["query"],
  },
};

// 🔰 Outils sécurité (SILEX) — AL lance de VRAIS scans et lit les résultats.
//    Exécutés côté serveur en relayant le JWT de l'utilisateur : security-agent
//    applique lui-même le verrou admin + autorisation légale (SOW). Aucune escalade.
const SECURITY_TOOLS = [
  {
    name: "lancer_scan_securite",
    description:
      "Lance un VRAI scan de sécurité SILEX (recon réel : DNS/SPF/DMARC, headers HTTP, CORS, TLS, rate limiting, RLS) sur une cible. Utilise-le quand l'utilisateur demande de scanner, auditer ou vérifier la sécurité d'un site (ex: « scanne ti-lex.ca », « fais un audit complet de mon site »). Réservé à l'administrateur ti-lex et aux cibles couvertes par une autorisation légale.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Domaine ou URL à scanner, ex: ti-lex.ca" },
        scan_type: {
          type: "string",
          enum: ["passive_recon", "web_scan", "vuln_scan", "config_audit", "full_audit"],
          description: "Type de scan. « full_audit » = tout. Défaut : full_audit.",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "lire_dernier_scan",
    description:
      "Récupère le dernier scan de sécurité de l'utilisateur et ses findings (résultats détaillés). Utilise-le quand il demande « les résultats du dernier scan », « qu'est-ce que le scan a trouvé », ou pour résumer un audit déjà fait.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Filtre optionnel par cible (ex: ti-lex.ca)" },
      },
    },
  },
  {
    name: "analyser_journal_securite",
    description:
      "Analyse les journaux de sécurité RÉELS (tentatives bloquées par Agent AL + résultats des scans SILEX) des dernières heures et génère un rapport d'incidents avec évaluation de risque et pertinence Loi 25. Utilise-le quand l'utilisateur demande un rapport/journal de sécurité, un résumé des incidents, ou veut savoir si des activités suspectes ont été détectées. Le rapport s'affiche automatiquement dans le chat. Réservé à l'administrateur.",
    input_schema: {
      type: "object",
      properties: { hours: { type: "number", description: "Nombre d'heures à analyser (défaut 24, max 168)" } },
    },
  },
];

// Bloc d'instructions COMPACT (média + youtube + sécurité) — remplace les 3 blocs
// verbeux pour alléger le contexte envoyé à chaque message (moins de tokens = plus rapide).
// Les descriptions détaillées vivent déjà dans les tools eux-mêmes.
const TOOLS_SYSTEM = `

## OUTILS (affichage + sécurité)
- recherche_media / recherche_youtube : quand l'utilisateur veut VOIR des photos ou des vidéos, appelle l'outil. Les résultats s'affichent AUTOMATIQUEMENT en galerie sous ta réponse — ne colle JAMAIS d'URLs dans ton texte, présente-les en 1 phrase.
- lancer_scan_securite / lire_dernier_scan : pour scanner/auditer un site ou lire un scan. Explique en québécois clair, sans dramatiser un « info »/« low ». Si le scan est refusé ou la clé absente, dis-le sans inventer.
- analyser_journal_securite : pour un rapport/journal de sécurité. Le rapport s'affiche déjà en entier dans le chat — commente-le brièvement en 1-2 phrases, ne le récite jamais au complet.`;

// 🎬 Outil YouTube — clé côté serveur (tilex_secrets nom='youtube' ou env YOUTUBE_API_KEY).
const YOUTUBE_TOOL = {
  name: "recherche_youtube",
  description:
    "Cherche de vraies vidéos YouTube à afficher directement dans le chat. Utilise-le quand l'utilisateur veut VOIR ou REGARDER des vidéos YouTube d'un sujet (ex: « montre-moi des vidéos de recettes de poutine », « trouve des tutoriels sur X »). Les vidéos s'affichent automatiquement en galerie intégrée (lecteurs YouTube) dans la conversation.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Mots-clés de recherche YouTube (1 à 200 caractères)" } },
    required: ["query"],
  },
};

let _youtubeKey: string | undefined = undefined;
async function getYoutubeKey(): Promise<string> {
  if (_youtubeKey !== undefined) return _youtubeKey;
  _youtubeKey = Deno.env.get("YOUTUBE_API_KEY") || "";
  if (!_youtubeKey) {
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data } = await sb.from("tilex_secrets").select("private_key").eq("nom", "youtube").maybeSingle();
      _youtubeKey = (data as any)?.private_key || "";
    } catch (_) { _youtubeKey = ""; }
  }
  return _youtubeKey;
}

async function chercherYoutube(input: any): Promise<{ items: any[]; note?: string }> {
  const query = typeof input?.query === "string" ? input.query.trim().slice(0, 200) : "";
  if (query.length < 1) return { items: [], note: "Requête vide" };
  const key = await getYoutubeKey();
  if (!key) return { items: [], note: "Clé YouTube non configurée côté serveur (tilex_secrets nom='youtube')." };
  try {
    const url = "https://www.googleapis.com/youtube/v3/search"
      + "?part=snippet&type=video&safeSearch=moderate&maxResults=6"
      + "&q=" + encodeURIComponent(query)
      + "&key=" + encodeURIComponent(key);
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { items: [], note: "YouTube: " + (data?.error?.message || ("HTTP " + r.status)) };
    const items = ((data.items || []) as any[])
      .map((it: any) => ({
        videoId: it?.id?.videoId || "",
        title: it?.snippet?.title || "",
        channel: it?.snippet?.channelTitle || "",
        thumb: it?.snippet?.thumbnails?.medium?.url || "",
      }))
      .filter((v: any) => /^[A-Za-z0-9_-]{11}$/.test(v.videoId));
    return { items };
  } catch (e: any) {
    return { items: [], note: "YouTube injoignable : " + (e?.message || String(e)) };
  }
}

let _pexelsKey: string | undefined = undefined;
async function getPexelsKey(): Promise<string> {
  if (_pexelsKey !== undefined) return _pexelsKey;
  _pexelsKey = Deno.env.get("PEXELS_API_KEY") || "";
  if (!_pexelsKey) {
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data } = await sb.from("tilex_secrets").select("private_key").eq("nom", "pexels").maybeSingle();
      _pexelsKey = (data as any)?.private_key || "";
    } catch (_) { _pexelsKey = ""; }
  }
  return _pexelsKey;
}

async function chercherMedia(input: any): Promise<{ items: any[]; source: string; note?: string }> {
  const query = typeof input?.query === "string" ? input.query.trim().slice(0, 120) : "";
  const type = input?.type === "video" ? "video" : "photo";
  if (query.length < 2) return { items: [], source: "aucune", note: "Requête vide ou trop courte" };

  const key = await getPexelsKey();
  if (key) {
    try {
      const base = type === "video" ? "https://api.pexels.com/videos/search" : "https://api.pexels.com/v1/search";
      const r = await fetch(`${base}?query=${encodeURIComponent(query)}&per_page=9&locale=fr-FR`, {
        headers: { Authorization: key },
      });
      if (r.ok) {
        const data = await r.json();
        const items = ((data.photos ?? data.videos ?? []) as any[])
          .map((m: any) =>
            type === "video"
              ? {
                  kind: "video",
                  thumb: m.image,
                  full: ((m.video_files || []) as any[])
                    .filter((f: any) => f.link)
                    .sort((a: any, b: any) => (a.width || 0) - (b.width || 0))[0]?.link,
                  credit: `Vidéo par ${m.user?.name || "?"} / Pexels`,
                  link: m.url,
                }
              : {
                  kind: "image",
                  thumb: m.src?.medium,
                  full: m.src?.large2x || m.src?.large || m.src?.original,
                  credit: `Photo par ${m.photographer || "?"} / Pexels`,
                  link: m.url,
                }
          )
          .filter((x: any) => x.thumb && x.full);
        if (items.length) return { items, source: "Pexels" };
      }
    } catch (_) { /* repli Wikimedia */ }
  }

  // Repli gratuit sans clé : Wikimedia Commons.
  try {
    const filt = type === "video" ? " filetype:video" : " filetype:bitmap";
    const u =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query + filt)}&gsrlimit=9&gsrnamespace=6` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=480&format=json&origin=*`;
    const r = await fetch(u);
    const d = await r.json();
    const pages = Object.values(d?.query?.pages || {}) as any[];
    const items = pages
      .map((p: any) => {
        const ii = p.imageinfo?.[0];
        if (!ii || !ii.thumburl) return null;
        return {
          kind: type === "video" ? "video" : "image",
          thumb: ii.thumburl,
          full: ii.url,
          credit: "Wikimedia Commons",
          link: ii.descriptionurl,
        };
      })
      .filter(Boolean);
    return { items, source: "Wikimedia Commons" };
  } catch (e: any) {
    return { items: [], source: "aucune", note: e?.message || "Recherche média indisponible" };
  }
}

function symboleValide(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9.\-^]{1,15}$/.test(s);
}

async function fmpFetch(endpoint: string, symbol: string): Promise<string> {
  if (!FMP_KEY) return JSON.stringify({ erreur: "Clé FMP non configurée côté serveur" });
  if (!symboleValide(symbol)) return JSON.stringify({ erreur: "Symbole invalide" });
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/${endpoint}?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
    );
    if (!r.ok) return JSON.stringify({ erreur: `FMP HTTP ${r.status}` });
    return JSON.stringify(await r.json());
  } catch (e: any) {
    return JSON.stringify({ erreur: e?.message || "FMP injoignable" });
  }
}

interface ToolCtx { authHeader: string; userId: string; }

// 🔰 Lance un scan SILEX en relayant le JWT de l'utilisateur (security-agent gère
//    lui-même le verrou admin + autorisation légale).
async function toolLancerScan(input: any, ctx: ToolCtx): Promise<string> {
  if (!ctx.authHeader) return JSON.stringify({ erreur: "Connexion requise pour lancer un scan de sécurité." });
  const target = typeof input?.target === "string" ? input.target.trim().slice(0, 255) : "";
  if (!target) return JSON.stringify({ erreur: "Cible manquante." });
  const scanType = ["passive_recon", "web_scan", "vuln_scan", "config_audit", "full_audit"].includes(input?.scan_type)
    ? input.scan_type : "full_audit";
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/security-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": ctx.authHeader, "apikey": ANON_KEY },
      body: JSON.stringify({ target, scan_type: scanType }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      return JSON.stringify({ ok: false, erreur: data.error || `Scan échoué (HTTP ${r.status})` });
    }
    return JSON.stringify({
      ok: true,
      cible: target,
      type: scanType,
      resume: data.executive_summary,
      compte: data.severity_counts,
      nombre: data.findings_count,
      findings: (data.findings || []).slice(0, 20).map((f: any) => ({
        severite: f.severity, titre: f.title, description: f.description, remediation: f.remediation,
      })),
    });
  } catch (e: any) {
    return JSON.stringify({ ok: false, erreur: "Scanner injoignable : " + (e?.message || String(e)) });
  }
}

// 🔰 Lit le dernier scan de l'utilisateur (scopé user_id — pas de fuite inter-utilisateur).
async function toolLireDernierScan(input: any, ctx: ToolCtx): Promise<string> {
  if (!ctx.userId || ctx.userId === "anonymous") return JSON.stringify({ erreur: "Connexion requise." });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    let q = sb.from("security_scans")
      .select("id,target,scan_type,status,executive_summary,findings_critical,findings_high,findings_medium,findings_low,findings_info,created_at")
      .eq("user_id", ctx.userId);
    if (input?.target && typeof input.target === "string") q = q.ilike("target", "%" + input.target.trim() + "%");
    const { data: scans } = await q.order("created_at", { ascending: false }).limit(1);
    const scan = (scans as any[])?.[0];
    if (!scan) return JSON.stringify({ ok: true, trouve: false, note: "Aucun scan trouvé pour cet utilisateur." });
    const { data: findings } = await sb.from("security_findings")
      .select("severity,title,description,remediation,affected_target")
      .eq("scan_id", scan.id);
    return JSON.stringify({
      ok: true, trouve: true,
      cible: scan.target, type: scan.scan_type, statut: scan.status, date: scan.created_at,
      resume: scan.executive_summary,
      compte: {
        critical: scan.findings_critical, high: scan.findings_high, medium: scan.findings_medium,
        low: scan.findings_low, info: scan.findings_info,
      },
      findings: ((findings as any[]) || []).slice(0, 30).map((f: any) => ({
        severite: f.severity, titre: f.title, description: f.description, remediation: f.remediation,
      })),
    });
  } catch (e: any) {
    return JSON.stringify({ erreur: "Lecture du scan impossible : " + (e?.message || String(e)) });
  }
}

// 📊 Relaie le JWT de l'utilisateur vers log-analyst (qui applique lui-même
//    le verrou admin — aucune escalade de privilège ici).
async function toolAnalyserJournal(input: any, ctx: ToolCtx): Promise<string> {
  if (!ctx.authHeader) return JSON.stringify({ erreur: "Connexion requise." });
  try {
    const heures = typeof input?.hours === "number" ? input.hours : 24;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/log-analyst`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": ctx.authHeader, "apikey": ANON_KEY },
      body: JSON.stringify({ hours: heures }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return JSON.stringify({ erreur: data.error || `Analyse échouée (HTTP ${r.status})` });
    return JSON.stringify({ rapport: data });
  } catch (e: any) {
    return JSON.stringify({ erreur: "Analyste de journal injoignable : " + (e?.message || String(e)) });
  }
}

async function executeCustomTool(name: string, input: any, ctx: ToolCtx): Promise<string> {
  try {
    if (name === "get_stock_quote") return await fmpFetch("quote", input?.symbol);
    if (name === "get_company_profile") return await fmpFetch("profile", input?.symbol);
    if (name === "recherche_media") return JSON.stringify(await chercherMedia(input));
    if (name === "recherche_youtube") return JSON.stringify(await chercherYoutube(input));
    if (name === "lancer_scan_securite") return await toolLancerScan(input, ctx);
    if (name === "lire_dernier_scan") return await toolLireDernierScan(input, ctx);
    if (name === "analyser_journal_securite") return await toolAnalyserJournal(input, ctx);
    return JSON.stringify({ erreur: `Outil inconnu: ${name}` });
  } catch (e: any) {
    return JSON.stringify({ erreur: e?.message || "Erreur d'exécution de l'outil" });
  }
}

// [CERVEAU] ─────────────────────────────────────────────────────────────────
// Persona ti-lex par défaut (utilisée SEULEMENT si le front n'envoie aucun
// system prompt — on ne réécrit jamais l'identité d'un agent custom).
const PERSONA_TILEX = `Tu es AL, l'assistant IA de la plateforme ti-lex (Québec ⚜️).
Tu parles un français québécois naturel, chaleureux et DIRECT — comme un vrai chum qui connait la personne, jamais robotique ni corporatif.
Tu dis toujours la vérité, sans bullshit ni flatterie inutile ; si tu sais pas, tu le dis franchement.
Tu vas droit au but, tu expliques clairement, pis tu gardes des tournures d'ici (correc, en masse, pantoute, c'est ben correct, checke ça) sans en beurrer épais.
Tu écris en paragraphes courts et aérés ; tu utilises des listes seulement quand ça aide vraiment.`;

const CAT_ORDRE = ["identite", "preference", "contexte", "fait", "habitude", "projet", "succes", "erreur_recente"];
const CAT_TITRE: Record<string, string> = {
  identite: "QUI EST LA PERSONNE",
  preference: "SES PRÉFÉRENCES",
  contexte: "SON CONTEXTE",
  fait: "FAITS IMPORTANTS",
  habitude: "SES HABITUDES",
  projet: "SES PROJETS",
  succes: "SES SUCCÈS",
  erreur_recente: "PROBLÈMES RÉCENTS À NE PAS RÉPÉTER",
};

// Charge la mémoire long terme de l'utilisateur (table memoire_ia) et la formate
// en un bloc de contexte. Scopé strictement par user_id (le service role bypasse
// la RLS, donc le filtre .eq est OBLIGATOIRE pour éviter toute fuite inter-user).
// Retourne "" pour un visiteur anonyme, sans mémoire, ou en cas d'erreur.
async function chargerCerveau(userId: string): Promise<string> {
  if (!userId || userId === "anonymous") return "";
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await sb
      .from("memoire_ia")
      .select("categorie,cle,valeur")
      .eq("user_id", userId)
      .order("confiance", { ascending: false })
      .order("nb_utilisations", { ascending: false })
      .order("mis_a_jour_le", { ascending: false })
      .limit(90);
    const rows = (data as any[]) || [];
    if (!rows.length) return "";

    const parCat: Record<string, string[]> = {};
    for (const r of rows) {
      const cat = String(r.categorie || "fait");
      const cle = String(r.cle || "").trim();
      const val = String(r.valeur || "").trim();
      if (!val) continue;
      (parCat[cat] ||= []).push(cle ? `- ${cle} : ${val}` : `- ${val}`);
    }
    const cats = [
      ...CAT_ORDRE.filter((c) => parCat[c]),
      ...Object.keys(parCat).filter((c) => !CAT_ORDRE.includes(c)),
    ];

    let bloc = "=== CE QUE TU SAIS DÉJÀ SUR LA PERSONNE (mémoire long terme ti-lex) ===\n"
      + "Sers-toi-en naturellement dans la conversation, comme quelqu'un qui connait déjà la personne. Ne récite JAMAIS cette liste telle quelle et ne dis pas « d'après ma mémoire ».\n";
    let taille = bloc.length;
    for (const cat of cats) {
      const section = `\n[${CAT_TITRE[cat] || cat.toUpperCase()}]\n${parCat[cat].join("\n")}\n`;
      if (taille + section.length > 6000) break; // garde le bloc raisonnable
      bloc += section;
      taille += section.length;
    }
    return bloc;
  } catch (_) {
    return "";
  }
}
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Methode non autorisee" }, 405);

  try {
    // ---- 1. Auth optionnelle ----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let userId = "anonymous";

    if (token) {
      try {
        const sb = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data: userData } = await sb.auth.getUser(token);
        if (userData?.user?.id) userId = userData.user.id;
      } catch (_) {}
    }

    // ---- 2. Parse + valide le body ----
    let body: any;
    try { body = await req.json(); }
    catch { return json({ error: "JSON invalide" }, 400); }

    const kind = body.kind === "image" ? "image" : "chat";

    // ---- 3a. Anti-abus par IP (surtout accès anonyme) — fenêtre glissante ----
    const limitResp = await appliquerLimitesReseau(req, userId, kind);
    if (limitResp) return limitResp;

    // ---- 3b. Quota quotidien par utilisateur — incrément ATOMIQUE (RPC) ----
    //     L'ancien read-then-upsert était une course concurrente et pointait sur
    //     une table inexistante. increment_ai_usage() vérifie ET incrémente en une
    //     seule requête : impossible de dépasser le quota en parallèle. Fail-open
    //     si la RPC échoue (on ne bloque pas un utilisateur légitime).
    if (userId !== "anonymous") {
      try {
        const sb = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data: quota, error: quotaErr } = await sb.rpc("increment_ai_usage", {
          p_user_id: userId,
          p_kind: kind,
          p_limit: LIMITS[kind],
        });
        if (!quotaErr && quota && (quota as any).allowed === false) {
          return json({ error: `Limite quotidienne atteinte (${LIMITS[kind]} ${kind})` }, 429);
        }
      } catch (_) {}
    }

    // ===================== IMAGE =====================
    if (kind === "image") {
      if (!OPENAI_KEY) return json({ error: "OPENAI_API_KEY non configuree" }, 500);

      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return json({ error: "Prompt vide" }, 400);
      if (prompt.length > MAX_PROMPT_LEN)
        return json({ error: `Prompt trop long (max ${MAX_PROMPT_LEN})` }, 400);

      const size = ALLOWED_SIZES.has(body.size) ? body.size : "1024x1024";

      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data?.error?.message?.includes("safety") || data?.error?.code === "moderation_blocked"
          ? "Image refusee par la moderation."
          : "Erreur de generation d'image.";
        return json({ error: msg }, r.status);
      }
      return json({ b64: data.data?.[0]?.b64_json }, 200);
    }

    // ===================== CHAT =====================
    const model = ALLOWED_MODELS.has(body.model) ? body.model : "claude-opus-4-8";

    if (!Array.isArray(body.messages) || body.messages.length === 0)
      return json({ error: "messages requis" }, 400);
    if (body.messages.length > MAX_MESSAGES)
      return json({ error: "Historique trop long" }, 400);

    const totalChars = JSON.stringify(body.messages).length;
    if (totalChars > MAX_MSG_CHARS)
      return json({ error: `Contenu trop volumineux (${(totalChars / 1_000_000).toFixed(1)} Mo, max ${(MAX_MSG_CHARS / 1_000_000).toFixed(0)} Mo)` }, 400);

    const maxTokens = Math.min(Number(body.max_tokens) || 4096, MAX_TOKENS_CAP);

    const userKey = req.headers.get("x-anthropic-key");
    const apiKey = (userKey && userKey.startsWith("sk-ant-")) ? userKey : ANTHROPIC_KEY;
    if (!apiKey) return json({ error: "Aucune cle API configuree. Ajoute ta cle Anthropic dans les Parametres ou en secret Supabase." }, 500);

    // ---- Build tools (recherche web optionnelle + bourse si clé FMP + média + sécurité) ----
    const tools: any[] = [];
    if (body.web_search) {
      tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });
    }
    if (FMP_KEY) {
      tools.push(...FINANCE_TOOLS);
    }
    tools.push(MEDIA_TOOL);          // [MEDIA] toujours actif (Pexels si clé, sinon Wikimedia gratuit)
    tools.push(YOUTUBE_TOOL);        // [YOUTUBE] galerie de vidéos YouTube dans le chat
    tools.push(...SECURITY_TOOLS);   // [SILEX] AL peut lancer/lire un scan (gate admin+SOW côté security-agent)
    if (body.tools && Array.isArray(body.tools)) {
      tools.push(...body.tools);
    }

    // [CERVEAU] Si le front n'envoie aucun system prompt, on met la persona ti-lex
    //           par défaut (au lieu d'une identité vide). Si un agent custom envoie
    //           son propre system, on le respecte tel quel — on ne l'écrase jamais.
    const clientSystem = (typeof body.system === "string" && body.system.trim()) ? body.system : "";
    let systemPrompt = clientSystem || PERSONA_TILEX;
    if (FMP_KEY) systemPrompt += FINANCE_SYSTEM;
    systemPrompt += TOOLS_SYSTEM;

    // [CERVEAU] Mémoire long terme de l'utilisateur, chargée AUTOMATIQUEMENT côté
    //           serveur (indépendant du front). L'IA se souvient donc toujours de toi.
    const cerveau = await chargerCerveau(userId);

    // ⚡ Prompt caching : le system (persona + outils) + le cerveau (mémoire) sont
    //    marqués cacheables. Deux messages de suite avec le même system → cache hit
    //    → réponse plus rapide à démarrer + moins cher. Passé comme tableau de blocs.
    const systemBlocks: any[] = [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ];
    if (cerveau) {
      systemBlocks.push({ type: "text", text: cerveau, cache_control: { type: "ephemeral" } });
    }
    const systemParam = systemBlocks;

    const anthropicHeaders = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };

    // Outils custom (bourse, média, youtube, sécurité) → boucle d'outils en streaming temps réel.
    const hasCustomTools = tools.some((t: any) => t.type !== "web_search_20250305");
    if (hasCustomTools) {
      return handleToolLoop(marquerDernierMessageCache(body.messages), tools, model, maxTokens, systemParam, anthropicHeaders, { authHeader, userId });
    }

    // Sinon : streaming passthrough (avec web_search optionnel exécuté par Anthropic).
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(systemParam ? { system: systemParam } : {}),
        stream: true,
        messages: marquerDernierMessageCache(body.messages),
        ...(tools.length > 0 ? { tools } : {}),
      }),
    });
    if (!r.ok) {
      try {
        const errData = await r.json();
        return json({ error: errData.error?.message || `Erreur Claude (${r.status})` }, r.status);
      } catch {
        return json({ error: `Erreur du modele (${r.status})` }, r.status);
      }
    }

    return new Response(r.body, {
      headers: {
        ...CORS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("ai-proxy error:", error.message);
    return json(
      { error: `HTTP ${error.status ?? 500}: ${error.message ?? "Erreur serveur"}` },
      error.status ?? 500,
    );
  }
});

// ⚡ Prompt caching — change C : breakpoint sur le DERNIER message.
//    Dans une conversation, tout l'historique est renvoyé à chaque tour. Ce
//    breakpoint met en cache le préfixe (identique d'un tour à l'autre) : on ne
//    paye l'écriture que sur les nouveaux tokens, et on lit le reste à -90%.
//    Sous ~1024 tokens le breakpoint est ignoré sans erreur.
function marquerDernierMessageCache(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const copie = messages.slice();
  const dernier = { ...copie[copie.length - 1] };
  if (typeof dernier.content === "string") {
    dernier.content = [{ type: "text", text: dernier.content, cache_control: { type: "ephemeral" } }];
  } else if (Array.isArray(dernier.content) && dernier.content.length > 0) {
    const blocs = dernier.content.slice();
    blocs[blocs.length - 1] = { ...blocs[blocs.length - 1], cache_control: { type: "ephemeral" } };
    dernier.content = blocs;
  } else {
    return messages; // rien de cachable
  }
  copie[copie.length - 1] = dernier;
  return copie;
}

// ── Boucle d'outils en streaming : relaie le texte en temps réel ET exécute
//    les outils custom (bourse, média, sécurité) côté serveur, puis relance.
//    Gère web_search/pause_turn.
function handleToolLoop(
  messages: any[],
  tools: any[],
  model: string,
  maxTokens: number,
  system: any, // tableau de blocs cacheables (ou undefined)
  headers: Record<string, string>,
  ctx: ToolCtx,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      let msgs = [...messages];
      let loops = 0;

      try {
        while (loops < MAX_TOOL_LOOPS) {
          loops++;
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers,
            body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: msgs, tools, stream: true }),
          });

          if (!r.ok || !r.body) {
            const err = await r.text().catch(() => "Erreur Claude");
            send(JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: `⚠️ ${err}` } }));
            send("[DONE]");
            controller.close();
            return;
          }

          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          const blocks: any[] = [];
          let stopReason: string | null = null;
          let buf = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const d = t.slice(5).trim();
              if (!d || d === "[DONE]") continue;
              let ev: any;
              try { ev = JSON.parse(d); } catch { continue; }

              if (ev.type === "content_block_start") {
                const cb = ev.content_block || {};
                if (cb.type === "tool_use") {
                  blocks[ev.index] = { type: "tool_use", id: cb.id, name: cb.name, _json: "" };
                } else if (cb.type === "text") {
                  blocks[ev.index] = { type: "text", text: "" };
                } else {
                  blocks[ev.index] = { ...cb };
                  if (cb.type === "server_tool_use" && cb.name === "web_search") {
                    send(JSON.stringify({ type: "tool_status", tool_name: "web_search", status: "executing" }));
                    send(JSON.stringify({ type: "sources", sources: ["web"], confirmed: true })); // [SOURCES]
                  }
                }
              } else if (ev.type === "content_block_delta") {
                const b = blocks[ev.index];
                if (ev.delta?.type === "text_delta") {
                  if (b && b.type === "text") b.text += ev.delta.text;
                  send(JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: ev.delta.text } }));
                } else if (ev.delta?.type === "input_json_delta") {
                  if (b) b._json += ev.delta.partial_json || "";
                }
              } else if (ev.type === "message_delta") {
                if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
              }
            }
          }

          const content: any[] = [];
          for (const b of blocks) {
            if (!b) continue;
            if (b.type === "tool_use") {
              let input: any = {};
              try { input = b._json ? JSON.parse(b._json) : {}; } catch { input = {}; }
              content.push({ type: "tool_use", id: b.id, name: b.name, input });
            } else if (b.type === "text") {
              content.push({ type: "text", text: b.text });
            } else {
              content.push(b);
            }
          }

          if (stopReason === "pause_turn") {
            msgs = [...msgs, { role: "assistant", content }];
            continue;
          }

          const toolUseBlocks = content.filter((b: any) => b.type === "tool_use");
          if (stopReason !== "tool_use" || toolUseBlocks.length === 0) {
            send("[DONE]");
            controller.close();
            return;
          }

          const toolResults: any[] = [];
          for (const toolBlock of toolUseBlocks) {
            send(JSON.stringify({ type: "tool_status", tool_name: toolBlock.name, status: "executing" }));
            let result = await executeCustomTool(toolBlock.name, toolBlock.input, ctx);
            // [MEDIA] pousse la galerie au front en temps réel + résultat compact pour Claude.
            if (toolBlock.name === "recherche_media") {
              try {
                const parsed = JSON.parse(result);
                if (parsed?.items?.length) {
                  send(JSON.stringify({ type: "media", items: parsed.items }));
                  result = JSON.stringify({
                    affiche_dans_le_chat: true,
                    nombre: parsed.items.length,
                    source: parsed.source,
                    credits: parsed.items.slice(0, 9).map((i: any) => i.credit),
                  });
                } else {
                  result = JSON.stringify({ affiche_dans_le_chat: false, nombre: 0, note: parsed?.note || "Aucun média trouvé" });
                }
              } catch (_) {}
            }
            // [YOUTUBE] pousse la galerie de vidéos au front en temps réel + résultat compact pour Claude.
            if (toolBlock.name === "recherche_youtube") {
              try {
                const parsed = JSON.parse(result);
                if (parsed?.items?.length) {
                  send(JSON.stringify({ type: "youtube", items: parsed.items }));
                  result = JSON.stringify({
                    affiche_dans_le_chat: true,
                    nombre: parsed.items.length,
                    titres: parsed.items.slice(0, 6).map((i: any) => i.title),
                  });
                } else {
                  result = JSON.stringify({ affiche_dans_le_chat: false, nombre: 0, note: parsed?.note || "Aucune vidéo trouvée" });
                }
              } catch (_) {}
            }
            // [JOURNAL] pousse le rapport complet au front en temps réel + résumé compact pour Claude.
            if (toolBlock.name === "analyser_journal_securite") {
              try {
                const parsed = JSON.parse(result);
                if (parsed?.rapport) {
                  send(JSON.stringify({ type: "log_report", report: parsed.rapport }));
                  result = JSON.stringify({
                    affiche_dans_le_chat: true,
                    stats: parsed.rapport.stats,
                    nombre_incidents: (parsed.rapport.incidents || []).length,
                  });
                }
              } catch (_) {}
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: typeof result === "string" ? result : JSON.stringify(result),
            });
          }

          msgs = [
            ...msgs,
            { role: "assistant", content },
            { role: "user", content: toolResults },
          ];
        }

        send(JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "⚠️ Limite de boucles d'outils atteinte." },
        }));
        send("[DONE]");
        controller.close();
      } catch (e: any) {
        send(JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "⚠️ " + (e?.message || "Erreur") } }));
        send("[DONE]");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
