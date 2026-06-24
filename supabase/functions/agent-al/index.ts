// ti-lex v10 — Edge Function agent-al — NIVEAU MAX (5 couches)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const GITHUB_TOKEN       = Deno.env.get("GITHUB_TOKEN")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY           = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// 🔒 Niveau 1 — propriétaire unique (override possible via secret OWNER_USER_ID)
const OWNER_USER_ID = Deno.env.get("OWNER_USER_ID") || "d9a1985a-e106-4ea5-9ada-cac775c0b820";
// 🔐 Niveau 2 — NIP d'injection (secret serveur)
const INJECT_PIN = Deno.env.get("AL_INJECT_PIN") || "";
const GH_OWNER  = "alexmarceauprevost812-source";
const GH_REPO   = "ti-lex-v10";
const GH_BRANCH = "supabase";
const MODEL     = "claude-sonnet-4-6";
// 🌐 CORS allowlist
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
// 🛡️ Niveau 5 — fichiers que AL ne peut JAMAIS modifier
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
// 🔑 Identifie l'appelant via son JWT
async function getCallerId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const c = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data } = await c.auth.getUser();
  return data?.user?.id ?? null;
}
// 🔁 Niveau 3 — rate limiting (fonction check_rate_limit déjà en base)
async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key, p_max: max, p_window_seconds: windowSec,
    });
    if (error) return true; // fail-open
    return data === true;
  } catch {
    return true;
  }
}
// 📝 Niveau 4 — journalisation (ne bloque jamais sur erreur d'audit)
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
// ---------- GitHub helpers ----------
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
// ---------- Supabase context ----------
async function supabaseContext() {
  const { count } = await admin.from("cerveau_notes").select("*", { count: "exact", head: true });
  const { data: notes } = await admin
    .from("cerveau_notes").select("title,tags,created_at")
    .order("created_at", { ascending: false }).limit(15);
  return { notes_count: count ?? 0, recent_notes: notes ?? [] };
}
// ---------- Outils Anthropic ----------
const TOOLS = [
  { name: "github_read_file", description: "Lit un fichier du repo ti-lex-v10 (branche supabase).",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "github_list_files", description: "Liste tous les fichiers du repo.",
    input_schema: { type: "object", properties: {} } },
  { name: "supabase_query", description: "Lit des lignes d'une table Supabase (lecture seule).",
    input_schema: { type: "object", properties: { table: { type: "string" }, limit: { type: "number" } }, required: ["table"] } },
];
async function runTool(name: string, input: any): Promise<string> {
  if (name === "github_read_file") return await githubRead(input.path);
  if (name === "github_list_files") return (await githubTree()).join("\n");
  if (name === "supabase_query") {
    const { data, error } = await admin.from(input.table).select("*").limit(input.limit ?? 10);
    if (error) return `Erreur: ${error.message}`;
    return JSON.stringify(data, null, 2);
  }
  return "Outil inconnu.";
}
async function callAnthropic(messages: any[], system: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, tools: TOOLS, messages }),
  });
  return await r.json();
}
function buildSystem(ctx: any): string {
  const files = (ctx?.github?.files || []).slice(0, 200).join("\n");
  const notes = (ctx?.supabase?.recent_notes || [])
    .map((n: any) => `- ${n.title} [${(n.tags || []).join(", ")}]`).join("\n");
  return [
    "Tu es AL, l'agent autonome central de ti-lex v10 (cybersécurité, Québec ⚜️).",
    "Tu es déjà connecté au projet : repo GitHub ti-lex-v10 (branche supabase) et base Supabase.",
    "Réponds dans la langue de l'utilisateur ; par défaut français québécois, direct et concret.",
    "Pour du code à appliquer, utilise EXACTEMENT ce format, un bloc par fichier :",
    "INJECT: chemin/du/fichier.ext", "```", "<code complet>", "```",
    "Pas de placeholder. Vanilla HTML/CSS/JS uniquement (jamais React/JSX).",
    "Tokens ti-lex : fond #0a0a0a, orange #ff7f27, vert #37e0a0, gold #E6A400, rouge #E60000, bleu #4a9eff, violet #C700E6, JetBrains Mono.",
    "", "--- CONTEXTE PROJET ---",
    `Fichiers (${(ctx?.github?.files || []).length}) :`, files || "(indisponible)",
    "", `Notes (${ctx?.supabase?.notes_count ?? 0}) :`, notes || "(aucune)",
  ].join("\n");
}
// 🔍 Niveau 6 — Enquête automatique (analyse la demande AVANT exécution)
const THREAT_PATTERNS: { re: RegExp; tag: string; severity: "block" | "warn" }[] = [
  // Prompt injection
  { re: /ignore\s+(all\s+)?(previous|prior|above|preceding)\s+(instructions?|prompts?|rules?)/i, tag: "prompt-injection", severity: "block" },
  { re: /you\s+are\s+now\s+(a|an|the)\b/i, tag: "identity-hijack", severity: "block" },
  { re: /act\s+as\s+(if\s+)?you\s+(have\s+no|don.?t\s+have)\s+(restrictions?|limits?|rules?)/i, tag: "jailbreak", severity: "block" },
  { re: /system\s*prompt|repeat\s+(your|the)\s+(instructions?|system|prompt)/i, tag: "system-leak", severity: "block" },
  { re: /oublie\s+(tes|les|toutes?\s+les)\s+(instructions?|r[eè]gles?|consignes?)/i, tag: "prompt-injection-fr", severity: "block" },
  // Secrets & credentials
  { re: /\b(service.?role|ANTHROPIC.?API.?KEY|AL.?INJECT.?PIN|INJECT.?PIN|secret.?key|private.?key)\b/i, tag: "secret-exfil", severity: "block" },
  { re: /\b(r[eé]v[eè]le|affiche|montre|donne|print|log|echo|expose)\b.{0,30}\b(nip|pin|mot\s+de\s+passe|password|secret|cl[eé]\s+priv)/i, tag: "credential-request", severity: "block" },
  { re: /Deno\.env\.get/i, tag: "env-access", severity: "block" },
  // Destructive operations
  { re: /\b(drop\s+(table|database|schema)|truncate\s+table|delete\s+from\s+\w+\s*;?\s*$|rm\s+-rf)\b/i, tag: "destructive-sql", severity: "block" },
  { re: /\b(supprimer?\s+(toutes?|la\s+base|tout)|efface[r]?\s+tout|d[eé]truire?\s+(la\s+base|tout))\b/i, tag: "destructive-fr", severity: "block" },
  // Privilege escalation
  { re: /\b(grant\s+all|alter\s+role|set\s+role|security\s+definer|superuser|bypass\s+rls)\b/i, tag: "privilege-escalation", severity: "block" },
  { re: /\b(d[eé]sactiver?\s+(rls|s[eé]curit[eé]|auth)|disable\s+(rls|security|auth))\b/i, tag: "security-disable", severity: "block" },
  // Data exfil
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
// ---------- Handler ----------
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const CORS = corsFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // 🔒 Niveau 1 — verrou propriétaire (bloque tout sauf ton compte)
  const callerId = await getCallerId(req);
  if (callerId !== OWNER_USER_ID) {
    return json({ error: "Accès réservé au propriétaire ti-lex. Connecte-toi avec ton compte." }, 403, CORS);
  }
  let payload: any;
  try { payload = await req.json(); }
  catch { return json({ error: "JSON invalide" }, 400, CORS); }
  const action = payload.action;
  // --- auto_connect ---
  if (action === "auto_connect") {
    const [files, sb] = await Promise.all([githubTree(), supabaseContext()]);
    return json({ github: { owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH, files }, supabase: sb, ready: true }, 200, CORS);
  }
  // --- commit (5 couches) ---
  if (action === "commit") {
    const path = String(payload.path ?? "");
    // Niveau 3 — anti brute-force NIP : max 10 essais / 5 min
    const within = await rateLimit(`inject_pin:${callerId}`, 10, 300);
    if (!within) {
      await logInjection(callerId, path, payload.message, false, false, false, "rate-limited");
      return json({ error: "Trop d'essais de NIP. Réessaie dans 5 minutes." }, 429, CORS);
    }
    // Niveau 5 — restriction de portée : fichier protégé ?
    if (isProtected(path)) {
      await logInjection(callerId, path, payload.message, false, false, false, "fichier protégé");
      return json({ error: `Fichier protégé : AL ne peut pas modifier « ${path} ».` }, 403, CORS);
    }
    // Niveau 2 — NIP
    const pinOk = !!INJECT_PIN && String(payload.pin ?? "") === INJECT_PIN;
    if (!pinOk) {
      await logInjection(callerId, path, payload.message, false, true, false, "NIP invalide");
      return json({ error: "NIP invalide. Injection refusée." }, 403, CORS);
    }
    // Push + Niveau 4 — journalisation
    const resultMsg = await githubCommit(path, payload.code, payload.message || "");
    const success = resultMsg.startsWith("✅");
    await logInjection(callerId, path, payload.message, true, true, success, resultMsg);
    return json({ result: resultMsg }, 200, CORS);
  }
  // --- chat (SSE + tools) ---
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
          let guard = 0;
          while (guard++ < 6) {
            const resp = await callAnthropic(messages, system);
            if (resp.error) { send({ type: "token", text: "⚠️ " + (resp.error.message || "Erreur API") }); break; }
            if (resp.stop_reason === "tool_use") {
              messages.push({ role: "assistant", content: resp.content });
              const toolResults: any[] = [];
              for (const block of resp.content) {
                if (block.type === "tool_use") {
                  send({ type: "status", text: `AL utilise ${block.name}…` });
                  const out = await runTool(block.name, block.input);
                  toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
                }
              }
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
  return json({ error: "Action inconnue" }, 400, CORS);
});
