// ti-lex v10 — Edge Function agent-al — NIVEAU MAX (6 couches)
// =====================================================================
// PATCH « sources » : la fonction renvoie maintenant, dans le flux SSE,
// un événement  data: {"type":"sources","sources":[...],"confirmed":bool}
// qui dit QUELS moteurs sont utilisés (supabase / github / web|google).
// -> "confirmed":false  = estimation d'après la question (au tout début)
// -> "confirmed":true   = moteur RÉELLEMENT appelé pendant la conversation
// Le front (indicateur de recherche) affiche le bon logo officiel à partir de ça.
//
// AJOUT OPTIONNEL : un outil web_search (Brave OU Google CSE) qui n'est exposé
// QUE si une clé de recherche est configurée. Tant qu'il n'y a pas de clé,
// aucun logo "web/google" n'est affiché (on ne ment pas sur ce qui est branché).
//
// Tout le reste est IDENTIQUE à l'original (rien de cassé, ajouts seulement).
// Repères des ajouts :  // [SOURCES]   et   // [WEB]
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const GITHUB_TOKEN       = Deno.env.get("GITHUB_TOKEN")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY           = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_USER_ID = Deno.env.get("OWNER_USER_ID") || "d9a1985a-e106-4ea5-9ada-cac775c0b820";
const INJECT_PIN = Deno.env.get("AL_INJECT_PIN") || "";
const GH_OWNER  = "alexmarceauprevost812-source";
const GH_REPO   = "ti-lex-v10";
const GH_BRANCH = "supabase";
// Modèle par défaut : utilisé si le front en demande pas, ou en demande un inconnu.
const MODEL     = "claude-sonnet-4-6";
// Modèles que le front (console web) a le droit de demander — même liste que ai-proxy.
const MODELES_PERMIS = new Set([
  // Génération courante (la plus récente en premier).
  "claude-fable-5-1", "claude-opus-5", "claude-sonnet-5",
  // Génération précédente, encore servie.
  "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6",
  // Haiku 4.5 : l'ID officiel, pis le vieil ID daté que des pages envoient encore.
  "claude-haiku-4-5", "claude-haiku-4-5-20251001",
]);
/** Renvoie le modèle demandé s'il est dans la liste permise, sinon le défaut. */
function choisirModele(demande: unknown): string {
  const m = typeof demande === "string" ? demande.trim() : "";
  return MODELES_PERMIS.has(m) ? m : MODEL;
}

