// ti-lex v10 — Edge Function agent-al — NIVEAU MAX (7 couches)
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
// ⚡ Prompt caching : le prompt système stable + les outils sont mis en cache.
//
// [007] Action "chat_simple" (réponse JSON, pas de stream) pour l'app mobile
// ti-lex-007. [MEDIA] outil recherche_media (photos/vidéos Pexels). Ces ajouts
// sont purement additifs ; les actions auto_connect / commit / chat sont intactes.
//
// [MEMOIRE] AL a maintenant une vraie mémoire long terme :
//   - toutes les notes du cerveau (contenu complet, plus juste titre/tags)
//   - l'historique récent des conversations (table al_messages, déjà remplie
//     avec 1000+ messages qui n'étaient jamais relus par AL avant ce patch)
//   - des résumés long terme compacts (table al_memory_summary), générés
//     automatiquement en arrière-plan (EdgeRuntime.waitUntil) quand assez de
//     nouveaux messages se sont accumulés, ou à la demande via l'action
//     "consolidate_memory"
//   - un outil rechercher_memoire pour fouiller notes + conversations + résumés
//   - un outil sauvegarder_note pour qu'AL puisse écrire un gros document/
//     rapport directement dans le cerveau (cerveau_notes)
//   - max_tokens monte de 4000 à 8192 pour permettre de gros fichiers/documents
//
// [MODELE] Le front peut choisir le modèle Claude (sélecteur de la console web).
//   Un modèle absent ou inconnu retombe sur MODEL — voir MODELES_PERMIS.
// Repères des ajouts :  // [SOURCES]  // [WEB]  // [007]  // [MEDIA]  // [MEMOIRE]  // [MODELE]
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
// [MODELE] Modèle par défaut : utilisé si le front en demande pas, ou en demande un inconnu.
const MODEL     = "claude-sonnet-4-6";
// [MODELE] Modèles que le front a le droit de demander — même liste que ai-proxy.
const MODELES_PERMIS = new Set([
  // Génération courante (la plus récente en premier).
  "claude-fable-5-1", "claude-opus-5", "claude-sonnet-5",
  // Génération précédente, encore servie.
  "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6",
  // Haiku 4.5 : l'ID officiel, pis le vieil ID daté que des pages envoient encore.
  "claude-haiku-4-5", "claude-haiku-4-5-20251001",
]);
/** [MODELE] Renvoie le modèle demandé s'il est dans la liste permise, sinon le défaut. */
function choisirModele(demande: unknown): string {
  const m = typeof demande === "string" ? demande.trim() : "";
  return MODELES_PERMIS.has(m) ? m : MODEL;
}

// [MEMOIRE] Réglages de la mémoire long terme.
const MAX_TOKENS = 8192; // avant : 4000 — permet à AL de construire de gros fichiers/documents complets
const MEMORY_RECENT_CHAR_BUDGET = 45000;      // budget (caractères) pour les messages récents inclus tels quels
const MEMORY_NOTES_CHAR_BUDGET  = 120000;     // budget (caractères) pour le contenu des notes du cerveau
const MEMORY_NOTE_MAX_CHARS     = 4000;       // troncature défensive par note individuelle
const CONSOLIDATE_BATCH_CHAR_BUDGET = 150000; // taille max d'un lot résumé en une passe
const CONSOLIDATE_MIN_MESSAGES  = 20;         // pas la peine de consolider en bas de ce seuil
const AUTO_CONSOLIDATE_THRESHOLD = 200;       // déclenche une consolidation auto en arrière-plan

// [WEB] Recherche web OPTIONNELLE — activée seulement si une clé est fournie.
const SEARCH_API_KEY   = Deno.env.get("SEARCH_API_KEY") || Deno.env.get("BRAVE_API_KEY") || "";
const SEARCH_PROVIDER  = (Deno.env.get("SEARCH_PROVIDER") || "brave").toLowerCase();
const GOOGLE_CSE_CX    = Deno.env.get("GOOGLE_CSE_CX") || "";
const SEARCH_SOURCE    = (Deno.env.get("SEARCH_SOURCE_LABEL") || (SEARCH_PROVIDER === "google" ? "google" : "web")).toLowerCase();

