// ti-lex-AL — GitHub Proxy (Codex + Studio)
// Token GitHub cote serveur uniquement. Jamais expose au frontend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPO = "alexmarceauprevost812-source/ti-lex-v10";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function ghFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ti-lex-al-proxy",
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    return { _error: true, status: res.status, message: err };
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

  // Auth: verify Supabase session
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non autorise" }, 401);

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "Session invalide" }, 401);
  } catch {
    // Allow anon key as fallback for now
  }

  if (!GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN non configure" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON invalide" }, 400);
  }

  const action = body.action as string;
  const branch = (body.branch as string) || "main";

  switch (action) {
    case "listFiles": {
      const data = await ghFetch(`/repos/${REPO}/git/trees/${branch}?recursive=1`);
      if ((data as any)._error) return json({ error: (data as any).message }, (data as any).status);
      const blobs = ((data as any).tree || []).filter((f: any) => f.type === "blob");
      return json({ tree: blobs, truncated: (data as any).truncated });
    }

    case "readFile": {
      const path = body.path as string;
      if (!path) return json({ error: "path requis" }, 400);
      const data = await ghFetch(`/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${branch}`);
      if ((data as any)._error) return json({ error: (data as any).message }, (data as any).status);
      return json({ content: (data as any).content, sha: (data as any).sha, size: (data as any).size });
    }

    case "listCommits": {
      const limit = Math.min((body.limit as number) || 10, 30);
      const data = await ghFetch(`/repos/${REPO}/commits?sha=${branch}&per_page=${limit}`);
      if ((data as any)._error) return json({ error: (data as any).message }, (data as any).status);
      const commits = (data as any[]).map((c: any) => ({
        sha: c.sha?.slice(0, 7),
        message: c.commit?.message?.split("\n")[0],
        author: c.commit?.author?.name,
        date: c.commit?.author?.date,
      }));
      return json({ commits });
    }

    case "listBranches": {
      const data = await ghFetch(`/repos/${REPO}/branches?per_page=30`);
      if ((data as any)._error) return json({ error: (data as any).message }, (data as any).status);
      const branches = (data as any[]).map((b: any) => b.name);
      return json({ branches });
    }

    case "pushFile": {
      const path = body.path as string;
      const content = body.content as string;
      const message = (body.message as string) || `[ti-lex-AL] update ${path}`;
      const sha = body.sha as string | undefined;
      if (!path || !content) return json({ error: "path + content requis" }, 400);
      const payload: Record<string, unknown> = { message, content, branch };
      if (sha) payload.sha = sha;
      const data = await ghFetch(`/repos/${REPO}/contents/${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if ((data as any)._error) return json({ error: (data as any).message }, (data as any).status);
      return json({ success: true, sha: (data as any).content?.sha, commit: (data as any).commit?.sha?.slice(0, 7) });
    }

    default:
      return json({ error: `Action inconnue: ${action}` }, 400);
  }
});