// [WEB] Recherche web OPTIONNELLE — activée seulement si une clé est fournie.
//   SEARCH_API_KEY     : clé Brave Search (https://brave.com/search/api/) OU clé Google API
//   SEARCH_PROVIDER    : "brave" (défaut) ou "google"
//   GOOGLE_CSE_CX      : (si provider google) l'ID du moteur de recherche programmable
//   SEARCH_SOURCE_LABEL: "web" (défaut, logo globe) ou "google" (logo Google officiel)
const SEARCH_API_KEY   = Deno.env.get("SEARCH_API_KEY") || Deno.env.get("BRAVE_API_KEY") || "";
const SEARCH_PROVIDER  = (Deno.env.get("SEARCH_PROVIDER") || "brave").toLowerCase();
const GOOGLE_CSE_CX    = Deno.env.get("GOOGLE_CSE_CX") || "";
const SEARCH_SOURCE    = (Deno.env.get("SEARCH_SOURCE_LABEL") || (SEARCH_PROVIDER === "google" ? "google" : "web")).toLowerCase();

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "https://ti-lex-v10.vercel.app",
  "https://ti-lex-al.vercel.app",
  "https://ti-lex-al.com",
  "https://www.ti-lex-al.com",
];
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "vercel.app" || host.endsWith(".vercel.app")) return true;
  } catch { return false; }
  return false;
}
const PROTECTED_PATHS: RegExp[] = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)vercel\.json$/i,
  /(^|\/)\.github\//i,
  /supabase\/functions\/auth-/i,
  /supabase\/functions\/stripe/i,
  /supabase\/functions\/agent-al/i,
  /(^|\/)config\.toml$/i,
  /(^|\/)\.git\//i,
];
function isProtected(path: string): boolean {
  return PROTECTED_PATHS.some((re) => re.test(path));
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
function corsFor(origin: string | null) {
  const allow = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
async function getCallerId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const c = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data } = await c.auth.getUser();
  return data?.user?.id ?? null;
}
async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key, p_max: max, p_window_seconds: windowSec,
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}
async function logInjection(
  userId: string | null, path: string, message: unknown,
  pinOk: boolean, scopeOk: boolean, success: boolean, result: string,
) {
  try {
    await admin.from("injection_audit").insert({
      user_id: userId, path, message: message ? String(message) : null,
      pin_ok: pinOk, scope_ok: scopeOk, success, result,
    });
  } catch (_) { /* silencieux */ }
}
const ghHeaders = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "ti-lex-AL",
};
async function githubTree(): Promise<string[]> {
  const r = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/git/trees/${GH_BRANCH}?recursive=1`,
    { headers: ghHeaders },
  );
  if (!r.ok) return [];
  const j = await r.json();
  return (j.tree || []).filter((t: any) => t.type === "blob").map((t: any) => t.path);
}
async function githubRead(path: string): Promise<string> {
  const r = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}?ref=${GH_BRANCH}`,
    { headers: ghHeaders },
  );
  if (!r.ok) return `Erreur lecture ${path} (${r.status})`;
  const j = await r.json();
  try { return atob(j.content.replace(/\n/g, "")); }
  catch { return `Contenu illisible pour ${path}`; }
}
async function githubCommit(path: string, code: string, message: string): Promise<string> {
  let sha: string | undefined;
  const cur = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}?ref=${GH_BRANCH}`,
    { headers: ghHeaders },
  );
  if (cur.ok) { const j = await cur.json(); sha = j.sha; }
  const body: Record<string, unknown> = {
    message: message || `AL: maj ${path}`,
    content: btoa(unescape(encodeURIComponent(code))),
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`,
    { method: "PUT", headers: { ...ghHeaders, "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!r.ok) return `Erreur commit ${path} (${r.status})`;
  return `✅ ${path} poussé sur ${GH_BRANCH}`;
}
async function supabaseContext() {
  const { count } = await admin.from("cerveau_notes").select("*", { count: "exact", head: true });
  const { data: notes } = await admin
    .from("cerveau_notes").select("title,tags,created_at")
    .order("created_at", { ascending: false }).limit(15);
  return { notes_count: count ?? 0, recent_notes: notes ?? [] };
}

// [WEB] Vraie recherche web (Brave par défaut, ou Google CSE). Cite titre + url + extrait.
async function webSearch(query: string, count = 5): Promise<string> {
  if (!SEARCH_API_KEY) return "Recherche web non configurée (aucune clé SEARCH_API_KEY).";
  try {
    if (SEARCH_PROVIDER === "google") {
      const u = new URL("https://www.googleapis.com/customsearch/v1");
      u.searchParams.set("key", SEARCH_API_KEY);
      u.searchParams.set("cx", GOOGLE_CSE_CX);
      u.searchParams.set("q", query);
      u.searchParams.set("num", String(Math.min(count, 10)));
      const r = await fetch(u);
      if (!r.ok) return `Erreur recherche Google (${r.status})`;
      const j = await r.json();
      return (j.items || []).slice(0, count)
        .map((it: any, i: number) => `${i + 1}. ${it.title}\n   ${it.link}\n   ${it.snippet || ""}`)
        .join("\n") || "Aucun résultat.";
    }
    // Brave Search (défaut)
    const u = new URL("https://api.search.brave.com/res/v1/web/search");
    u.searchParams.set("q", query);
    u.searchParams.set("count", String(Math.min(count, 10)));
    const r = await fetch(u, { headers: { "X-Subscription-Token": SEARCH_API_KEY, "Accept": "application/json" } });
    if (!r.ok) return `Erreur recherche Brave (${r.status})`;
    const j = await r.json();
    const items = j?.web?.results || [];
    return items.slice(0, count)
      .map((it: any, i: number) => `${i + 1}. ${it.title}\n   ${it.url}\n   ${it.description || ""}`)
      .join("\n") || "Aucun résultat.";
  } catch (e) {
    return "Erreur recherche web : " + (e as Error).message;
  }
}

const TOOLS = [
  { name: "github_read_file", description: "Lit un fichier du repo ti-lex-v10 (branche supabase).",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "github_list_files", description: "Liste tous les fichiers du repo.",
    input_schema: { type: "object", properties: {} } },
  { name: "supabase_query", description: "Lit des lignes d'une table Supabase (lecture seule).",
    input_schema: { type: "object", properties: { table: { type: "string" }, limit: { type: "number" } }, required: ["table"] } },
  // [WEB] N'est exposé à l'agent QUE si une clé de recherche est configurée.
  ...(SEARCH_API_KEY ? [{
    name: "web_search",
    description: "Recherche sur le web (actualités, faits récents, prix, docs récentes). Renvoie titres, URLs et extraits. Cite toujours tes sources (titre + URL).",
    input_schema: { type: "object", properties: { query: { type: "string" }, count: { type: "number" } }, required: ["query"] },
  }] : []),
];

// [SOURCES] À quel moteur/logo correspond chaque outil réellement appelé.
function toolSource(name: string): string | null {
  if (name === "github_read_file" || name === "github_list_files") return "github";
  if (name === "supabase_query") return "supabase";
  if (name === "web_search") return SEARCH_SOURCE; // "web" ou "google" selon la config
  return null;
}

// [SOURCES] Estimation initiale d'après la question (avant que les outils tournent),
// pour afficher un logo tout de suite. La vérité confirmée arrive ensuite (confirmed:true).
function detectSources(text: string): string[] {
  const t = " " + (text || "").toLowerCase() + " ";
  const s = new Set<string>();
  if (SEARCH_API_KEY && /cherche|recherch|google|sur le web|internet|en ligne|actualit|nouvelle|m[ée]t[ée]o|aujourd|dernier|r[ée]cent|http|www\.|\.com|\.ca|prix de|cours de/.test(t)) s.add(SEARCH_SOURCE);
  if (/supabase|base de donn|\bsql\b|\btable\b|sch[ée]ma|postgres|migration|colonne|requ[êe]te/.test(t)) s.add("supabase");
  if (/github|\brepo\b|d[ée]p[ôo]t|commit|branche|fichier|code source/.test(t)) s.add("github");
  return [...s];
}

async function runTool(name: string, input: any): Promise<string> {
  if (name === "github_read_file") return await githubRead(input.path);
  if (name === "github_list_files") return (await githubTree()).join("\n");
  if (name === "supabase_query") {
    const { data, error } = await admin.from(input.table).select("*").limit(input.limit ?? 10);
    if (error) return `Erreur: ${error.message}`;
    return JSON.stringify(data, null, 2);
  }
  if (name === "web_search") return await webSearch(input.query, input.count ?? 5); // [WEB]
  return "Outil inconnu.";
}
// ⚡ Prompt caching — breakpoint sur le dernier message (cache l'historique).
//    Clone-based : ne mute jamais le tableau source (réutilisé dans la boucle d'outils).
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
    return messages;
  }
  copie[copie.length - 1] = dernier;
  return copie;
}