// [MEDIA] Recherche de photos/vidéos libres — activée seulement si une clé Pexels est fournie.
const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY") || "";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "https://ti-lex-v10.vercel.app",
  "https://ti-lex-al.vercel.app",
  "https://ti-lex-al.com",
  "https://www.ti-lex-al.com",
  "https://alexmarceauprevost812-source.github.io",
];
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "vercel.app" || host.endsWith(".vercel.app")) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
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

// [MEMOIRE] Lance une promesse en arrière-plan sans bloquer la réponse HTTP,
// en utilisant EdgeRuntime.waitUntil si disponible (runtime Supabase Edge),
// sinon on laisse juste rouler la promesse (au pire elle peut être coupée
// tôt si l'instance se recycle — la mémoire ne doit jamais bloquer une
// réponse à l'utilisateur, donc on tolère cette perte occasionnelle).
function background(p: Promise<any>) {
  const safe = p.catch((e) => {
    console.log("[agent-al] tâche de fond en erreur:", (e as Error)?.message);
  });
  try {
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(safe);
  } catch (_) { /* pas grave */ }
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
  const [{ count: notesCount }, { data: notes }, { count: msgCount }, { count: sumCount }] = await Promise.all([
    admin.from("cerveau_notes").select("*", { count: "exact", head: true }),
    admin.from("cerveau_notes").select("title,tags,created_at").order("created_at", { ascending: false }).limit(15),
    admin.from("al_messages").select("*", { count: "exact", head: true }),
    admin.from("al_memory_summary").select("*", { count: "exact", head: true }),
  ]);
  return {
    notes_count: notesCount ?? 0,
    recent_notes: notes ?? [],
    // [MEMOIRE] compteurs additifs — n'importe quel ancien front continue de marcher (champs ignorés).
    memory_messages_count: msgCount ?? 0,
    memory_summaries_count: sumCount ?? 0,
  };
}

