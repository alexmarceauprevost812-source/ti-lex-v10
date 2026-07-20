// ti-lex-AL v10 — Edge Function log-analyst
// =====================================================================
// Analyse RÉELLE des journaux de sécurité disponibles côté serveur :
//   - injection_audit  : tentatives bloquées/suspectes détectées par
//                        Agent AL (jailbreak, injection, commandes
//                        protégées, NIP invalide, etc.)
//   - security_findings/security_scans : résultats réels des scans SILEX
//
// IMPORTANT — intégrité : il n'existe PAS de table de connexions (IP,
// géolocalisation) dans ce projet. Ce rapport ne fabrique JAMAIS de
// données : les champs "ips"/"geo" n'apparaissent pas ; à la place on
// utilise les vraies routes ("path") et vrais comptes ciblés.
// Le regroupement en incidents et TOUS les compteurs sont calculés en
// TypeScript déterministe à partir des vraies lignes de la base — Claude
// sert UNIQUEMENT à rédiger le texte humain (résumé, évaluation de
// risque, mesures suggérées) à partir de ces faits déjà établis. Le
// prompt lui interdit explicitement d'inventer des entités/comptes/
// événements qui ne sont pas dans les faits fournis.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const CLUSTER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface AuditRow {
  id: string; user_id: string | null; path: string | null; message: string | null;
  pin_ok: boolean; scope_ok: boolean; success: boolean; result: string | null; created_at: string;
}
interface FindingRow {
  id: string; scan_id: string; severity: string; title: string; description: string | null;
  affected_target: string | null; remediation: string | null; loi25_relevance: string | null; discovered_at: string;
}

function clusterAuditRows(rows: AuditRow[]): AuditRow[][] {
  const parUser = new Map<string, AuditRow[]>();
  for (const r of rows) {
    const k = r.user_id || "anonyme";
    if (!parUser.has(k)) parUser.set(k, []);
    parUser.get(k)!.push(r);
  }
  const clusters: AuditRow[][] = [];
  for (const rowsUser of parUser.values()) {
    rowsUser.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let courant: AuditRow[] = [];
    for (const r of rowsUser) {
      if (courant.length === 0) { courant.push(r); continue; }
      const dernier = courant[courant.length - 1];
      const gap = new Date(r.created_at).getTime() - new Date(dernier.created_at).getTime();
      if (gap <= CLUSTER_WINDOW_MS) courant.push(r);
      else { clusters.push(courant); courant = [r]; }
    }
    if (courant.length) clusters.push(courant);
  }
  return clusters;
}

function severiteAudit(cluster: AuditRow[]): "critical" | "high" | "medium" | "low" {
  const n = cluster.length;
  const aDesTags = cluster.some((r) => (r.result || "").includes(":")); // ex "block:prompt-injection"
  if (n >= 5) return "critical";
  if (n >= 3 || (n >= 2 && aDesTags)) return "high";
  if (n >= 2) return "medium";
  return "low";
}

