// ti-lex-AL — Vercel Proxy (Studio)
// Token Vercel cote serveur uniquement.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";

const VERCEL_TOKEN = Deno.env.get("VERCEL_TOKEN") || "";
const VERCEL_PROJECT_ID = Deno.env.get("VERCEL_PROJECT_ID") || "";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non autorise" }, 401);

  const rl = await checkRateLimit(getIdentifier(req), { prefix: "vercel-proxy", max: 30, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl, CORS);

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "Session invalide" }, 401);
  } catch {
    // Allow anon key as fallback
  }

  if (!VERCEL_TOKEN) return json({ error: "VERCEL_TOKEN non configure" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON invalide" }, 400);
  }

  const action = body.action as string;
  const vHeaders = { Authorization: `Bearer ${VERCEL_TOKEN}` };

  switch (action) {
    case "listDeployments": {
      const limit = Math.min((body.limit as number) || 10, 20);
      const url = VERCEL_PROJECT_ID
        ? `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=${limit}`
        : `https://api.vercel.com/v6/deployments?limit=${limit}`;
      const res = await fetch(url, { headers: vHeaders });
      const data = await res.json();
      if (!res.ok) return json({ error: data.error?.message || "Erreur Vercel" }, res.status);
      const deployments = (data.deployments || []).map((d: any) => ({
        id: d.uid,
        state: d.state || d.readyState,
        url: d.url,
        created: d.created || d.createdAt,
        meta: { branch: d.meta?.githubCommitRef, message: d.meta?.githubCommitMessage, sha: d.meta?.githubCommitSha?.slice(0, 7) },
      }));
      return json({ deployments });
    }

    case "getDeployment": {
      const id = body.deploymentId as string;
      if (!id) return json({ error: "deploymentId requis" }, 400);
      const res = await fetch(`https://api.vercel.com/v13/deployments/${id}`, { headers: vHeaders });
      const data = await res.json();
      if (!res.ok) return json({ error: data.error?.message || "Erreur Vercel" }, res.status);
      return json({
        id: data.uid,
        state: data.readyState,
        url: data.url,
        created: data.createdAt,
        ready: data.ready,
        errorMessage: data.errorMessage,
        meta: { branch: data.meta?.githubCommitRef, message: data.meta?.githubCommitMessage },
      });
    }

    case "getBuildLogs": {
      const id = body.deploymentId as string;
      if (!id) return json({ error: "deploymentId requis" }, 400);
      const res = await fetch(`https://api.vercel.com/v2/deployments/${id}/events`, { headers: vHeaders });
      const data = await res.json();
      if (!res.ok) return json({ error: data.error?.message || "Erreur Vercel" }, res.status);
      const events = Array.isArray(data) ? data : [];
      const errors = events.filter((e: any) =>
        e.type === "error" ||
        (e.payload?.text && /error|ERR!|failed|FATAL/i.test(e.payload.text))
      ).map((e: any) => ({
        type: e.type,
        text: e.payload?.text || e.text || "",
        date: e.created,
      }));
      return json({ total: events.length, errors, hasErrors: errors.length > 0 });
    }

    default:
      return json({ error: `Action inconnue: ${action}` }, 400);
  }
});