// [MEMOIRE] ---- Construction du bloc mémoire long terme injecté dans le system prompt ----
async function getFullNotes(limit = 200): Promise<any[]> {
  const { data, error } = await admin
    .from("cerveau_notes")
    .select("title,content,tags,summary,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return error || !data ? [] : data;
}
async function getMemorySummaries(limit = 30): Promise<any[]> {
  const { data, error } = await admin
    .from("al_memory_summary")
    .select("summary,period_start,period_end")
    .eq("user_id", OWNER_USER_ID)
    .order("period_start", { ascending: true })
    .limit(limit);
  return error || !data ? [] : data;
}
async function getRecentMessages(charBudget = MEMORY_RECENT_CHAR_BUDGET): Promise<any[]> {
  const { data, error } = await admin
    .from("al_messages")
    .select("role,content,created_at")
    .eq("user_id", OWNER_USER_ID)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error || !data) return [];
  const picked: any[] = [];
  let used = 0;
  for (const m of data) {
    const len = (m.content || "").length;
    if (used + len > charBudget && picked.length > 0) break;
    picked.push(m);
    used += len;
  }
  return picked.reverse(); // ordre chronologique pour la lecture
}
async function buildMemoryText(): Promise<string> {
  const [notes, summaries, recent] = await Promise.all([
    getFullNotes(), getMemorySummaries(), getRecentMessages(),
  ]);
  const parts: string[] = [];
  if (summaries.length) {
    parts.push(
      "--- MÉMOIRE LONG TERME (résumés de conversations passées) ---\n" +
        summaries
          .map((s: any) =>
            `[${new Date(s.period_start).toLocaleDateString("fr-CA")} → ${new Date(s.period_end).toLocaleDateString("fr-CA")}] ${s.summary}`
          )
          .join("\n\n"),
    );
  }
  if (notes.length) {
    let used = 0;
    const lines: string[] = [];
    for (const n of notes) {
      const content = String(n.content || "").slice(0, MEMORY_NOTE_MAX_CHARS);
      const line = `- ${n.title} [${(n.tags || []).join(", ")}] (${new Date(n.created_at).toLocaleDateString("fr-CA")})\n  ${content}${n.summary ? `\n  Résumé: ${n.summary}` : ""}`;
      if (used + line.length > MEMORY_NOTES_CHAR_BUDGET) break;
      lines.push(line);
      used += line.length;
    }
    parts.push(`--- NOTES DU CERVEAU (${notes.length} au total) ---\n` + lines.join("\n"));
  }
  if (recent.length) {
    parts.push(
      "--- CONVERSATION RÉCENTE (mémoire à court terme) ---\n" +
        recent.map((m: any) => `${m.role === "assistant" ? "AL" : "Alex"}: ${m.content}`).join("\n"),
    );
  }
  return parts.join("\n\n");
}
async function saveMessagePair(sessionId: string, userText: string, assistantText: string) {
  try {
    const rows: any[] = [];
    if (userText && userText.trim()) {
      rows.push({ user_id: OWNER_USER_ID, session_id: sessionId, role: "user", content: userText.slice(0, 100000) });
    }
    if (assistantText && assistantText.trim()) {
      rows.push({ user_id: OWNER_USER_ID, session_id: sessionId, role: "assistant", content: assistantText.slice(0, 100000) });
    }
    if (rows.length) await admin.from("al_messages").insert(rows);
  } catch (e) {
    console.log("[agent-al] échec sauvegarde mémoire:", (e as Error)?.message);
  }
}
async function consolidateMemory(): Promise<Record<string, unknown>> {
  const { data: lastSum } = await admin
    .from("al_memory_summary")
    .select("period_end")
    .eq("user_id", OWNER_USER_ID)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  const since = lastSum?.period_end ?? "1970-01-01";
  const { data: msgs, error } = await admin
    .from("al_messages")
    .select("role,content,created_at")
    .eq("user_id", OWNER_USER_ID)
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(400);
  if (error) return { skipped: true, reason: error.message };
  if (!msgs || msgs.length < CONSOLIDATE_MIN_MESSAGES) {
    return { skipped: true, reason: "pas assez de nouveaux messages pour consolider", available: msgs?.length ?? 0 };
  }
  let used = 0;
  const batch: any[] = [];
  for (const m of msgs) {
    const len = (m.content || "").length;
    if (used + len > CONSOLIDATE_BATCH_CHAR_BUDGET && batch.length > 0) break;
    batch.push(m);
    used += len;
  }
  const periodStart = batch[0].created_at;
  const periodEnd = batch[batch.length - 1].created_at;
  const transcript = batch.map((m: any) => `${m.role === "assistant" ? "AL" : "Alex"}: ${m.content}`).join("\n\n");
  const resp = await callAnthropic(
    [{
      role: "user",
      content:
        "Voici un extrait de conversation entre Alex et Agent AL (ti-lex). Résume-le en mémoire long terme dense et utile : décisions prises, faits durables, préférences d'Alex, projets en cours, choses à retenir pour plus tard. Pas de blabla, juste l'essentiel en points concis.\n\n" +
        transcript,
    }],
    "Tu es un résumeur de mémoire pour Agent AL. Sois dense, factuel, concis, en français québécois.",
    [],
    1500,
  );
  const summary = (resp?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  if (!summary) return { skipped: true, reason: "résumé vide (erreur API Anthropic?)" };
  const { error: insErr } = await admin.from("al_memory_summary").insert({
    user_id: OWNER_USER_ID, summary, period_start: periodStart, period_end: periodEnd,
  });
  if (insErr) return { skipped: true, reason: insErr.message };
  await logAction(null, "memory_consolidation", { since }, { messages: batch.length }, "ok", null);
  return { skipped: false, messages_summarized: batch.length, period_start: periodStart, period_end: periodEnd };
}
async function maybeAutoConsolidate() {
  try {
    const { data: lastSum } = await admin
      .from("al_memory_summary")
      .select("period_end")
      .eq("user_id", OWNER_USER_ID)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    const since = lastSum?.period_end ?? "1970-01-01";
    const { count } = await admin
      .from("al_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", OWNER_USER_ID)
      .gt("created_at", since);
    if ((count ?? 0) >= AUTO_CONSOLIDATE_THRESHOLD) {
      await consolidateMemory();
    }
  } catch (e) {
    console.log("[agent-al] auto-consolidation en erreur:", (e as Error)?.message);
  }
}
async function logAction(
  convId: string | null, actionType: string, input: unknown, result: unknown,
  status: string, errorDetail: string | null, durationMs?: number,
) {
  try {
    await admin.from("al_actions_log").insert({
      user_id: OWNER_USER_ID, conv_id: convId, action_type: actionType,
      action_input: input ?? null, action_result: result ?? null,
      status, error_detail: errorDetail, duration_ms: durationMs ?? null,
    });
  } catch (_) { /* silencieux */ }
}

// [WEB] Vraie recherche web (Brave par défaut, ou Google CSE).
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

// [MEDIA] Recherche Pexels (photos ou vidéos), normalisée pour la galerie.
async function rechercheMedia(query: string, type: "photo" | "video"): Promise<any[]> {
  if (!PEXELS_API_KEY || !query.trim()) return [];
  try {
    const base = type === "video" ? "https://api.pexels.com/videos/search" : "https://api.pexels.com/v1/search";
    const r = await fetch(`${base}?query=${encodeURIComponent(query)}&per_page=8&locale=fr-FR`, {
      headers: { Authorization: PEXELS_API_KEY },
    });
    if (!r.ok) return [];
    const j = await r.json();
    if (type === "video") {
      return (j.videos || []).map((m: any) => {
        const vf = (m.video_files || []).find((f: any) => f.quality === "sd") || (m.video_files || [])[0] || {};
        return { kind: "video", thumb: m.image, full: vf.link || "", credit: `Vidéo par ${m.user?.name ?? "?"} / Pexels`, link: m.url };
      }).filter((it: any) => it.full);
    }
    return (j.photos || []).map((m: any) => ({
      kind: "image", thumb: m.src?.medium, full: m.src?.large2x || m.src?.large || m.src?.original,
      credit: `Photo par ${m.photographer ?? "?"} / Pexels`, link: m.url,
    })).filter((it: any) => it.thumb);
  } catch (_) {
    return [];
  }
}

const TOOLS = [
  { name: "github_read_file", description: "Lit un fichier du repo ti-lex-v10 (branche supabase).",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "github_list_files", description: "Liste tous les fichiers du repo.",
    input_schema: { type: "object", properties: {} } },
  { name: "supabase_query", description: "Lit des lignes d'une table Supabase (lecture seule).",
    input_schema: { type: "object", properties: { table: { type: "string" }, limit: { type: "number" } }, required: ["table"] } },
  // [MEMOIRE] Outils de mémoire — toujours disponibles (pas besoin de clé externe).
  { name: "sauvegarder_note",
    description: "Sauvegarde un document, rapport ou résultat directement dans le cerveau d'Alex (cerveau_notes), comme une nouvelle note. Utilise ça quand on te demande de garder/sauvegarder quelque chose, ou quand tu produis un gros document qui mérite d'être conservé.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre court de la note" },
        content: { type: "string", description: "Contenu complet à sauvegarder (peut être long)" },
        tags: { type: "array", items: { type: "string" }, description: "Tags optionnels" },
      },
      required: ["title", "content"],
    } },
  { name: "rechercher_memoire",
    description: "Cherche dans TOUTE la mémoire d'Alex — notes du cerveau, historique de conversations, résumés long terme — pour retrouver quelque chose de précis qui n'est pas déjà dans ton contexte immédiat.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Mots-clés à chercher" } },
      required: ["query"],
    } },
  ...(SEARCH_API_KEY ? [{
    name: "web_search",
    description: "Recherche sur le web (actualités, faits récents, prix, docs récentes). Cite toujours tes sources (titre + URL).",
    input_schema: { type: "object", properties: { query: { type: "string" }, count: { type: "number" } }, required: ["query"] },
  }] : []),
  ...(PEXELS_API_KEY ? [{
    name: "recherche_media",
    description: "Cherche des photos ou des vidéos libres de droits (Pexels) quand l'utilisateur veut VOIR des images ou des vidéos. L'app affiche automatiquement la galerie — contente-toi de présenter brièvement ce que tu as trouvé.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Mots-clés de recherche" }, type: { type: "string", enum: ["photo", "video"] } }, required: ["query"] },
  }] : []),
];

