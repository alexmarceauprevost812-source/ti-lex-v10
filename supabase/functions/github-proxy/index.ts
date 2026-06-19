// ti-lex-AL — GitHub Proxy (Codex + Studio)
// PAT chiffré dans Vault. Jamais exposé au frontend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function ghFetch(pat: string, path: string, opts?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ti-lex-al-proxy",
      "X-GitHub-Api-Version": "2022-11-28",
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

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non autorisé" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const {
    data: { user },
  } = await sb.auth.getUser(token);
  if (!user) return json({ error: "Session invalide" }, 401);

  const { data: patData, error: patErr } = await sb.rpc("get_github_pat", {
    p_user_id: user.id,
  });
  if (patErr || !patData) {
    return json(
      { error: "Aucun PAT GitHub. Connecte ton compte dans Paramètres." },
      404,
    );
  }
  const pat = patData as string;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON invalide" }, 400);
  }

  const action = body.action as string;
  const repo = body.repo as string;
  const branch = (body.branch as string) || "main";

  switch (action) {
    case "listRepos": {
      const page = Math.max(1, (body.page as number) || 1);
      const data = await ghFetch(
        pat,
        `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator&page=${page}`,
      );
      if ((data as any)._error)
        return json({ error: (data as any).message }, (data as any).status);
      return json({ repos: data });
    }

    case "listBranches": {
      if (!repo) return json({ error: "repo requis" }, 400);
      const data = await ghFetch(
        pat,
        `/repos/${repo}/branches?per_page=50`,
      );
      if ((data as any)._error)
        return json({ error: (data as any).message }, (data as any).status);
      const branches = (data as any[]).map((b: any) => b.name);
      return json({ branches });
    }

    case "listFiles": {
      if (!repo) return json({ error: "repo requis" }, 400);
      const data = await ghFetch(
        pat,
        `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      );
      if ((data as any)._error)
        return json({ error: (data as any).message }, (data as any).status);
      const blobs = ((data as any).tree || []).filter(
        (f: any) => f.type === "blob",
      );
      return json({ tree: blobs, truncated: (data as any).truncated });
    }

    case "readFile": {
      const path = body.path as string;
      if (!repo || !path) return json({ error: "repo + path requis" }, 400);
      const data = await ghFetch(
        pat,
        `/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      );
      if ((data as any)._error)
        return json({ error: (data as any).message }, (data as any).status);
      return json({
        content: (data as any).content,
        sha: (data as any).sha,
        size: (data as any).size,
      });
    }

    case "listCommits": {
      if (!repo) return json({ error: "repo requis" }, 400);
      const limit = Math.min((body.limit as number) || 10, 30);
      const data = await ghFetch(
        pat,
        `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`,
      );
      if ((data as any)._error)
        return json({ error: (data as any).message }, (data as any).status);
      const commits = (data as any[]).map((c: any) => ({
        sha: c.sha?.slice(0, 7),
        message: c.commit?.message?.split("\n")[0],
        author: c.commit?.author?.name,
        date: c.commit?.author?.date,
      }));
      return json({ commits });
    }

    case "pushFile": {
      const path = body.path as string;
      const content = body.content as string;
      const message =
        (body.message as string) || `[ti-lex-AL] update ${path}`;
      const sha = body.sha as string | undefined;
      if (!repo || !path || !content)
        return json({ error: "repo + path + content requis" }, 400);
      const payload: Record<string, unknown> = { message, content, branch };
      if (sha) payload.sha = sha;
      const data = await ghFetch(
        pat,
        `/repos/${repo}/contents/${encodeURIComponent(path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if ((data as any)._error)
        return json({ error: (data as any).message }, (data as any).status);
      return json({
        success: true,
        sha: (data as any).content?.sha,
        commit: (data as any).commit?.sha?.slice(0, 7),
      });
    }

    case "status": {
      return json({ connected: true });
    }

    default:
      return json({ error: `Action inconnue: ${action}` }, 400);
  }
});
