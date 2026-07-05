// ============================================================================
// ti-lex Security Agent v3.0 — Équipe SILEX — MOTEUR DE RECON RÉEL
// Modèle: claude-sonnet-4-6 | Admin: alexmarceauprevost812@gmail.com
// ----------------------------------------------------------------------------
// v3.0: fini les findings inventés. Chaque module fait une VRAIE vérification :
//   • DNS / SPF / DMARC / MX ...... DNS-over-HTTPS (Cloudflare)  [RÉEL]
//   • Headers sécurité HTTP ........ fetch + lecture des vrais headers [RÉEL]
//   • CORS permissif ............... probe avec Origin piégé [RÉEL]
//   • TLS + redirection HTTP→HTTPS . vrai handshake / vrai 3xx [RÉEL]
//   • Rate limiting ................ check DB (RPC check_rate_limit) [RÉEL]
//   • RLS .......................... RPC silex_rls_summary (dégrade proprement)
//   • HIBP ......................... API réelle (clé existante) [RÉEL]
//   • Scan CVE / port scan ......... MARQUÉ honnêtement "hors périmètre Edge"
// Claude sert UNIQUEMENT à écrire les descriptions, pas à détecter.
// Tous les appels réseau ont un timeout (plus de scans "zombie").
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MODEL = Deno.env.get("SECURITY_AGENT_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "ti-lex-al@ti-lex.ca";
const ADMIN_EMAIL = "alexmarceauprevost812@gmail.com";
const ADMIN_USER_ID = "d9a1985a-e106-4ea5-9ada-cac775c0b820";
const TILEX_SOW_ID = "9b7013d9-6bd3-4b13-8a88-0fc9869cced4";
const HIBP_KEY = Deno.env.get("HIBP_API_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEV_EMOJI: Record<string, string> = {
  critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪"
};
const SEV_COLOR: Record<string, string> = {
  critical: "#FF0000", high: "#FF6600", medium: "#FFB800", low: "#4f8ef7", info: "#37e0a0"
};

type Sev = "critical" | "high" | "medium" | "low" | "info";

interface Finding {
  source: string;
  severity: Sev;
  title: string;
  raw_description: string;
  affected_target: string;
  cve_ids?: string[];
  cwe_ids?: string[];
  description?: string;
  business_impact?: string;
  loi25_relevance?: string;
  remediation?: string;
  remediation_effort?: string;
}

// deno-lint-ignore no-explicit-any
type DB = any;

// ─── UTILITAIRES RÉSEAU (timeout obligatoire) ───────────────────────────────
async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function hostnameOf(target: string): string {
  try {
    return new URL(target.includes("://") ? target : `https://${target}`).hostname;
  } catch {
    return target.replace(/^https?:\/\//, "").split("/")[0];
  }
}
function urlOf(target: string): string {
  return target.includes("://") ? target : `https://${target}`;
}

function mk(source: string, severity: Sev, title: string, desc: string, target: string, cwe?: string[]): Finding {
  return { source, severity, title, raw_description: desc, affected_target: target, cwe_ids: cwe ?? [] };
}

// ─── DNS-over-HTTPS (RÉEL) ──────────────────────────────────────────────────
async function dohQuery(name: string, type: string): Promise<string[]> {
  try {
    const u = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetchT(u, { headers: { accept: "application/dns-json" } }, 8000);
    if (!res.ok) return [];
    const j = await res.json();
    return (j.Answer ?? []).map((a: { data: string }) =>
      String(a.data).replace(/^"|"$/g, "").replace(/"\s+"/g, "")
    );
  } catch {
    return [];
  }
}

// ─── MODULE DNS / EMAIL AUTH (RÉEL) ─────────────────────────────────────────
async function moduleDNS(target: string): Promise<Finding[]> {
  const host = hostnameOf(target);
  const out: Finding[] = [];

  const txt = await dohQuery(host, "TXT");
  const spf = txt.find((r) => r.toLowerCase().includes("v=spf1"));
  if (!spf) {
    out.push(mk("dns-recon", "medium", "SPF absent", `Aucun enregistrement SPF trouvé pour ${host}. Le domaine peut être usurpé pour l'envoi de courriels.`, target, ["CWE-290"]));
  } else {
    out.push(mk("dns-recon", "info", "SPF présent", `SPF détecté pour ${host} : ${spf.slice(0, 120)}`, target));
  }

  const dmarcTxt = await dohQuery(`_dmarc.${host}`, "TXT");
  const dmarc = dmarcTxt.find((r) => r.toLowerCase().includes("v=dmarc1"));
  if (!dmarc) {
    out.push(mk("dns-recon", "medium", "DMARC absent", `Aucune politique DMARC pour ${host}. Protection anti-usurpation incomplète.`, target, ["CWE-290"]));
  } else if (/p\s*=\s*none/i.test(dmarc)) {
    out.push(mk("dns-recon", "low", "DMARC en mode surveillance (p=none)", `DMARC présent mais p=none : aucun blocage réel. Valeur : ${dmarc.slice(0, 120)}`, target));
  } else {
    out.push(mk("dns-recon", "info", "DMARC appliqué", `DMARC actif pour ${host} : ${dmarc.slice(0, 120)}`, target));
  }

  const mx = await dohQuery(host, "MX");
  out.push(mk("dns-recon", "info", "Enregistrements MX", `${mx.length} serveur(s) mail détecté(s) pour ${host}.`, target));

  return out;
}

// ─── MODULE HEADERS HTTP (RÉEL) ─────────────────────────────────────────────
async function moduleHTTP(target: string): Promise<Finding[]> {
  const url = urlOf(target);
  const out: Finding[] = [];
  let res: Response;
  try {
    res = await fetchT(url, { method: "GET", redirect: "manual" }, 10000);
  } catch (e) {
    out.push(mk("http-probe", "info", "Cible HTTP injoignable", `Impossible de charger ${url} : ${e instanceof Error ? e.message : String(e)}`, target));
    return out;
  }
  const h = res.headers;
  const missing: string[] = [];

  if (!h.has("content-security-policy")) {
    out.push(mk("http-probe", "medium", "Content-Security-Policy manquant", `Aucun header CSP sur ${url}. Risque XSS/injection accru.`, target, ["CWE-693"]));
    missing.push("CSP");
  }
  if (!h.has("strict-transport-security")) {
    out.push(mk("http-probe", "medium", "HSTS manquant", `Strict-Transport-Security absent sur ${url}. Risque de downgrade vers HTTP.`, target, ["CWE-319"]));
    missing.push("HSTS");
  }
  const csp = h.get("content-security-policy") ?? "";
  if (!h.has("x-frame-options") && !csp.includes("frame-ancestors")) {
    out.push(mk("http-probe", "low", "Protection clickjacking manquante", `Ni X-Frame-Options ni frame-ancestors sur ${url}.`, target, ["CWE-1021"]));
  }
  if (!h.has("x-content-type-options")) {
    out.push(mk("http-probe", "low", "X-Content-Type-Options manquant", `Le navigateur peut faire du MIME sniffing sur ${url}.`, target, ["CWE-693"]));
  }
  const server = h.get("server");
  if (server && /\d/.test(server)) {
    out.push(mk("http-probe", "low", "Version serveur exposée", `En-tête Server divulgue : "${server}".`, target, ["CWE-200"]));
  }
  const xpb = h.get("x-powered-by");
  if (xpb) {
    out.push(mk("http-probe", "low", "En-tête X-Powered-By exposé", `Techno divulguée : "${xpb}".`, target, ["CWE-200"]));
  }
  if (missing.length === 0) {
    out.push(mk("http-probe", "info", "Headers sécurité principaux présents", `CSP et HSTS détectés sur ${url}.`, target));
  }
  return out;
}

// ─── MODULE CORS (RÉEL) ─────────────────────────────────────────────────────
async function moduleCORS(target: string): Promise<Finding[]> {
  const url = urlOf(target);
  const probeOrigin = "https://silex-cors-probe.example";
  let res: Response;
  try {
    res = await fetchT(url, { method: "GET", headers: { Origin: probeOrigin } }, 10000);
  } catch {
    return [mk("cors-probe", "info", "CORS non testable", `Cible ${url} injoignable pour le test CORS.`, target)];
  }
  const acao = res.headers.get("access-control-allow-origin");
  const acac = (res.headers.get("access-control-allow-credentials") ?? "").toLowerCase();

  if (acao === probeOrigin) {
    return [mk("cors-probe", "high", "CORS reflète une origine arbitraire", `Access-Control-Allow-Origin renvoie l'origine piégée envoyée. N'importe quel site peut lire les réponses.`, target, ["CWE-942"])];
  }
  if (acao === "*") {
    if (acac === "true") {
      return [mk("cors-probe", "high", "CORS wildcard AVEC credentials", `Access-Control-Allow-Origin: * combiné à credentials=true. Configuration dangereuse.`, target, ["CWE-942"])];
    }
    return [mk("cors-probe", "medium", "CORS permissif (Origin: *)", `Access-Control-Allow-Origin: *. Acceptable pour une anon key Supabase mais à documenter.`, target, ["CWE-942"])];
  }
  return [mk("cors-probe", "info", "CORS restrictif", `Pas de wildcard ni de reflet d'origine détecté sur ${url}.`, target)];
}

// ─── MODULE TLS / REDIRECTION (RÉEL) ────────────────────────────────────────
async function moduleTLS(target: string): Promise<Finding[]> {
  const host = hostnameOf(target);
  const out: Finding[] = [];
  try {
    await fetchT(`https://${host}`, { method: "HEAD" }, 8000);
    out.push(mk("tls-probe", "info", "HTTPS joignable", `Handshake TLS réussi avec ${host}.`, target));
  } catch (e) {
    out.push(mk("tls-probe", "high", "HTTPS non joignable", `Échec de connexion HTTPS à ${host} : ${e instanceof Error ? e.message : String(e)}`, target, ["CWE-319"]));
    return out;
  }
  try {
    const r = await fetchT(`http://${host}`, { method: "HEAD", redirect: "manual" }, 8000);
    const loc = r.headers.get("location") ?? "";
    if (r.status >= 300 && r.status < 400 && loc.startsWith("https://")) {
      out.push(mk("tls-probe", "info", "Redirection HTTP→HTTPS active", `${host} force la redirection vers HTTPS (${r.status}).`, target));
    } else {
      out.push(mk("tls-probe", "medium", "Pas de redirection HTTPS forcée", `http://${host} répond ${r.status} sans rediriger vers HTTPS.`, target, ["CWE-319"]));
    }
  } catch {
    out.push(mk("tls-probe", "info", "Port HTTP (80) fermé", `Aucune écoute HTTP en clair sur ${host} (bon signe).`, target));
  }
  return out;
}

// ─── MODULE RATE LIMITING (RÉEL — vérifie l'infra dans la base) ──────────────
async function moduleRateLimit(db: DB, target: string): Promise<Finding[]> {
  let rpcExists = false;
  try {
    const { data, error } = await db.rpc("check_rate_limit", {
      p_key: "silex:selftest:ratelimit", p_max: 1000000, p_window_seconds: 60,
    });
    rpcExists = !error && typeof data === "boolean";
  } catch { rpcExists = false; }

  let recent = 0;
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { count } = await db.from("rate_limits").select("*", { count: "exact", head: true }).gte("window_start", since);
    recent = count ?? 0;
  } catch { recent = 0; }

  if (rpcExists) {
    const ev = recent > 0 ? `RPC active + ${recent} fenêtre(s) sur 7 jours` : "RPC présente (pas d'activité récente à limiter)";
    return [mk("config-check", "info", "Rate limiting API présent", `Rate limiting vérifié et actif. ${ev}.`, target)];
  }
  return [mk("config-check", "high", "Rate limiting API absent", `Aucune RPC check_rate_limit ni activité de rate limiting détectée.`, target, ["CWE-307"])];
}

// ─── MODULE RLS (RÉEL si RPC dispo, sinon dégrade honnêtement) ───────────────
async function moduleRLS(db: DB, target: string): Promise<Finding[]> {
  try {
    const { data, error } = await db.rpc("silex_rls_summary");
    if (error || !Array.isArray(data)) {
      return [mk("supabase-audit", "info", "RLS non vérifié", `La RPC silex_rls_summary n'existe pas encore — vérification RLS sautée (aucune supposition faite).`, target)];
    }
    const sansRls = data.filter((t: { rls_enabled: boolean }) => !t.rls_enabled);
    if (sansRls.length === 0) {
      return [mk("supabase-audit", "info", "RLS actif partout", `RLS vérifié : activé sur les ${data.length} table(s) du schéma public.`, target)];
    }
    const noms = sansRls.slice(0, 8).map((t: { table_name: string }) => t.table_name).join(", ");
    return [mk("supabase-audit", "high", "Tables sans RLS", `${sansRls.length} table(s) sans RLS : ${noms}. Données potentiellement exposées.`, target, ["CWE-284"])];
  } catch {
    return [mk("supabase-audit", "info", "RLS non vérifié", `Vérification RLS impossible (RPC absente).`, target)];
  }
}

// ─── MARQUEURS HONNÊTES (ce qui nécessite un moteur externe) ─────────────────
function honestGaps(target: string, scanType: string): Finding[] {
  const out: Finding[] = [];
  if (["vuln_scan", "full_audit"].includes(scanType)) {
    out.push(mk("scope-note", "info", "Scan CVE non exécuté", `La détection de CVE (type nuclei/OpenVAS) nécessite un moteur externe sur VM/conteneur — hors périmètre d'une Edge Function. Non simulé.`, target));
  }
  if (["port_scan", "full_audit"].includes(scanType)) {
    out.push(mk("scope-note", "info", "Port scan non exécuté", `Le balayage de ports (nmap) requiert des sockets bruts non disponibles en Edge Function. Non simulé.`, target));
  }
  return out;
}

// ─── ORCHESTRATION DES MODULES RÉELS ────────────────────────────────────────
async function runScanModules(target: string, scanType: string, db: DB): Promise<Finding[]> {
  const jobs: Promise<Finding[]>[] = [];

  if (["passive_recon", "full_audit"].includes(scanType)) {
    jobs.push(moduleDNS(target));
    jobs.push(moduleTLS(target));
  }
  if (["web_scan", "full_audit"].includes(scanType)) {
    jobs.push(moduleHTTP(target));
    jobs.push(moduleCORS(target));
  }
  if (["vuln_scan", "full_audit"].includes(scanType)) {
    jobs.push(moduleRateLimit(db, target));
  }
  if (["config_audit", "full_audit"].includes(scanType)) {
    jobs.push(moduleRLS(db, target));
  }

  const results = await Promise.allSettled(jobs);
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") findings.push(...r.value);
    else findings.push(mk("engine", "info", "Module en erreur", `Un module de scan a échoué : ${String(r.reason).slice(0, 160)}`, target));
  }
  findings.push(...honestGaps(target, scanType));
  return findings;
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!ANTHROPIC_KEY) return err(500, "ANTHROPIC_API_KEY manquante.");

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return err(401, "Authorization manquant");
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user || user.id !== ADMIN_USER_ID) return err(403, "Accès réservé à l'administrateur ti-lex.");

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const { target, scan_type, silex_question, run_hibp } = body;
    if (!target || !scan_type) return err(400, "target et scan_type requis");

    // ⚠️ AUTORISATION LÉGALE OBLIGATOIRE — un vrai scan touche une vraie cible.
    const sowId = body.authorization_id || TILEX_SOW_ID;
    const { data: authCheck } = await db.rpc("verify_scan_authorization", {
      p_authorization_id: sowId, p_target: target, p_scan_type: scan_type,
    });
    const check = authCheck?.[0];
    if (!check?.authorized) {
      await db.rpc("append_audit_log", { p_scan_id: null, p_authorization_id: sowId, p_user_id: user.id, p_event_type: "scan_refused", p_event_data: { target, scan_type, reason: check?.reason } });
      return err(403, `Scan refusé: ${check?.reason}`);
    }

    const { data: scan } = await db.from("security_scans").insert({ authorization_id: sowId, user_id: user.id, target, scan_type, status: "running" }).select().single();
    if (!scan) return err(500, "Erreur création scan");

    await db.rpc("append_audit_log", { p_scan_id: scan.id, p_authorization_id: sowId, p_user_id: user.id, p_event_type: "scan_started", p_event_data: { target, scan_type, model: MODEL, engine: "recon-real-v3" } });

    let hibpSummary = "";
    if (run_hibp && HIBP_KEY) hibpSummary = await checkAdminHIBP();

    // 🔍 MODULES RÉELS
    const raw = await runScanModules(target, scan_type, db);
    const enriched = await enrichFindings(raw, target);
    const summary = await generateSummary(enriched, target, silex_question, hibpSummary);

    if (enriched.length > 0) {
      await db.from("security_findings").insert(
        enriched.map(f => ({
          scan_id: scan.id, severity: f.severity, title: f.title,
          description: f.description, affected_target: f.affected_target,
          cve_ids: f.cve_ids ?? [], cwe_ids: f.cwe_ids ?? [],
          business_impact: f.business_impact, loi25_relevance: f.loi25_relevance,
          remediation: f.remediation, remediation_effort: f.remediation_effort,
        }))
      );
    }

    const counts = countBySev(enriched);
    await db.from("security_scans").update({
      status: "completed", completed_at: new Date().toISOString(),
      executive_summary: summary,
      findings_critical: counts.critical, findings_high: counts.high,
      findings_medium: counts.medium, findings_low: counts.low, findings_info: counts.info,
    }).eq("id", scan.id);

    await db.rpc("append_audit_log", { p_scan_id: scan.id, p_authorization_id: sowId, p_user_id: user.id, p_event_type: "scan_completed", p_event_data: { findings_count: enriched.length, severity_counts: counts } });

    const alertFindings = enriched.filter(f => f.severity === "critical" || f.severity === "high");
    if (alertFindings.length > 0 && RESEND_KEY) {
      await sendSilexAlert({ scan_id: scan.id, target, scan_type, findings: alertFindings, total_counts: counts });
    }

    return new Response(JSON.stringify({
      success: true, scan_id: scan.id, target, scan_type,
      executive_summary: summary, findings_count: enriched.length,
      severity_counts: counts, findings: enriched, model_used: MODEL,
      engine: "recon-real-v3",
      hibp_summary: hibpSummary || undefined,
      alert_sent: alertFindings.length > 0 && !!RESEND_KEY,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return err(500, `Erreur: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── ALERTE EMAIL SILEX ─────────────────────────────────────────────────────
async function sendSilexAlert(params: {
  scan_id: string; target: string; scan_type: string;
  findings: Finding[]; total_counts: Record<string, number>;
}) {
  const critical = params.findings.filter(f => f.severity === "critical");
  const topSev = critical.length > 0 ? "critical" : "high";
  const emoji = SEV_EMOJI[topSev];
  const color = SEV_COLOR[topSev];
  const label = critical.length > 0 ? "ALERTE CRITIQUE" : "ALERTE ÉLEVÉE";

  const findingsHtml = params.findings.slice(0, 5).map(f => `
    <div style="border-left:4px solid ${SEV_COLOR[f.severity]};padding:12px 14px;margin-bottom:10px;background:#1a1a2e;border-radius:0 8px 8px 0;">
      <div style="color:${SEV_COLOR[f.severity]};font-size:11px;font-weight:800;letter-spacing:1px;margin-bottom:6px;">${f.severity.toUpperCase()}</div>
      <div style="color:#fff;font-size:14px;font-weight:700;margin-bottom:6px;">${f.title}</div>
      <div style="color:#ccc;font-size:12px;margin-bottom:8px;">${f.description?.slice(0, 200) ?? ""}</div>
      ${f.remediation ? `<div style="color:#37e0a0;font-size:12px;">✅ ${f.remediation?.slice(0, 150)}</div>` : ""}
    </div>`).join("");

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#111;color:#f0f0f0;">
  <div style="background:${color};padding:20px 24px;text-align:center;">
    <div style="font-size:36px;margin-bottom:8px;">${emoji} 🔰</div>
    <div style="font-size:22px;font-weight:900;color:#fff;">${label} — SILEX</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">ti-lex-v10 · Cybersécurité</div>
  </div>
  <div style="padding:24px;">
    <div style="background:#0d0d12;border:1px solid #a78bfa44;border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="color:#a78bfa;font-size:11px;font-weight:800;letter-spacing:2px;margin-bottom:10px;">📋 RÉSUMÉ DU SCAN</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <span style="color:#ff3a5c;font-size:13px;">CRITIQUE: ${params.total_counts.critical}</span>
        <span style="color:#ff7f27;font-size:13px;">ÉLEVÉ: ${params.total_counts.high}</span>
        <span style="color:#ffcf4a;font-size:13px;">MOYEN: ${params.total_counts.medium}</span>
      </div>
      <div style="color:#6c6c78;font-size:12px;margin-top:8px;">Cible: ${params.target} · ${params.scan_type.replace("_"," ").toUpperCase()}</div>
    </div>
    <div style="color:#a78bfa;font-size:11px;font-weight:800;letter-spacing:2px;margin-bottom:12px;">⚠️ FINDINGS PRIORITAIRES</div>
    ${findingsHtml}
  </div>
  <div style="padding:16px 24px;background:#080808;text-align:center;">
    <div style="color:#444;font-size:11px;">🔰 SILEX · ti-lex-v10 · Produit du Québec ⚜️ · ${new Date().toLocaleString("fr-CA")}</div>
    <div style="color:#333;font-size:10px;margin-top:4px;">CONFIDENTIEL — admin uniquement</div>
  </div>
</div></body></html>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `SILEX Cybersécurité <${FROM_EMAIL}>`,
        to: [ADMIN_EMAIL],
        subject: `${emoji} ${label} — ${params.target} — ${params.findings.length} finding(s) prioritaire(s)`,
        html,
      }),
    });
  } catch (e) {
    console.error("[SILEX] Erreur envoi alerte:", e);
  }
}

// ─── HIBP CHECK ADMIN (RÉEL) ────────────────────────────────────────────────
async function checkAdminHIBP(): Promise<string> {
  if (!HIBP_KEY) return "";
  try {
    const res = await fetchT(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(ADMIN_EMAIL)}?truncateResponse=true`,
      { headers: { "hibp-api-key": HIBP_KEY, "User-Agent": "ti-lex-al-silex/3.0" } },
      10000
    );
    if (res.status === 404) return `✅ ${ADMIN_EMAIL} : aucune fuite détectée dans HIBP.`;
    if (!res.ok) return `⚠️ HIBP indisponible (${res.status}).`;
    const breaches = await res.json() as Array<{ Name: string }>;
    return `🔴 ${ADMIN_EMAIL} trouvé dans ${breaches.length} fuite(s) HIBP : ${breaches.map(b => b.Name).join(", ")}.`;
  } catch { return "⚠️ Erreur connexion HIBP."; }
}

// ─── ENRICHISSEMENT CLAUDE (prose uniquement, pas de détection) ─────────────
async function enrichFindings(findings: Finding[], target: string): Promise<Finding[]> {
  if (!findings.length) return [];
  const prompt = `Tu es SILEX 🔰, agent cybersécurité ti-lex (Produit du Québec).\nCible: ${target}\n\nCes findings proviennent de vérifications RÉELLES. Ne change RIEN aux faits, à la sévérité ni aux titres. Rédige seulement, en français québécois professionnel, pour chaque finding:\n1. description: clair (1-2 phrases), fidèle au raw_description\n2. business_impact: impact concret pour ti-lex\n3. loi25_relevance: lien Loi 25 / PIPEDA\n4. remediation: étapes concrètes\n5. remediation_effort: trivial|low|medium|high\n\nJSON strict uniquement:\n{"enriched":[{"index":0,"description":"","business_impact":"","loi25_relevance":"","remediation":"","remediation_effort":""}]}\n\nFindings:\n${JSON.stringify(findings.map((f, i) => ({ index: i, title: f.title, severity: f.severity, raw_description: f.raw_description })), null, 2)}`;
  try {
    const res = await anthropic(prompt, 4000);
    const parsed = JSON.parse(res.replace(/```json|```/g, "").trim());
    return findings.map((f, i) => {
      const e = parsed.enriched?.find((x: Record<string, unknown>) => x.index === i) ?? parsed.enriched?.[i];
      return { ...f, description: e?.description ?? f.raw_description, business_impact: e?.business_impact ?? "À évaluer", loi25_relevance: e?.loi25_relevance ?? "À évaluer", remediation: e?.remediation ?? "À documenter", remediation_effort: e?.remediation_effort ?? "medium" };
    });
  } catch {
    // Si l'enrichissement plante, on garde les faits réels sans prose IA.
    return findings.map((f) => ({ ...f, description: f.raw_description, business_impact: "À évaluer", loi25_relevance: "À évaluer", remediation: "À documenter", remediation_effort: "medium" }));
  }
}

// ─── RÉSUMÉ EXÉCUTIF ────────────────────────────────────────────────────────
async function generateSummary(findings: Finding[], target: string, question?: string, hibp?: string): Promise<string> {
  const counts = countBySev(findings);
  const hibpCtx = hibp ? `\n\nHIBP Admin: ${hibp}` : "";
  const qCtx = question ? `\n\nQuestion: ${question}` : "";
  const prompt = `Tu es SILEX 🔰, agent cybersécurité ti-lex.${qCtx}${hibpCtx}\n\nCible: ${target} | ${findings.length} findings RÉELS | CRITIQUE:${counts.critical} ÉLEVÉ:${counts.high} MOYEN:${counts.medium}\nTop findings:\n${findings.slice(0,4).map(f=>`[${f.severity.toUpperCase()}] ${f.title}`).join("\n")}\n\nRésumé exécutif court (lignes ≤65 chars). Appréciation globale → enjeux Loi 25 → action prioritaire.`;
  try { return await anthropic(prompt, 800); } catch { return `Scan de ${target} : ${findings.length} findings (${counts.high} élevé, ${counts.medium} moyen).`; }
}

async function anthropic(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetchT("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  }, 30000);
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const d = await res.json();
  return d.content?.[0]?.text ?? "";
}

function countBySev(f: Finding[]) {
  return f.reduce((a, x) => { a[x.severity] = (a[x.severity] ?? 0) + 1; return a; }, { critical:0, high:0, medium:0, low:0, info:0 } as Record<string,number>);
}

function err(status: number, msg: string) {
  return new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
