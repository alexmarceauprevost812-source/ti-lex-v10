// ti-lex v10 — Edge Function agent-al
// Actions : auto_connect | chat (SSE + tool_use) | commit
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const GITHUB_TOKEN       = Deno.env.get("GITHUB_TOKEN")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GH_OWNER  = "alexmarceauprevost812-source";
const GH_REPO   = "ti-lex-v10";
const GH_BRANCH = "supabase";
const MODEL     = "claude-sonnet-4-6";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  const { count } = await admin
    .from("cerveau_notes")
    .select("*", { count: "exact", head: true });
  const { data: notes } = await admin
    .from("cerveau_notes")
    .select("title,tags,created_at")
    .order("created_at", { ascending: false })
    .limit(15);
  return { notes_count: count ?? 0, recent_notes: notes ?? [] };
}

// ---------- Outils Anthropic ----------
const TOOLS = [
  {
    name: "github_read_file",
    description: "Lit le contenu complet d'un fichier du repo ti-lex-v10 (branche supabase). Utilise github_list_files d'abord si tu ne connais pas le chemin exact.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "github_list_files",
    description: "Liste tous les fichiers du repo ti-lex-v10 (branche supabase).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "supabase_query",
    description: "Lit des lignes d'une table Supabase du projet (lecture seule).",
    input_schema: {
      type: "object",
      properties: { table: { type: "string" }, limit: { type: "number" } },
      required: ["table"],
    },
  },
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

// ---------- Appel Anthropic (non-stream, pour la boucle d'outils) ----------
async function callAnthropic(messages: any[], system: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, tools: TOOLS, messages }),
  });
  return await r.json();
}

// ---------- System prompt ----------
function buildSystem(ctx: any): string {
  const files = (ctx?.github?.files || []).slice(0, 200).join("\n");
  const notes = (ctx?.supabase?.recent_notes || [])
    .map((n: any) => `- ${n.title} [${(n.tags || []).join(", ")}]`).join("\n");
  return [
    "Tu es AL, l'agent autonome central de ti-lex v10 (cybersécurité, Québec).",
    "Tu es DÉJÀ connecté au projet : repo GitHub ti-lex-v10 (branche supabase) et base Supabase.",
    "Réponds dans la langue de l'utilisateur ; par défaut français québécois, ton direct et concret.",
    "Quand tu génères du code à appliquer, utilise EXACTEMENT ce format, un bloc par fichier :",
    "INJECT: chemin/du/fichier.ext",
    "```",
    "<code complet>",
    "```",
    "Pas de placeholder, pas de simplification. Code vanilla HTML/CSS/JS uniquement (jamais de React/JSX).",
    "Respecte les tokens ti-lex : fond #0a0a0a, orange #ff7f27, vert #37e0a0, gold #E6A400, rouge #E60000, bleu #4a9eff, violet #C700E6, police JetBrains Mono.",
    "",
    `--- CONTEXTE PROJET ---`,
    `Fichiers du repo (${(ctx?.github?.files || []).length}) :`,
    files || "(liste indisponible)",
    "",
    `Notes (${ctx?.supabase?.notes_count ?? 0}) récentes :`,
    notes || "(aucune)",
  ].join("\n");
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let payload: any;
  try { payload = await req.json(); }
  catch { return json({ error: "JSON invalide" }, 400); }

  const action = payload.action;

  // --- auto_connect ---
  if (action === "auto_connect") {
    const [files, sb] = await Promise.all([githubTree(), supabaseContext()]);
    return json({
      github: { owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH, files },
      supabase: sb,
      ready: true,
    });
  }

  // --- commit ---
  if (action === "commit") {
    const res = await githubCommit(payload.path, payload.code, payload.message || "");
    return json({ result: res });
  }

  // --- chat (SSE) ---
  if (action === "chat") {
    const system = buildSystem(payload.projectContext || {});
    const history = (payload.history || []).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text ?? m.content ?? "",
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

            const finalText = (resp.content || [])
              .filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
            const words = finalText.split(/(\s+)/);
            for (const w of words) send({ type: "token", text: w });
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

    return new Response(stream, {
      headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  return json({ error: "Action inconnue" }, 400);
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
