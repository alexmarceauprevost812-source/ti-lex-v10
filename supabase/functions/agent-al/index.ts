// TI-LEX-AL — Agent Central Autonome avec Tool Use
// Scan GitHub · Build · Inject · Lit Supabase
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CODE_EXTS = new Set([
  ".js",".jsx",".ts",".tsx",".html",".css",".scss",
  ".json",".md",".txt",".sql",".py",".sh",".yaml",
  ".yml",".toml",".graphql",".prisma",".vue",".svelte",
]);
const IGNORE = ["node_modules",".git",".next","dist","build",".vercel","coverage","__pycache__"];

function json(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Tool definitions ──

const AL_TOOLS = [
  {
    name: "scan_github_repo",
    description: "Scanne un repo GitHub complet — lit tous les fichiers de code, retourne l'arborescence et le contenu. Utilise cet outil quand l'utilisateur veut analyser, comprendre ou travailler sur un projet GitHub.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner:  { type: "string", description: "Propriétaire du repo GitHub" },
        repo:   { type: "string", description: "Nom du repo GitHub" },
        branch: { type: "string", description: "Branche à scanner (ex: main)" },
      },
      required: ["owner", "repo", "branch"],
    },
  },
  {
    name: "list_github_repos",
    description: "Liste tous les repos GitHub de l'utilisateur connecté.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "list_repo_branches",
    description: "Liste les branches disponibles d'un repo GitHub.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner: { type: "string" },
        repo:  { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "read_github_file",
    description: "Lit le contenu d'un fichier spécifique dans un repo GitHub.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner:  { type: "string" },
        repo:   { type: "string" },
        branch: { type: "string" },
        path:   { type: "string", description: "Chemin du fichier dans le repo" },
      },
      required: ["owner", "repo", "branch", "path"],
    },
  },
  {
    name: "inject_code_to_github",
    description: "Injecte du code dans un repo GitHub — crée ou modifie des fichiers et fait un commit. TOUJOURS confirmer avec l'utilisateur avant d'utiliser cet outil.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner:          { type: "string" },
        repo:           { type: "string" },
        branch:         { type: "string" },
        files:          { type: "object", description: "{ 'chemin/fichier.js': 'contenu' }", additionalProperties: { type: "string" } },
        commit_message: { type: "string" },
      },
      required: ["owner", "repo", "branch", "files", "commit_message"],
    },
  },
];

// ── Tool implementations ──

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "ti-lex-al-agent",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function toolScanGithub(
  input: { owner: string; repo: string; branch: string },
  githubToken: string,
) {
  const { owner, repo, branch } = input;
  const hdrs = ghHeaders(githubToken);

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: hdrs },
  );
  if (!treeRes.ok) {
    const err = await treeRes.json();
    throw new Error(`GitHub: ${err.message}`);
  }
  const treeData = await treeRes.json();

  const allBlobs = treeData.tree.filter((f: any) => f.type === "blob");
  const files = allBlobs.filter((f: any) => {
    if (IGNORE.some((p) => f.path.includes(p + "/"))) return false;
    const ext = "." + f.path.split(".").pop()!.toLowerCase();
    return CODE_EXTS.has(ext) && f.size < 80000;
  }).slice(0, 55);

  const fileContents: Record<string, string> = {};
  const fileTree: string[] = [];

  for (const file of files) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`,
        { headers: hdrs },
      );
      if (r.ok) {
        const d = await r.json();
        if (d.content) {
          fileContents[file.path] = atob(d.content.replace(/\n/g, ""));
          fileTree.push(file.path);
        }
      }
    } catch { /* skip unreadable */ }
  }

  let ctx = `PROJET: ${owner}/${repo} (${branch})\nFICHIERS LUES: ${fileTree.length}/${allBlobs.length}\n\n`;
  ctx += `ARBORESCENCE:\n${fileTree.join("\n")}\n\n=== FICHIERS ===\n\n`;
  for (const [p, c] of Object.entries(fileContents)) {
    ctx += `--- ${p} ---\n${c}\n\n`;
  }

  return {
    owner, repo, branch,
    file_tree: fileTree,
    file_contents: fileContents,
    total_files: allBlobs.length,
    context_string: ctx.slice(0, 180000),
  };
}

async function toolListRepos(githubToken: string) {
  const res = await fetch(
    "https://api.github.com/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator",
    { headers: ghHeaders(githubToken) },
  );
  if (!res.ok) throw new Error("Impossible de charger les repos");
  const repos = await res.json();
  return repos.map((r: any) => ({
    full_name: r.full_name,
    owner: r.owner.login,
    repo: r.name,
    language: r.language,
    private: r.private,
    updated_at: r.updated_at,
    default_branch: r.default_branch,
  }));
}

async function toolListBranches(
  input: { owner: string; repo: string },
  githubToken: string,
) {
  const res = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/branches?per_page=50`,
    { headers: ghHeaders(githubToken) },
  );
  if (!res.ok) throw new Error("Impossible de charger les branches");
  const branches = await res.json();
  return branches.map((b: any) => b.name);
}