async function callAnthropic(messages: any[], system: any, model: string = MODEL) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    // system = tableau de blocs (stable caché + contexte variable) ; le breakpoint
    // sur le bloc stable met AUSSI les outils (TOOLS) en cache (ordre tools → system).
    body: JSON.stringify({ model, max_tokens: 4000, system, tools: TOOLS, messages: marquerDernierMessageCache(messages) }),
  });
  return await r.json();
}
function buildSystem(ctx: any): any[] {
  const files = (ctx?.github?.files || []).slice(0, 200).join("\n");
  const notes = (ctx?.supabase?.recent_notes || [])
    .map((n: any) => `- ${n.title} [${(n.tags || []).join(", ")}]`).join("\n");
  // Partie STABLE (persona + règles + tokens) → mise en cache Anthropic.
  const stable = [
    "Tu es AL, l'agent autonome central de ti-lex v10 (cybersécurité, Québec ⚜️).",
    "Tu es déjà connecté au projet : repo GitHub ti-lex-v10 (branche supabase) et base Supabase.",
    "Réponds dans la langue de l'utilisateur ; par défaut français québécois, direct et concret.",
    "Pour du code à appliquer, utilise EXACTEMENT ce format, un bloc par fichier :",
    "INJECT: chemin/du/fichier.ext", "```", "<code complet>", "```",
    "Pas de placeholder. Vanilla HTML/CSS/JS uniquement (jamais React/JSX).",
    "Tokens ti-lex : fond #0a0a0a, orange #ff7f27, vert #37e0a0, gold #E6A400, rouge #E60000, bleu #4a9eff, violet #C700E6, JetBrains Mono.",
  ].join("\n");
  // Partie VARIABLE (contexte projet : fichiers + notes) → PAS de cache (change souvent).
  const variable = [
    "--- CONTEXTE PROJET ---",
    `Fichiers (${(ctx?.github?.files || []).length}) :`, files || "(indisponible)",
    "", `Notes (${ctx?.supabase?.notes_count ?? 0}) :`, notes || "(aucune)",
  ].join("\n");
  const blocs: any[] = [{ type: "text", text: stable, cache_control: { type: "ephemeral" } }];
  if (variable.trim()) blocs.push({ type: "text", text: variable });
  return blocs;
}
// 🔍 Niveau 6 — Enquête automatique (analyse la demande AVANT exécution)
const THREAT_PATTERNS: { re: RegExp; tag: string; severity: "block" | "warn" }[] = [
  { re: /ignore\s+(all\s+)?(previous|prior|above|preceding)\s+(instructions?|prompts?|rules?)/i, tag: "prompt-injection", severity: "block" },
  { re: /you\s+are\s+now\s+(a|an|the)\b/i, tag: "identity-hijack", severity: "block" },
  { re: /act\s+as\s+(if\s+)?you\s+(have\s+no|don.?t\s+have)\s+(restrictions?|limits?|rules?)/i, tag: "jailbreak", severity: "block" },
  { re: /system\s*prompt|repeat\s+(your|the)\s+(instructions?|system|prompt)/i, tag: "system-leak", severity: "block" },
  { re: /oublie\s+(tes|les|toutes?\s+les)\s+(instructions?|r[eè]gles?|consignes?)/i, tag: "prompt-injection-fr", severity: "block" },
  { re: /\b(service.?role|ANTHROPIC.?API.?KEY|AL.?INJECT.?PIN|INJECT.?PIN|secret.?key|private.?key)\b/i, tag: "secret-exfil", severity: "block" },
  { re: /\b(r[eé]v[eè]le|affiche|montre|donne|print|log|echo|expose)\b.{0,30}\b(nip|pin|mot\s+de\s+passe|password|secret|cl[eé]\s+priv)/i, tag: "credential-request", severity: "block" },
  { re: /Deno\.env\.get/i, tag: "env-access", severity: "block" },
  { re: /\b(drop\s+(table|database|schema)|truncate\s+table|delete\s+from\s+\w+\s*;?\s*$|rm\s+-rf)\b/i, tag: "destructive-sql", severity: "block" },
  { re: /\b(supprimer?\s+(toutes?|la\s+base|tout)|efface[r]?\s+tout|d[eé]truire?\s+(la\s+base|tout))\b/i, tag: "destructive-fr", severity: "block" },
  { re: /\b(grant\s+all|alter\s+role|set\s+role|security\s+definer|superuser|bypass\s+rls)\b/i, tag: "privilege-escalation", severity: "block" },
  { re: /\b(d[eé]sactiver?\s+(rls|s[eé]curit[eé]|auth)|disable\s+(rls|security|auth))\b/i, tag: "security-disable", severity: "block" },
  { re: /\bselect\s+\*\s+from\s+(auth\.|pg_)/i, tag: "auth-table-read", severity: "block" },
  { re: /\b(exporter?|dump|backup)\b.{0,20}\b(users?|auth|credentials?|passwords?)\b/i, tag: "data-exfil", severity: "warn" },
];