function toolSource(name: string): string | null {
  if (name === "github_read_file" || name === "github_list_files") return "github";
  if (name === "supabase_query" || name === "sauvegarder_note" || name === "rechercher_memoire") return "supabase";
  if (name === "web_search") return SEARCH_SOURCE;
  return null;
}

function detectSources(text: string): string[] {
  const t = " " + (text || "").toLowerCase() + " ";
  const s = new Set<string>();
  if (SEARCH_API_KEY && /cherche|recherch|google|sur le web|internet|en ligne|actualit|nouvelle|m[ée]t[ée]o|aujourd|dernier|r[ée]cent|http|www\.|\.com|\.ca|prix de|cours de/.test(t)) s.add(SEARCH_SOURCE);
  if (/supabase|base de donn|\bsql\b|\btable\b|sch[ée]ma|postgres|migration|colonne|requ[êe]te|souviens|rappelle|m[ée]moire|mes notes/.test(t)) s.add("supabase");
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
  // [MEMOIRE] Écriture/lecture dans le cerveau et la mémoire de conversation.
  if (name === "sauvegarder_note") {
    const title = String(input?.title ?? "").slice(0, 200) || "Sans titre";
    const content = String(input?.content ?? "");
    const tags = Array.isArray(input?.tags) ? input.tags.map((t: any) => String(t).toLowerCase()).slice(0, 20) : [];
    if (!content.trim()) return "Erreur: contenu vide, rien à sauvegarder.";
    const { data, error } = await admin
      .from("cerveau_notes")
      .insert({ user_id: OWNER_USER_ID, title, content, tags })
      .select("id")
      .single();
    if (error) return `Erreur sauvegarde note: ${error.message}`;
    return `✅ Note sauvegardée dans le cerveau (id ${data.id}) — "${title}", ${content.length} caractères.`;
  }
  if (name === "rechercher_memoire") {
    const q = String(input?.query ?? "").trim();
    if (!q) return "Erreur: aucune requête de recherche fournie.";
    const like = `%${q}%`;
    const [byTitle, byContent, msgs, sums] = await Promise.all([
      admin.from("cerveau_notes").select("id,title,content,created_at").ilike("title", like).order("created_at", { ascending: false }).limit(6),
      admin.from("cerveau_notes").select("id,title,content,created_at").ilike("content", like).order("created_at", { ascending: false }).limit(6),
      admin.from("al_messages").select("role,content,created_at").eq("user_id", OWNER_USER_ID).ilike("content", like).order("created_at", { ascending: false }).limit(8),
      admin.from("al_memory_summary").select("summary,period_start,period_end").eq("user_id", OWNER_USER_ID).ilike("summary", like).order("period_start", { ascending: false }).limit(5),
    ]);
    const seen = new Set<string>();
    const notes = [...(byTitle.data || []), ...(byContent.data || [])].filter((n: any) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    }).slice(0, 8);
    const lines: string[] = [];
    if (notes.length) {
      lines.push("NOTES:\n" + notes.map((n: any) => `- [${new Date(n.created_at).toLocaleDateString("fr-CA")}] ${n.title}: ${String(n.content).slice(0, 200)}`).join("\n"));
    }
    if (msgs.data?.length) {
      lines.push("MESSAGES:\n" + msgs.data.map((m: any) => `- [${new Date(m.created_at).toLocaleDateString("fr-CA")}] (${m.role}) ${String(m.content).slice(0, 200)}`).join("\n"));
    }
    if (sums.data?.length) {
      lines.push("RÉSUMÉS:\n" + sums.data.map((s: any) => `- [${new Date(s.period_start).toLocaleDateString("fr-CA")} → ${new Date(s.period_end).toLocaleDateString("fr-CA")}] ${String(s.summary).slice(0, 300)}`).join("\n"));
    }
    return lines.length ? lines.join("\n\n") : "Aucun résultat pour cette recherche dans la mémoire.";
  }
  if (name === "web_search") return await webSearch(input.query, input.count ?? 5);
  if (name === "recherche_media") {
    const items = await rechercheMedia(String(input?.query ?? ""), input?.type === "video" ? "video" : "photo");
    return items.length
      ? items.map((it: any, i: number) => `${i + 1}. ${it.credit} — ${it.link}`).join("\n")
      : "Aucun média trouvé.";
  }
  return "Outil inconnu.";
}
// ⚡ Prompt caching — breakpoint sur le dernier message (cache l'historique).
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

