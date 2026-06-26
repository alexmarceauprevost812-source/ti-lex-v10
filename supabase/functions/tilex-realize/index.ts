// ti-lex v10 — Edge Function tilex-realize
// Réalise un schéma : SQL → Supabase | code → GitHub
// Preview + confirmation côté client. Audit côté serveur.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_REPO  = Deno.env.get("GITHUB_REPO") ?? "";
// 🔒 Propriétaire unique : seul lui peut RÉALISER (SQL service-role / push GitHub).
// Empêche tout utilisateur connecté d'exécuter du SQL et d'élever ses privilèges.
const OWNER_USER_ID = Deno.env.get("OWNER_USER_ID") || "d9a1985a-e106-4ea5-9ada-cac775c0b820";

const DESTRUCTIVE = /\b(drop\s+table|drop\s+database|truncate|delete\s+from|drop\s+schema|alter\s+table\s+\w+\s+drop)\b/i;

function json(obj: unknown, status: number, hdrs: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...hdrs, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req);

  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userSb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }

  const action = String(body.action || "");
  const content = String(body.content || "");
  const target = String(body.target || "");
  const confirmed = Boolean(body.confirmed);
  const confirmedDestructive = Boolean(body.confirmed_destructive);

  if (action === "check_github") {
    return json({ connected: !!(GITHUB_TOKEN && GITHUB_REPO) }, 200, cors);
  }

  const { data: { user } } = await userSb.auth.getUser();
  if (!user) return json({ error: "not_authenticated" }, 401, cors);

  if (action === "detect") {
    const kind = detectKind(content);
    const destructive = kind === "sql" && DESTRUCTIVE.test(content);
    return json({ kind, destructive }, 200, cors);
  }

  if (action === "realize") {
    // 🔒 Niveau 1 — verrou propriétaire : seul le propriétaire peut réaliser.
    if (user.id !== OWNER_USER_ID) {
      return json({ error: "forbidden", message: "Réalisation réservée au propriétaire ti-lex." }, 403, cors);
    }
    const kind = detectKind(content);
    const destructive = kind === "sql" && DESTRUCTIVE.test(content);

    if (destructive && !confirmedDestructive) {
      return json({
        error: "destructive_needs_confirm",
        message: "Opération destructrice détectée. Double confirmation requise.",
      }, 412, cors);
    }
    if (!confirmed) {
      return json({ error: "needs_confirm" }, 412, cors);
    }

    const { data: logRow } = await admin.from("realizations").insert({
      user_id: user.id, kind, target, payload: content, status: "pending",
    }).select().single();

    try {
      let result;
      if (kind === "sql") {
        result = await realizeSQL(content);
      } else {
        result = await realizeGitHub(content, target || `tilex/realized-${Date.now()}.txt`);
      }

      if (logRow) {
        await admin.from("realizations").update({ status: "done", result }).eq("id", logRow.id);
      }

      await admin.from("audit_events").insert({
        actor_id: user.id,
        action: `realize_${kind}`,
        resource_type: kind === "sql" ? "database" : "github",
        resource_id: target || "direct",
        details: { kind, target, content_length: content.length },
      }).catch(() => {});

      return json({ ok: true, kind, result }, 200, cors);
    } catch (e) {
      if (logRow) {
        await admin.from("realizations").update({
          status: "failed", result: { error: String((e as Error)?.message ?? e) },
        }).eq("id", logRow.id);
      }
      return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500, cors);
    }
  }

  return json({ error: "unknown_action" }, 400, cors);
});

function detectKind(content: string): "sql" | "github" {
  const c = content.trim().toLowerCase();
  const sqlSignals = /\b(create\s+table|alter\s+table|insert\s+into|create\s+function|create\s+policy|drop\s+|select\s+|update\s+\w+\s+set|create\s+index|create\s+or\s+replace)\b/;
  if (sqlSignals.test(c) && !c.includes("import ") && !c.includes("export default")) {
    return "sql";
  }
  return "github";
}

async function realizeSQL(sql: string) {
  const { data, error } = await admin.rpc("exec_realize", { p_sql: sql });
  if (error) throw new Error(error.message);
  return { executed: true, data };
}

async function realizeGitHub(content: string, path: string) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) throw new Error("GitHub non configuré");

  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "ti-lex-v10",
  };

  let sha: string | undefined;
  const existing = await fetch(apiBase, { headers });
  if (existing.ok) {
    const d = await existing.json();
    sha = d.sha;
  }

  const resp = await fetch(apiBase, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `ti-lex v10 — réalisation de schéma (${path})`,
      content: btoa(unescape(encodeURIComponent(content))),
      ...(sha ? { sha } : {}),
    }),
  });

  if (!resp.ok) throw new Error(`GitHub ${resp.status}: ${await resp.text()}`);
  const j = await resp.json();
  return { committed: true, url: j.content?.html_url, path };
}