async function toolReadFile(
  input: { owner: string; repo: string; branch: string; path: string },
  githubToken: string,
) {
  const res = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${input.path}?ref=${input.branch}`,
    { headers: ghHeaders(githubToken) },
  );
  if (!res.ok) throw new Error(`Fichier introuvable: ${input.path}`);
  const d = await res.json();
  if (!d.content) throw new Error(`Pas de contenu pour: ${input.path}`);
  return {
    path: input.path,
    content: atob(d.content.replace(/\n/g, "")),
    sha: d.sha,
    size: d.size,
  };
}

async function toolInjectGithub(
  input: {
    owner: string; repo: string; branch: string;
    files: Record<string, string>; commit_message: string;
  },
  githubToken: string,
) {
  const { owner, repo, branch, files, commit_message } = input;
  const hdrs = {
    ...ghHeaders(githubToken),
    "Content-Type": "application/json",
  };
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const refRes = await fetch(`${base}/git/ref/heads/${branch}`, { headers: hdrs });
  if (!refRes.ok) {
    const mainRef = await (await fetch(`${base}/git/ref/heads/main`, { headers: hdrs })).json();
    await fetch(`${base}/git/refs`, {
      method: "POST", headers: hdrs,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainRef.object.sha }),
    });
  }

  const refData = await (await fetch(`${base}/git/ref/heads/${branch}`, { headers: hdrs })).json();
  const baseSha = refData.object.sha;
  const baseCommit = await (await fetch(`${base}/git/commits/${baseSha}`, { headers: hdrs })).json();

  const treeItems = [];
  for (const [filePath, content] of Object.entries(files)) {
    const blob = await (await fetch(`${base}/git/blobs`, {
      method: "POST", headers: hdrs,
      body: JSON.stringify({ content: btoa(unescape(encodeURIComponent(content))), encoding: "base64" }),
    })).json();
    treeItems.push({ path: filePath, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await (await fetch(`${base}/git/trees`, {
    method: "POST", headers: hdrs,
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }),
  })).json();

  const newCommit = await (await fetch(`${base}/git/commits`, {
    method: "POST", headers: hdrs,
    body: JSON.stringify({ message: commit_message, tree: newTree.sha, parents: [baseSha] }),
  })).json();

  await fetch(`${base}/git/refs/heads/${branch}`, {
    method: "PATCH", headers: hdrs,
    body: JSON.stringify({ sha: newCommit.sha, force: true }),
  });

  return {
    success: true,
    commit_sha: newCommit.sha,
    commit_url: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
    branch,
    files_pushed: Object.keys(files),
  };
}

// ── System prompt ──

const AL_SYSTEM = `Tu es TI-LEX-AL, l'agent central autonome de Centre INDAR.
Tu parles en français québécois, tu es direct et technique.

TES CAPACITÉS:
- Scanner un repo GitHub complet (lire tous les fichiers)
- Lister les repos et branches GitHub de l'utilisateur
- Lire un fichier spécifique d'un repo
- Générer du code adapté à la stack du projet
- Injecter du code directement dans un repo GitHub (avec confirmation)

COMPORTEMENT:
1. Tu utilises tes outils de façon autonome selon ce que l'utilisateur demande
2. Si l'utilisateur ne précise pas le repo/branche, utilise list_github_repos d'abord
3. Quand tu génères du code à injecter, utilise ce format:
   \`\`\`INJECT:chemin/du/fichier.ext
   [CONTENU COMPLET DU FICHIER]
   \`\`\`
4. Avant d'injecter, tu CONFIRMES avec l'utilisateur
5. Quand tu as le contexte d'un projet, tu l'utilises pour générer du code cohérent
6. Tu es proactif — si tu détectes des erreurs, tu les mentionnes et proposes de les corriger`;

// ── Main handler ──

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405, cors);

  // Ping — health-check rapide (pas de billing, pas d'auth)
  try {
    const cloned = req.clone();
    const peek = await cloned.json();
    if (peek?.action === "ping") return json({ ok: true }, 200, cors);
  } catch { /* not JSON or no action — continue */ }

  const t0 = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié" }, 401, cors);

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user?.id) return json({ error: "Session expirée" }, 401, cors);
    const userId = userData.user.id;

    const body = await req.json();
    const {
      action,
      question,
      history,
      github_token,
      conversation_id,
      project_context,
      content,
    } = body;

    // Legacy actions (suggest_tags, summarize)
    if (action === "suggest_tags" || action === "summarize") {
      const prompts: Record<string, string> = {
        suggest_tags: `Suggère 3-5 tags pertinents pour cette note, séparés par des virgules: ${content}`,
        summarize: `Résume en 1-2 phrases, en français: ${content}`,
      };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          messages: [{ role: "user", content: prompts[action] }],
        }),
      });
      const d = await res.json();
      return json({ result: d.content?.[0]?.text || "" }, 200, cors);
    }

    // Chat with tool use
    if (action !== "chat") return json({ error: "Action inconnue" }, 400, cors);
    if (!question) return json({ error: "Question manquante" }, 400, cors);

    // Build system prompt with project context
    let systemWithContext = AL_SYSTEM;
    if (project_context?.file_tree) {
      systemWithContext += `\n\n=== PROJET EN MÉMOIRE: ${project_context.owner}/${project_context.repo} (${project_context.branch}) ===\n`;
      systemWithContext += `Fichiers: ${project_context.file_tree?.length || 0}\n`;
      if (project_context.scan_summary) systemWithContext += `Résumé: ${project_context.scan_summary}\n`;
      if (project_context.file_contents) {
        let ctxSize = 0;
        for (const [p, c] of Object.entries(project_context.file_contents as Record<string, string>)) {
          const chunk = `--- ${p} ---\n${c}\n\n`;
          if (ctxSize + chunk.length < 100000) { systemWithContext += chunk; ctxSize += chunk.length; }
        }
      }
    }

    // Build messages
    const claudeMessages: any[] = (history || []).map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text || m.content,
    }));
    claudeMessages.push({ role: "user", content: question });

    let projectContextUpdated = project_context || null;
    const actionsPerformed: any[] = [];

    // Agentic tool-use loop (max 5 turns)
    let claudeData: any;
    for (let loop = 0; loop <= 5; loop++) {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: systemWithContext,
          tools: github_token ? AL_TOOLS : [],
          messages: claudeMessages,
        }),
      });

      claudeData = await claudeRes.json();

      if (claudeData.stop_reason !== "tool_use") break;

      const toolUseBlocks = claudeData.content.filter((b: any) => b.type === "tool_use");
      const toolResultsForClaude: any[] = [];

      for (const toolBlock of toolUseBlocks) {
        const tStart = Date.now();
        let toolResult: any;
        let toolStatus = "success";
        let toolError = "";

        try {
          switch (toolBlock.name) {
            case "scan_github_repo":
              if (!github_token) throw new Error("Token GitHub requis");
              toolResult = await toolScanGithub(toolBlock.input, github_token);
              projectContextUpdated = {
                owner: toolResult.owner,
                repo: toolResult.repo,
                branch: toolResult.branch,
                file_tree: toolResult.file_tree,
                file_contents: toolResult.file_contents,
                scan_summary: "",
                errors: [],
                score: 0,
              };
              // Return summary instead of full file contents to Claude
              toolResult = {
                owner: toolResult.owner,
                repo: toolResult.repo,
                branch: toolResult.branch,
                file_tree: toolResult.file_tree,
                total_files: toolResult.total_files,
                files_read: toolResult.file_tree.length,
                context_string: toolResult.context_string,
              };
              break;

            case "list_github_repos":
              if (!github_token) throw new Error("Token GitHub requis");
              toolResult = await toolListRepos(github_token);
              break;

            case "list_repo_branches":
              if (!github_token) throw new Error("Token GitHub requis");
              toolResult = await toolListBranches(toolBlock.input, github_token);
              break;

            case "read_github_file":
              if (!github_token) throw new Error("Token GitHub requis");
              toolResult = await toolReadFile(toolBlock.input, github_token);
              break;

            case "inject_code_to_github":
              if (!github_token) throw new Error("Token GitHub requis");
              toolResult = await toolInjectGithub(toolBlock.input, github_token);
              break;

            default:
              throw new Error(`Outil inconnu: ${toolBlock.name}`);
          }
        } catch (e: any) {
          toolResult = { error: e.message };
          toolStatus = "error";
          toolError = e.message;
        }

        // Log action
        try {
          await supabase.from("al_actions_log").insert({
            user_id: userId,
            conv_id: conversation_id || null,
            action_type: toolBlock.name,
            action_input: toolBlock.input,
            action_result: toolBlock.name === "scan_github_repo"
              ? { files_read: toolResult.files_read, total: toolResult.total_files }
              : toolResult,
            duration_ms: Date.now() - tStart,
            status: toolStatus,
            error_detail: toolError || null,
          });
        } catch { /* logging failure is non-fatal */ }

        actionsPerformed.push({ tool: toolBlock.name, status: toolStatus });
        toolResultsForClaude.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: JSON.stringify(toolResult).slice(0, 180000),
        });
      }

      claudeMessages.push({ role: "assistant", content: claudeData.content });
      claudeMessages.push({ role: "user", content: toolResultsForClaude });
    }

    // Extract final text
    const finalResponse = claudeData?.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n") || "Désolé, je n'ai pas pu générer une réponse.";

    // Detect INJECT blocks
    const proposedFiles: Record<string, string> = {};
    const injectRegex = /```INJECT:([\w.\-/]+)\n([\s\S]*?)```/g;
    let match;
    while ((match = injectRegex.exec(finalResponse)) !== null) {
      proposedFiles[match[1]] = match[2];
    }

    // Save project context
    if (conversation_id && projectContextUpdated) {
      try {
        await supabase
          .from("conversations")
          .update({
            project_context: { ...projectContextUpdated, file_contents: undefined },
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation_id)
          .eq("user_id", userId);
      } catch { /* non-fatal */ }
    }

    return json({
      result: finalResponse,
      proposed_files: proposedFiles,
      has_code: Object.keys(proposedFiles).length > 0,
      project_context_updated: projectContextUpdated,
      actions_performed: actionsPerformed,
      duration_ms: Date.now() - t0,
    }, 200, cors);

  } catch (e: any) {
    return json({ error: e.message }, 500, cors);
  }
});