// [MODELE] `model` en dernier paramètre : les anciens appels gardent MODEL.
async function callAnthropic(messages: any[], system: any, tools: any[] = TOOLS, maxTokens: number = MAX_TOKENS, model: string = MODEL) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, tools, messages: marquerDernierMessageCache(messages) }),
  });
  return await r.json();
}
function buildSystem(ctx: any, memoryText = ""): any[] {
  const files = (ctx?.github?.files || []).slice(0, 200).join("\n");
  const stable = [
    "Tu es AL, l'agent autonome central de ti-lex v10 (cybersécurité, Québec ⚜️).",
    "Tu es déjà connecté au projet : repo GitHub ti-lex-v10 (branche supabase) et base Supabase.",
    "Tu es polyvalent et très capable : tu peux discuter, analyser, écrire du code complet, rédiger de gros documents/rapports, et gérer la mémoire du cerveau d'Alex.",
    "MÉMOIRE : le bloc '--- MÉMOIRE LONG TERME / NOTES DU CERVEAU / CONVERSATION RÉCENTE ---' plus bas contient déjà tes résumés de conversations passées, toutes les notes du cerveau, et les derniers échanges. Sers-t'en directement, ne redemande pas cette information à Alex.",
    "GROS FICHIERS : n'hésite pas à produire de longues réponses complètes (code entier, documents longs, rapports détaillés) quand c'est ce qui est demandé — tu as beaucoup d'espace de sortie.",
    "Outil sauvegarder_note : utilise-le pour écrire un document/rapport/résultat directement dans le cerveau d'Alex quand on te demande de le garder, ou si c'est clairement utile à conserver.",
    "Outil rechercher_memoire : utilise-le si tu as besoin de retrouver quelque chose de précis qui n'est pas déjà dans le contexte fourni (vieille conversation, vieille note).",
    "Réponds dans la langue de l'utilisateur ; par défaut français québécois, direct et concret.",
    "Pour du code à appliquer, utilise EXACTEMENT ce format, un bloc par fichier :",
    "INJECT: chemin/du/fichier.ext", "```", "<code complet>", "```",
    "Pas de placeholder. Vanilla HTML/CSS/JS uniquement (jamais React/JSX).",
    "Tokens ti-lex : fond #0a0a0a, orange #ff7f27, vert #37e0a0, gold #E6A400, rouge #E60000, bleu #4a9eff, violet #C700E6, JetBrains Mono.",
  ].join("\n");
  const variable = [
    "--- CONTEXTE PROJET ---",
    `Fichiers (${(ctx?.github?.files || []).length}) :`, files || "(indisponible)",
  ].join("\n");
  const blocs: any[] = [{ type: "text", text: stable, cache_control: { type: "ephemeral" } }];
  if (variable.trim()) blocs.push({ type: "text", text: variable });
  if (memoryText && memoryText.trim()) blocs.push({ type: "text", text: memoryText, cache_control: { type: "ephemeral" } });
  return blocs;
}
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
  // [MEMOIRE] Consolidation à la demande (ou déclenchée en tâche de fond depuis "chat"/"chat_simple").
  if (action === "consolidate_memory") {
    const result = await consolidateMemory();
    return json(result, 200, CORS);
  }
  if (action === "chat") {
    const question = payload.question || "";
    const sessionId = String(payload.session_id || crypto.randomUUID());
    // [MODELE] Modèle demandé par le front (sélecteur de la console web).
    const modele = choisirModele(payload.model);
    if (payload.model && modele !== payload.model) {
      console.log("[agent-al] modèle refusé:", JSON.stringify(payload.model), "→", modele);
    }
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
    background(maybeAutoConsolidate());
    const memoryText = await buildMemoryText();
    const system = buildSystem(payload.projectContext || {}, memoryText);
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
          // [MODELE] Le front affiche quel modèle répond (et voit si sa demande a été refusée).
          send({ type: "modele", modele, demande: payload.model ?? null });
          const usedSources = new Set<string>();
          const initial = detectSources(question);
          if (initial.length) send({ type: "sources", sources: initial, confirmed: false });

          let guard = 0;
          while (guard++ < 10) {
            const resp = await callAnthropic(messages, system, TOOLS, MAX_TOKENS, modele);
            if (resp.error) { send({ type: "token", text: "⚠️ " + (resp.error.message || "Erreur API") }); break; }
            if (resp.stop_reason === "tool_use") {
              messages.push({ role: "assistant", content: resp.content });
              const toolResults: any[] = [];
              for (const block of resp.content) {
                if (block.type === "tool_use") {
                  send({ type: "status", text: `AL utilise ${block.name}…` });
                  const src = toolSource(block.name);
                  if (src) usedSources.add(src);
                  const out = await runTool(block.name, block.input);
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
                }
              }
              if (usedSources.size) send({ type: "sources", sources: [...usedSources], confirmed: true });
              messages.push({ role: "user", content: toolResults });
              continue;
            }
            const finalText = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
            for (const w of finalText.split(/(\s+)/)) send({ type: "token", text: w });
            background(saveMessagePair(sessionId, question, finalText));
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
  // [007] Action chat_simple — pour l'app mobile ti-lex-007.
  if (action === "chat_simple") {
    const bruts = Array.isArray(payload.messages) ? payload.messages : [];
    const histoire = bruts.slice(-30).map((m: any) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.contenu ?? m?.content ?? m?.text ?? "").slice(0, 20000),
    })).filter((m: any) => m.content.trim().length > 0);
    while (histoire.length && histoire[0].role !== "user") histoire.shift();
    if (!histoire.length || histoire[histoire.length - 1].role !== "user") {
      return json({ error: "Il faut au moins un message, et le dernier doit venir de toi." }, 400, CORS);
    }
    const question = histoire[histoire.length - 1].content;
    const sessionId = String(payload.session_id || crypto.randomUUID());
    // [MODELE] L'app mobile peut choisir aussi ; sinon c'est MODEL.
    const modele = choisirModele(payload.model);
    const threat = enquete(histoire.map((m: any) => m.content).join(" "));
    if (!threat.safe) await logThreat(callerId, question, threat);
    if (threat.blocked) {
      const tags = threat.threats.filter((t) => t.severity === "block").map((t) => t.tag).join(", ");
      return json({ error: `🛡️ Enquête automatique — demande bloquée (${tags}). Cette tentative a été journalisée.` }, 403, CORS);
    }
    const within = await rateLimit(`chat_simple:${callerId}`, 30, 300);
    if (!within) {
      return json({ error: "Trop de messages d'un coup. Attends quelques minutes." }, 429, CORS);
    }
    background(maybeAutoConsolidate());
    const memoryText = await buildMemoryText();
    const systeme007 = [
      "Tu es Agent AL, l'agent IA officiel de la plateforme ti-lex (Produit du Québec), créée par Alex Marceau Prevost.",
      "Tu parles en français avec une touche québécoise chaleureuse et naturelle, sans exagérer. Direct, honnête et utile.",
      "Tu réponds depuis l'app mobile ti-lex-007 : texte simple, concis à moins qu'on te demande du détail.",
      "Tu es polyvalent : tu peux aussi rédiger de gros documents/rapports complets et les sauvegarder dans le cerveau (outil sauvegarder_note) si on te le demande.",
      "Tu as une mémoire long terme déjà chargée plus bas (résumés, notes du cerveau, conversation récente) — sers-t'en directement. L'outil rechercher_memoire te permet de fouiller plus loin au besoin.",
      "Tu as des outils : lire le repo GitHub ti-lex-v10 (branche supabase), lire les tables Supabase"
        + (SEARCH_API_KEY ? ", chercher sur le web (cite tes sources : titre + URL)" : "")
        + (PEXELS_API_KEY ? ", et chercher des photos/vidéos libres (recherche_media) quand l'utilisateur veut voir des images — la galerie s'affiche automatiquement, décris juste brièvement" : "")
        + ".",
      "Utilise un outil seulement quand ça aide vraiment à répondre.",
      memoryText,
    ].filter(Boolean).join("\n");
    const convo: any[] = [...histoire];
    const mediaCollecte: any[] = [];
    try {
      let guard = 0;
      while (guard++ < 10) {
        const resp = await callAnthropic(convo, systeme007, TOOLS, MAX_TOKENS, modele);
        if (resp.error) {
          return json({ error: resp.error.message || "Erreur API Anthropic." }, 502, CORS);
        }
        if (resp.stop_reason === "tool_use") {
          convo.push({ role: "assistant", content: resp.content });
          const toolResults: any[] = [];
          for (const block of resp.content) {
            if (block.type === "tool_use") {
              if (block.name === "recherche_media") {
                const items = await rechercheMedia(String(block.input?.query ?? ""), block.input?.type === "video" ? "video" : "photo");
                for (const it of items) { if (mediaCollecte.length < 12) mediaCollecte.push(it); }
                toolResults.push({
                  type: "tool_result", tool_use_id: block.id,
                  content: items.length
                    ? `${items.length} médias trouvés (déjà affichés en galerie dans l'app) :\n` + items.map((it: any, i: number) => `${i + 1}. ${it.credit} — ${it.link}`).join("\n")
                    : "Aucun média trouvé pour cette recherche.",
                });
              } else {
                const out = await runTool(block.name, block.input);
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
              }
            }
          }
          convo.push({ role: "user", content: toolResults });
          continue;
        }
        const texte = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
        background(saveMessagePair(sessionId, question, texte));
        return json({ reponse: texte || "(réponse vide)", modele, ...(mediaCollecte.length ? { media: mediaCollecte } : {}) }, 200, CORS);
      }
      return json({ reponse: "J'ai manqué de tours d'outils pour finir — réessaie en précisant ta demande.", modele, ...(mediaCollecte.length ? { media: mediaCollecte } : {}) }, 200, CORS);
    } catch (e) {
      return json({ error: "Agent AL est injoignable : " + (e as Error).message }, 502, CORS);
    }
  }
  console.log("[agent-al] DIAG action inconnue reçue:", JSON.stringify(payload?.action));
  return json({ error: "Action inconnue", received_action: payload?.action ?? null, expected: ["auto_connect", "commit", "chat", "chat_simple", "consolidate_memory"] }, 400, CORS);
});