interface ThreatResult {
  safe: boolean;
  blocked: boolean;
  threats: { tag: string; severity: string }[];
}

function enquete(text: string): ThreatResult {
  const threats: { tag: string; severity: string }[] = [];
  for (const p of THREAT_PATTERNS) {
    if (p.re.test(text)) {
      threats.push({ tag: p.tag, severity: p.severity });
    }
  }
  const blocked = threats.some((t) => t.severity === "block");
  return { safe: threats.length === 0, blocked, threats };
}

async function logThreat(userId: string | null, question: string, result: ThreatResult) {
  try {
    await admin.from("injection_audit").insert({
      user_id: userId,
      path: "chat/enquete",
      message: question.slice(0, 500),
      pin_ok: false,
      scope_ok: !result.blocked,
      success: !result.blocked,
      result: result.threats.map((t) => `${t.severity}:${t.tag}`).join(", "),
    });
  } catch (_) { /* silencieux */ }
}

function json(obj: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const CORS = corsFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const callerId = await getCallerId(req);
  if (callerId !== OWNER_USER_ID) {
    return json({ error: "Accès réservé au propriétaire ti-lex. Connecte-toi avec ton compte." }, 403, CORS);
  }
  let payload: any;
  try { payload = await req.json(); }
  catch (e) {
    console.log("[agent-al] DIAG JSON invalide:", req.method, "ct=", req.headers.get("content-type"), "err=", (e as Error).message);
    return json({ error: "JSON invalide" }, 400, CORS);
  }
  // 🔎 DIAG : trace l'action reçue pour diagnostiquer les 400 "Action inconnue"
  console.log("[agent-al] DIAG action=", JSON.stringify(payload?.action), "keys=", Object.keys(payload || {}).join(","));
  const action = payload.action;
  if (action === "auto_connect") {
    const [files, sb] = await Promise.all([githubTree(), supabaseContext()]);
    return json({ github: { owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH, files }, supabase: sb, ready: true }, 200, CORS);
  }
  if (action === "commit") {
    const path = String(payload.path ?? "");
    const within = await rateLimit(`inject_pin:${callerId}`, 10, 300);
    if (!within) {
      await logInjection(callerId, path, payload.message, false, false, false, "rate-limited");
      return json({ error: "Trop d'essais de NIP. Réessaie dans 5 minutes." }, 429, CORS);
    }
    if (isProtected(path)) {
      await logInjection(callerId, path, payload.message, false, false, false, "fichier protégé");
      return json({ error: `Fichier protégé : AL ne peut pas modifier « ${path} ».` }, 403, CORS);
    }
    const pinOk = !!INJECT_PIN && String(payload.pin ?? "") === INJECT_PIN;
    if (!pinOk) {
      await logInjection(callerId, path, payload.message, false, true, false, "NIP invalide");
      return json({ error: "NIP invalide. Injection refusée." }, 403, CORS);
    }
    const resultMsg = await githubCommit(path, payload.code, payload.message || "");
    const success = resultMsg.startsWith("✅");
    await logInjection(callerId, path, payload.message, true, true, success, resultMsg);
    return json({ result: resultMsg }, 200, CORS);
  }
  if (action === "chat") {
    // 🔍 Niveau 6 — Enquête automatique avant traitement
    const question = payload.question || "";
    const fullInput = [question, ...(payload.history || []).map((m: any) => m.text ?? m.content ?? "")].join(" ");
    const threat = enquete(fullInput);
    if (!threat.safe) {
      await logThreat(callerId, question, threat);
    }
    if (threat.blocked) {
      const tags = threat.threats.filter((t) => t.severity === "block").map((t) => t.tag).join(", ");
      return json({
        error: `🛡️ Enquête automatique — demande bloquée.\nMenace détectée : ${tags}.\nCette tentative a été journalisée.`,
        threat_tags: threat.threats,
      }, 403, CORS);
    }
    // 🤖 Modèle demandé par le front (sélecteur de la console web). Un modèle
    //    inconnu retombe sur le défaut au lieu de planter l'appel Anthropic.
    const modele = choisirModele(payload.model);
    if (payload.model && modele !== payload.model) {
      console.log("[agent-al] modèle refusé:", JSON.stringify(payload.model), "→", modele);
    }
    const system = buildSystem(payload.projectContext || {});
    const history = (payload.history || []).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user", content: m.text ?? m.content ?? "",
    }));
    const messages = [...history];
    if (payload.question) messages.push({ role: "user", content: payload.question });
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        try {
          // [SOURCES] 1) Estimation immédiate -> le front affiche un logo tout de suite.
          // Le front affiche quel modèle répond (pis voit si sa demande a été refusée).
          send({ type: "modele", modele, demande: payload.model ?? null });
          const usedSources = new Set<string>();
          const initial = detectSources(question);
          if (initial.length) send({ type: "sources", sources: initial, confirmed: false });

          let guard = 0;
          while (guard++ < 6) {
            const resp = await callAnthropic(messages, system, modele);
            if (resp.error) { send({ type: "token", text: "⚠️ " + (resp.error.message || "Erreur API") }); break; }
            if (resp.stop_reason === "tool_use") {
              messages.push({ role: "assistant", content: resp.content });
              const toolResults: any[] = [];
              for (const block of resp.content) {
                if (block.type === "tool_use") {
                  send({ type: "status", text: `AL utilise ${block.name}…` });
                  // [SOURCES] 2) Moteur RÉELLEMENT appelé -> on note la vraie source.
                  const src = toolSource(block.name);
                  if (src) usedSources.add(src);
                  const out = await runTool(block.name, block.input);
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
                }
              }
              // [SOURCES] 3) On confirme au front les vrais logos (confirmed:true).
              if (usedSources.size) send({ type: "sources", sources: [...usedSources], confirmed: true });
              messages.push({ role: "user", content: toolResults });
              continue;
            }
            const finalText = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
            for (const w of finalText.split(/(\s+)/)) send({ type: "token", text: w });
            break;
          }
        } catch (e) {
          send({ type: "token", text: "⚠️ " + (e as Error).message });
        } finally {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }
  console.log("[agent-al] DIAG action inconnue reçue:", JSON.stringify(payload?.action));
  return json({ error: "Action inconnue", received_action: payload?.action ?? null, expected: ["auto_connect", "commit", "chat"] }, 400, CORS);
});
