// ============================================================================
// ti-lex Security Agent v4.0 — Équipe SILEX — TOUS LES MOTEURS RÉELS
// Modèle: claude-sonnet-4-6 | Admin: alexmarceauprevost812@gmail.com
// ----------------------------------------------------------------------------
// v4.0 : la détection vit désormais dans _shared/moteurs-cyber.ts, une
// bibliothèque de 39 moteurs qui font tous une VRAIE vérification :
//   • Reconnaissance DNS ... DNS/DNSSEC/CAA/PTR/sous-domaines (DoH + crt.sh)
//   • Courriel ............. SPF/DKIM/DMARC, MTA-STS, TLS-RPT, BIMI
//   • Surface web .......... en-têtes, TLS, CORS, témoins, méthodes, robots,
//                            security.txt, techno, contenu mixte, SRI, Loi 25
//   • Exposition ........... secrets dans les paquets JS servis, archives web
//   • Actif léger .......... fichiers exposés, consoles admin, ports HTTP,
//                            services de données, redirection ouverte
//   • Posture interne ...... RLS, politiques, exposition anon RÉELLEMENT
//                            testée, buckets, fonctions, extensions, comptes,
//                            journalisation, limitation de débit
//   • Fuites ............... Have I Been Pwned (domaine et adresse)
// Ce qui est impossible depuis une Edge Function (CVE, nmap, dark web) est
// déclaré honnêtement par le moteur « portee_externe » — jamais simulé.
// Claude n'intervient que pour rédiger la prose, jamais pour détecter.
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  catalogue,
  type Constat,
  creerContexte,
  executerMoteurs,
  fetchT,
  MOTEURS_PAR_ID,
  PROFILS,
  resoudreMoteurs,
} from "../_shared/moteurs-cyber.ts";

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
const ENGINE_VERSION = "silex-moteurs-v4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEV_EMOJI: Record<string, string> = {
  critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪",
};
const SEV_COLOR: Record<string, string> = {
  critical: "#FF0000", high: "#FF6600", medium: "#FFB800", low: "#4f8ef7", info: "#37e0a0",
};

/** Un constat enrichi par Claude — les faits viennent des moteurs, la prose de l'IA. */
interface Finding extends Constat {
  description?: string;
  business_impact?: string;
  loi25_relevance?: string;
  remediation?: string;
  remediation_effort?: string;
}

// deno-lint-ignore no-explicit-any
type DB = any;

// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION DES MOTEURS RÉELS
// ════════════════════════════════════════════════════════════════════════════
async function lancerMoteurs(
  target: string,
  scanType: string,
  moteursDemandes: string[] | undefined,
  db: DB,
): Promise<{ constats: Constat[]; journal: Awaited<ReturnType<typeof executerMoteurs>>["journal"]; ids: string[] }> {
  const { ids, inconnus } = resoudreMoteurs({ scan_type: scanType, moteurs: moteursDemandes });

  const ctx = creerContexte(target, {
    db,
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    hibpKey: HIBP_KEY ?? undefined,
    // L'autorisation légale a déjà été validée en amont (verify_scan_authorization) :
    // les moteurs actifs légers sont donc permis.
    autoriseActif: true,
  });

  const { constats, journal } = await executerMoteurs(ids, ctx, { concurrence: 5, budgetMs: 110_000 });

  if (inconnus.length > 0) {
    constats.push({
      moteur: "engine",
      source: "scope-note",
      severity: "info",
      title: "Moteur(s) inconnu(s) ignoré(s)",
      raw_description: `Les identifiants suivants ne correspondent à aucun moteur du catalogue et ont été ignorés : ${inconnus.join(", ")}.`,
      affected_target: target,
      cve_ids: [],
      cwe_ids: [],
      preuve: { inconnus },
    });
  }
  return { constats, journal, ids };
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return err(401, "Authorization manquant");
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user || user.id !== ADMIN_USER_ID) return err(403, "Accès réservé à l'administrateur ti-lex.");

    const body = await req.json().catch(() => ({}));

    // ── Catalogue des moteurs (alimente le sélecteur de l'interface) ────────
    if (body.action === "catalogue") {
      return new Response(JSON.stringify({ success: true, ...catalogue(), engine: ENGINE_VERSION }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!ANTHROPIC_KEY) return err(500, "ANTHROPIC_API_KEY manquante.");

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { target, scan_type, moteurs, silex_question, run_hibp } = body;
    if (!target) return err(400, "target requis");
    if (!scan_type && !(Array.isArray(moteurs) && moteurs.length > 0)) {
      return err(400, "scan_type ou moteurs requis");
    }
    const typeScan = scan_type || "personnalise";

    // ⚠️ AUTORISATION LÉGALE OBLIGATOIRE — un vrai scan touche une vraie cible.
    const sowId = body.authorization_id || TILEX_SOW_ID;
    const { data: authCheck } = await db.rpc("verify_scan_authorization", {
      p_authorization_id: sowId, p_target: target, p_scan_type: typeScan,
    });
    const check = authCheck?.[0];
    if (!check?.authorized) {
      await db.rpc("append_audit_log", {
        p_scan_id: null, p_authorization_id: sowId, p_user_id: user.id,
        p_event_type: "scan_refused", p_event_data: { target, scan_type: typeScan, reason: check?.reason },
      });
      return err(403, `Scan refusé: ${check?.reason}`);
    }

    const { data: scan } = await db.from("security_scans")
      .insert({ authorization_id: sowId, user_id: user.id, target, scan_type: typeScan, status: "running" })
      .select().single();
    if (!scan) return err(500, "Erreur création scan");

    await db.rpc("append_audit_log", {
      p_scan_id: scan.id, p_authorization_id: sowId, p_user_id: user.id,
      p_event_type: "scan_started",
      p_event_data: { target, scan_type: typeScan, model: MODEL, engine: ENGINE_VERSION, moteurs: moteurs ?? null },
    });

    let hibpSummary = "";
    if (run_hibp && HIBP_KEY) hibpSummary = await checkAdminHIBP();

    // 🔍 MOTEURS RÉELS
    const { constats, journal, ids } = await lancerMoteurs(target, typeScan, moteurs, db);
    const enriched = await enrichFindings(constats, target);
    const summary = await generateSummary(enriched, target, silex_question, hibpSummary);

    if (enriched.length > 0) {
      await db.from("security_findings").insert(
        enriched.map((f) => ({
          scan_id: scan.id,
          severity: f.severity,
          title: f.title,
          description: f.description,
          affected_target: f.affected_target,
          cve_ids: f.cve_ids ?? [],
          cwe_ids: f.cwe_ids ?? [],
          business_impact: f.business_impact,
          loi25_relevance: f.loi25_relevance,
          remediation: f.remediation,
          remediation_effort: f.remediation_effort,
          moteur: f.moteur,
          preuve: f.preuve ?? {},
        })),
      );
    }

    const counts = countBySev(enriched);
    await db.from("security_scans").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      executive_summary: summary,
      findings_critical: counts.critical, findings_high: counts.high,
      findings_medium: counts.medium, findings_low: counts.low, findings_info: counts.info,
    }).eq("id", scan.id);

    await db.rpc("append_audit_log", {
      p_scan_id: scan.id, p_authorization_id: sowId, p_user_id: user.id,
      p_event_type: "scan_completed",
      p_event_data: {
        findings_count: enriched.length,
        severity_counts: counts,
        moteurs_executes: journal.filter((j) => j.statut === "ok").length,
        moteurs_echec: journal.filter((j) => j.statut === "erreur").map((j) => j.moteur),
      },
    });

    const alertFindings = enriched.filter((f) => f.severity === "critical" || f.severity === "high");
    if (alertFindings.length > 0 && RESEND_KEY) {
      await sendSilexAlert({ scan_id: scan.id, target, scan_type: typeScan, findings: alertFindings, total_counts: counts });
    }

    return new Response(JSON.stringify({
      success: true,
      scan_id: scan.id,
      target,
      scan_type: typeScan,
      executive_summary: summary,
      findings_count: enriched.length,
      severity_counts: counts,
      findings: enriched,
      model_used: MODEL,
      engine: ENGINE_VERSION,
      moteurs_demandes: ids,
      moteurs_journal: journal,
      profil: PROFILS[typeScan]?.nom ?? "Sélection personnalisée",
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
  const critical = params.findings.filter((f) => f.severity === "critical");
  const topSev = critical.length > 0 ? "critical" : "high";
  const emoji = SEV_EMOJI[topSev];
  const color = SEV_COLOR[topSev];
  const label = critical.length > 0 ? "ALERTE CRITIQUE" : "ALERTE ÉLEVÉE";

  const findingsHtml = params.findings.slice(0, 5).map((f) => `
    <div style="border-left:4px solid ${SEV_COLOR[f.severity]};padding:12px 14px;margin-bottom:10px;background:#1a1a2e;border-radius:0 8px 8px 0;">
      <div style="color:${SEV_COLOR[f.severity]};font-size:11px;font-weight:800;letter-spacing:1px;margin-bottom:6px;">${f.severity.toUpperCase()} · ${f.moteur}</div>
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
      <div style="color:#6c6c78;font-size:12px;margin-top:8px;">Cible: ${params.target} · ${params.scan_type.replace("_", " ").toUpperCase()}</div>
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
      { headers: { "hibp-api-key": HIBP_KEY, "User-Agent": "ti-lex-al-silex/4.0" } },
      10000,
    );
    if (res.status === 404) return `✅ ${ADMIN_EMAIL} : aucune fuite détectée dans HIBP.`;
    if (!res.ok) return `⚠️ HIBP indisponible (${res.status}).`;
    const breaches = await res.json() as Array<{ Name: string }>;
    return `🔴 ${ADMIN_EMAIL} trouvé dans ${breaches.length} fuite(s) HIBP : ${breaches.map((b) => b.Name).join(", ")}.`;
  } catch {
    return "⚠️ Erreur connexion HIBP.";
  }
}

// ─── ENRICHISSEMENT CLAUDE (prose uniquement, pas de détection) ─────────────
// Un audit complet peut produire une centaine de constats : on n'envoie à
// Claude que ceux qui appellent une décision (tout sauf « info »), plafonnés.
// Les constats informatifs gardent leur description factuelle brute.
const MAX_ENRICHIS = 45;

async function enrichFindings(constats: Constat[], target: string): Promise<Finding[]> {
  if (!constats.length) return [];

  const rang: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const indexes = constats
    .map((f, i) => ({ i, sev: f.severity }))
    .sort((a, b) => rang[a.sev] - rang[b.sev])
    .filter((x) => x.sev !== "info")
    .slice(0, MAX_ENRICHIS)
    .map((x) => x.i);

  const brut = (f: Constat): Finding => ({
    ...f,
    description: f.raw_description,
    business_impact: "À évaluer",
    loi25_relevance: "À évaluer",
    remediation: "À documenter",
    remediation_effort: "medium",
  });

  if (indexes.length === 0) return constats.map(brut);

  const aEnrichir = indexes.map((i) => ({
    index: i,
    moteur: constats[i].moteur,
    title: constats[i].title,
    severity: constats[i].severity,
    raw_description: constats[i].raw_description,
  }));

  const prompt = `Tu es SILEX 🔰, agent cybersécurité ti-lex (Produit du Québec).
Cible: ${target}

Ces constats proviennent de vérifications RÉELLES exécutées par les moteurs ti-lex. Ne change RIEN aux faits, à la sévérité ni aux titres. Rédige seulement, en français québécois professionnel, pour chaque constat:
1. description: clair (1-2 phrases), fidèle au raw_description
2. business_impact: impact concret pour l'organisation
3. loi25_relevance: lien Loi 25 / PIPEDA (obligations préventives; ne mentionne un délai ou une sanction que pour un incident de confidentialité confirmé)
4. remediation: étapes concrètes
5. remediation_effort: trivial|low|medium|high

JSON strict uniquement:
{"enriched":[{"index":0,"description":"","business_impact":"","loi25_relevance":"","remediation":"","remediation_effort":""}]}

Constats:
${JSON.stringify(aEnrichir, null, 1)}`;

  try {
    const res = await anthropic(prompt, 8000);
    const parsed = JSON.parse(res.replace(/```json|```/g, "").trim());
    const parIndex = new Map<number, Record<string, string>>();
    for (const e of parsed.enriched ?? []) {
      if (typeof e?.index === "number") parIndex.set(e.index, e);
    }
    return constats.map((f, i) => {
      const e = parIndex.get(i);
      if (!e) return brut(f);
      return {
        ...f,
        description: e.description ?? f.raw_description,
        business_impact: e.business_impact ?? "À évaluer",
        loi25_relevance: e.loi25_relevance ?? "À évaluer",
        remediation: e.remediation ?? "À documenter",
        remediation_effort: e.remediation_effort ?? "medium",
      };
    });
  } catch {
    // Si l'enrichissement plante, on garde les faits réels sans prose IA.
    return constats.map(brut);
  }
}

// ─── RÉSUMÉ EXÉCUTIF ────────────────────────────────────────────────────────
async function generateSummary(findings: Finding[], target: string, question?: string, hibp?: string): Promise<string> {
  const counts = countBySev(findings);
  const hibpCtx = hibp ? `\n\nHIBP Admin: ${hibp}` : "";
  const qCtx = question ? `\n\nQuestion: ${question}` : "";
  const moteurs = [...new Set(findings.map((f) => f.moteur))];
  const prompt = `Tu es SILEX 🔰, agent cybersécurité ti-lex.${qCtx}${hibpCtx}

Cible: ${target} | ${findings.length} constats RÉELS issus de ${moteurs.length} moteur(s) | CRITIQUE:${counts.critical} ÉLEVÉ:${counts.high} MOYEN:${counts.medium}
Constats prioritaires:
${findings.filter((f) => f.severity !== "info").slice(0, 6).map((f) => `[${f.severity.toUpperCase()}] (${f.moteur}) ${f.title}`).join("\n")}

Résumé exécutif court (lignes ≤65 chars). Appréciation globale → enjeux Loi 25 → action prioritaire.`;
  try {
    return await anthropic(prompt, 900);
  } catch {
    return `Scan de ${target} : ${findings.length} constats (${counts.critical} critique, ${counts.high} élevé, ${counts.medium} moyen).`;
  }
}

async function anthropic(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetchT("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  }, 60000);
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const d = await res.json();
  return d.content?.[0]?.text ?? "";
}

function countBySev(f: Finding[]) {
  return f.reduce((a, x) => {
    a[x.severity] = (a[x.severity] ?? 0) + 1;
    return a;
  }, { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>);
}

function err(status: number, msg: string) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Réexport utilitaire : garde une trace explicite du catalogue disponible côté
// serveur (utile au débogage `deno check`).
export const MOTEURS_DISPONIBLES = Object.keys(MOTEURS_PAR_ID);