async function userEmail(admin: ReturnType<typeof createClient>, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
    return (data as any)?.username || userId;
  } catch (_) { return userId; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Non authentifié" }, 401);

    const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Session invalide" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Admin uniquement (mêmes données sensibles que le reste de la section sécurité).
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Réservé à l'administrateur." }, 403);

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* body vide = defaults */ }
    const heures = Number(body?.hours) > 0 && Number(body?.hours) <= 168 ? Number(body.hours) : 24;
    const depuis = new Date(Date.now() - heures * 3600 * 1000).toISOString();

    const [auditRes, findingsRes] = await Promise.all([
      admin.from("injection_audit").select("id,user_id,path,message,pin_ok,scope_ok,success,result,created_at")
        .gte("created_at", depuis).order("created_at", { ascending: true }),
      admin.from("security_findings").select("id,scan_id,severity,title,description,affected_target,remediation,loi25_relevance,discovered_at")
        .gte("discovered_at", depuis).in("severity", ["CRITIQUE", "HAUTE", "CRITICAL", "HIGH"]).order("discovered_at", { ascending: false }).limit(20),
    ]);

    const auditRows = (auditRes.data || []) as AuditRow[];
    const findingRows = (findingsRes.data || []) as FindingRow[];
    const suspectes = auditRows.filter((r) => !r.success);

    // ---- Stats (100% réelles, calculées ici, jamais par l'IA) ----
    const parPath = new Map<string, number>();
    const parCompte = new Map<string, number>();
    for (const r of suspectes) {
      const p = r.path || "(inconnu)";
      parPath.set(p, (parPath.get(p) || 0) + 1);
      const c = r.user_id || "anonyme";
      parCompte.set(c, (parCompte.get(c) || 0) + 1);
    }
    const topPaths = [...parPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, events]) => ({ path, events }));
    const topComptesIds = [...parCompte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topComptes = await Promise.all(topComptesIds.map(async ([userId, events]) => ({
      user: userId === "anonyme" ? "anonyme" : (await userEmail(admin, userId)) || userId, events,
    })));

    const clusters = clusterAuditRows(suspectes);
    const incidentsBrutsAudit = clusters.map((cluster) => ({
      kind: "injection_audit" as const,
      severity: severiteAudit(cluster),
      cluster,
    }));
    const incidentsBrutsScan = findingRows.map((f) => ({
      kind: "security_finding" as const,
      severity: (/CRITI/i.test(f.severity) ? "critical" : "high") as "critical" | "high",
      finding: f,
    }));

    const critiques = incidentsBrutsAudit.filter((i) => i.severity === "critical").length
      + incidentsBrutsScan.filter((i) => i.severity === "critical").length;

    const faitsPourClaude: any[] = [];
    for (const inc of incidentsBrutsAudit) {
      const emails = await Promise.all([...new Set(inc.cluster.map((r) => r.user_id))].map((id) => userEmail(admin, id)));
      faitsPourClaude.push({
        ref: "audit_" + inc.cluster[0].id,
        severity: inc.severity,
        events_count: inc.cluster.length,
        accounts: emails.filter(Boolean),
        paths: [...new Set(inc.cluster.map((r) => r.path).filter(Boolean))],
        results: [...new Set(inc.cluster.map((r) => r.result).filter(Boolean))],
        timeline: inc.cluster.map((r) => ({ ts: r.created_at, event: `Tentative sur ${r.path} — ${r.result || "non conforme"} (pin_ok=${r.pin_ok}, scope_ok=${r.scope_ok})` })),
      });
    }
    for (const inc of incidentsBrutsScan) {
      faitsPourClaude.push({
        ref: "finding_" + inc.finding.id,
        severity: inc.severity,
        title: inc.finding.title,
        description: inc.finding.description,
        affected_target: inc.finding.affected_target,
        remediation_connue: inc.finding.remediation,
        loi25_deja_evaluee: inc.finding.loi25_relevance,
        discovered_at: inc.finding.discovered_at,
      });
    }

    let narrations: Record<string, any> = {};
    if (faitsPourClaude.length && ANTHROPIC_KEY) {
      narrations = await genererNarrations(faitsPourClaude);
    }

    const incidents = [
      ...incidentsBrutsAudit.map((inc, i) => {
        const ref = "audit_" + inc.cluster[0].id;
        const n = narrations[ref] || {};
        return {
          id: "INC-" + new Date(inc.cluster[0].created_at).toISOString().slice(0, 10) + "-" + String(i + 1).padStart(3, "0"),
          severity: inc.severity,
          type: "suspicious_activity_agent_al",
          summary: n.summary || `${inc.cluster.length} tentative(s) bloquée(s) par Agent AL sur ${[...new Set(inc.cluster.map((r) => r.path))].join(", ")}.`,
          timeline: inc.cluster.map((r) => ({ ts: r.created_at, event: `Tentative sur ${r.path} — ${r.result || "non conforme"}` })),
          entities: {
            accounts: [...new Set(inc.cluster.map((r) => r.user_id).filter(Boolean))],
            paths: [...new Set(inc.cluster.map((r) => r.path).filter(Boolean))],
          },
          risk_assessment: n.risk_assessment || { likelihood: inc.severity === "critical" ? "élevée" : "moyenne", impact: "accès ou action non autorisée si la protection avait échoué", overall: inc.severity },
          suggested_containment: n.suggested_containment || ["Vérifier l'identité du compte concerné.", "Confirmer que les tentatives ont bien été bloquées côté serveur."],
          law25_relevance: n.law25_relevance || { personal_data_at_risk: false, description: "Tentative bloquée avant tout accès à des données.", notification_required: false },
        };
      }),
      ...incidentsBrutsScan.map((inc, i) => {
        const ref = "finding_" + inc.finding.id;
        const n = narrations[ref] || {};
        return {
          id: "INC-SCAN-" + inc.finding.id.slice(0, 8),
          severity: inc.severity,
          type: "vulnerability_scan_finding",
          summary: n.summary || inc.finding.title,
          timeline: [{ ts: inc.finding.discovered_at, event: inc.finding.title }],
          entities: { targets: [inc.finding.affected_target].filter(Boolean) },
          risk_assessment: n.risk_assessment || { likelihood: "confirmée", impact: inc.finding.description || inc.finding.title, overall: inc.severity },
          suggested_containment: n.suggested_containment || (inc.finding.remediation ? [inc.finding.remediation] : ["Consulter le scan SILEX complet pour la remédiation détaillée."]),
          law25_relevance: n.law25_relevance || { personal_data_at_risk: !!inc.finding.loi25_relevance, description: inc.finding.loi25_relevance || "Non évaluée.", notification_required: false },
        };
      }),
    ];

    return json({
      meta: {
        analyzer: "ti-lex-log-analyst",
        source: "injection_audit+security_findings",
        source_note: "Aucune table de connexions (IP/géolocalisation) n'existe dans ce projet — ce rapport analyse les tentatives bloquées par Agent AL et les résultats des scans SILEX, pas les connexions.",
        timeframe: heures + "h",
        generated_at: new Date().toISOString(),
      },
      stats: {
        total_events: auditRows.length,
        suspicious_events: suspectes.length,
        critical_incidents: critiques,
        top_paths_suspicious: topPaths,
        top_accounts_targeted: topComptes,
      },
      incidents,
    }, 200);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

// Claude ne fait QUE rédiger — les faits (comptes, chemins, compteurs, horodatage)
// lui sont fournis tels quels et il doit s'y limiter strictement.
async function genererNarrations(faits: any[]): Promise<Record<string, any>> {
  const prompt = `Voici des faits de sécurité RÉELS extraits de la base de données (ne rien inventer, ne pas ajouter de compte/IP/événement qui n'est pas listé ici) :\n\n${JSON.stringify(faits, null, 2)}\n\nPour CHAQUE entrée (identifiée par "ref"), rédige en français québécois professionnel :\n- summary : 1-2 phrases\n- risk_assessment: {likelihood, impact, overall} (likelihood/overall parmi: faible, moyenne, élevée, critique)\n- suggested_containment: liste de 2-4 actions concrètes\n- law25_relevance: {personal_data_at_risk: bool, description: string, notification_required: bool} — évalue selon la Loi 25 du Québec (protection des renseignements personnels), sans exagérer si rien n'indique de donnée personnelle réellement exposée.\n\nRéponds UNIQUEMENT en JSON valide : {"<ref>": {"summary":"...","risk_assessment":{...},"suggested_containment":[...],"law25_relevance":{...}}, ...}. Aucun texte avant/après, aucun bloc markdown.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 4096,
        system: "Tu rédiges des rapports de sécurité en français québécois à partir de faits déjà établis. Tu n'inventes JAMAIS de compte, d'IP, d'événement ou de chiffre qui n'est pas explicitement fourni. Réponds uniquement en JSON valide.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await r.json();
    const texte = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const nettoye = texte.replace(/```json|```/g, "").trim();
    return JSON.parse(nettoye);
  } catch (_) {
    return {};
  }
}
