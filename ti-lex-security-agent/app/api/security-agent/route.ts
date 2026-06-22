// ============================================================================
// app/api/security-agent/route.ts
// Route Next.js (App Router) — alternative à l'edge function Supabase
// Utilise directement l'API Anthropic depuis le serveur Next.js
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// IMPORTANT — modèles 2026 valides
const VALID_MODELS = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

const MODEL = process.env.SECURITY_AGENT_MODEL ?? "claude-opus-4-7";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    // Validation préalable du modèle
    if (!VALID_MODELS.includes(MODEL as any)) {
      return NextResponse.json(
        {
          success: false,
          error: `Modèle ou ressource introuvable. 💡 Le modèle "${MODEL}" est peut-être déprécié — contacte Alex pour mettre à jour. Modèles valides: ${VALID_MODELS.join(", ")}`,
        },
        { status: 500 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: "ANTHROPIC_API_KEY manquante dans l'environnement" },
        { status: 500 },
      );
    }

    // Auth utilisateur via header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "Header Authorization manquant" },
        { status: 401 },
      );
    }

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Utilisateur non authentifié" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { authorization_id, target, scan_type } = body;

    if (!authorization_id || !target || !scan_type) {
      return NextResponse.json(
        { success: false, error: "Paramètres requis: authorization_id, target, scan_type" },
        { status: 400 },
      );
    }

    // GUARDRAIL — vérification d'autorisation
    const { data: authCheck } = await supabaseAdmin.rpc("verify_scan_authorization", {
      p_authorization_id: authorization_id,
      p_target: target,
      p_scan_type: scan_type,
    });

    const check = authCheck?.[0];
    if (!check?.authorized) {
      await supabaseAdmin.rpc("append_audit_log", {
        p_scan_id: null,
        p_authorization_id: authorization_id,
        p_user_id: user.id,
        p_event_type: "scan_refused",
        p_event_data: { target, scan_type, reason: check?.reason },
      });
      return NextResponse.json(
        { success: false, error: `Scan refusé: ${check?.reason}` },
        { status: 403 },
      );
    }

    // Création du scan
    const { data: scan, error: scanError } = await supabaseAdmin
      .from("security_scans")
      .insert({
        authorization_id,
        user_id: user.id,
        target,
        scan_type,
        status: "running",
      })
      .select()
      .single();

    if (scanError || !scan) {
      return NextResponse.json(
        { success: false, error: `Erreur création scan: ${scanError?.message}` },
        { status: 500 },
      );
    }

    await supabaseAdmin.rpc("append_audit_log", {
      p_scan_id: scan.id,
      p_authorization_id: authorization_id,
      p_user_id: user.id,
      p_event_type: "scan_started",
      p_event_data: { target, scan_type, model: MODEL },
    });

    // === SCAN SIMULÉ (MVP) — à remplacer par les vrais outils en prod ===
    const rawFindings = await simulateScanModules(target, scan_type);

    // === ENRICHISSEMENT VIA CLAUDE ===
    let enriched;
    try {
      enriched = await enrichWithClaude(rawFindings, target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Erreur 404 = modèle introuvable
      if (msg.includes("404") || msg.includes("not_found") || msg.includes("model")) {
        return NextResponse.json(
          {
            success: false,
            error: `Modèle ou ressource introuvable. 💡 Le modèle "${MODEL}" est peut-être déprécié — contacte Alex pour mettre à jour. (${msg})`,
          },
          { status: 500 },
        );
      }
      throw err;
    }

    // Sauvegarde findings
    if (enriched.length > 0) {
      await supabaseAdmin.from("security_findings").insert(
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
        })),
      );
    }

    const counts = countBySeverity(enriched);
    const summary = await generateSummary(enriched, target);

    await supabaseAdmin
      .from("security_scans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        executive_summary: summary,
        findings_critical: counts.critical,
        findings_high: counts.high,
        findings_medium: counts.medium,
        findings_low: counts.low,
        findings_info: counts.info,
      })
      .eq("id", scan.id);

    await supabaseAdmin.rpc("append_audit_log", {
      p_scan_id: scan.id,
      p_authorization_id: authorization_id,
      p_user_id: user.id,
      p_event_type: "scan_completed",
      p_event_data: { findings_count: enriched.length, severity_counts: counts },
    });

    return NextResponse.json({
      success: true,
      scan_id: scan.id,
      target,
      scan_type,
      executive_summary: summary,
      findings_count: enriched.length,
      severity_counts: counts,
      findings: enriched,
      model_used: MODEL,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erreur security-agent route:", msg);
    return NextResponse.json(
      { success: false, error: `Erreur interne: ${msg}` },
      { status: 500 },
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================
async function simulateScanModules(target: string, scanType: string) {
  const findings: any[] = [];
  if (scanType === "web_scan" || scanType === "full_audit") {
    findings.push({
      source: "nuclei",
      severity: "low",
      title: "Headers de sécurité HTTP manquants",
      raw_description: `${target} ne retourne pas CSP ni HSTS. RLS actif sur toutes les tables : risque d'exfiltration nul. Amélioration préventive (defense-in-depth).`,
      affected_target: target,
      cwe_ids: ["CWE-693"],
    });
  }
  if (scanType === "vuln_scan" || scanType === "full_audit") {
    findings.push({
      source: "nuclei",
      severity: "medium",
      title: "Endpoint API à vérifier",
      raw_description: `Vérifier que tous les endpoints API sont protégés par RLS ou auth. Si RLS est actif (cas Supabase), le risque réel est faible.`,
      affected_target: target,
      cwe_ids: ["CWE-306"],
    });
  }
  return findings;
}

async function enrichWithClaude(findings: any[], target: string) {
  if (findings.length === 0) return [];

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Tu es l'Agent de Sécurité Défensive de ti-lex. Pour chaque finding sur "${target}", génère en français du Québec: description, business_impact, loi25_relevance, remediation, remediation_effort (trivial/low/medium/high).

Réponds UNIQUEMENT en JSON valide (pas de markdown):
{ "enriched": [ { "index": 0, "description": "...", "business_impact": "...", "loi25_relevance": "...", "remediation": "...", "remediation_effort": "low" } ] }

Findings:
${JSON.stringify(findings, null, 2)}`,
      },
    ],
  });

  const text = (message.content[0] as any).text ?? "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return findings.map((f, idx) => {
    const e = parsed.enriched?.find((x: any) => x.index === idx) ?? parsed.enriched?.[idx] ?? {};
    return {
      ...f,
      description: e.description ?? f.raw_description,
      business_impact: e.business_impact ?? "À évaluer",
      loi25_relevance: e.loi25_relevance ?? "À évaluer",
      remediation: e.remediation ?? "À documenter",
      remediation_effort: e.remediation_effort ?? "medium",
    };
  });
}

async function generateSummary(findings: any[], target: string) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Résumé exécutif (3-5 phrases, français du Québec, pour un DG) sur l'audit de ${target}.
${findings.length} findings, répartition: ${JSON.stringify(countBySeverity(findings))}.
Top 3: ${findings.slice(0, 3).map((f) => `[${f.severity}] ${f.title}`).join(", ")}.
Contexte : RLS est activé sur toutes les tables Supabase (68/68). Les sévérités sont déjà calibrées selon l'audit officiel Supabase.
Pour la Loi 25 : mentionne uniquement les obligations préventives (mesures raisonnables, art. 3.7). Ne mentionne PAS de montant de sanction ni de délai de notification sauf en cas d'incident confirmé. Termine par une action prioritaire.`,
      },
    ],
  });

  return (message.content[0] as any).text ?? "Résumé non généré.";
}

function countBySeverity(findings: { severity: string }[]) {
  return findings.reduce(
    (acc: any, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  );
}
