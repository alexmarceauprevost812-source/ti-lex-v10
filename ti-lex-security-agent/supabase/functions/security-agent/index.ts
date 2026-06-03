// ============================================================================
// ti-lex Security Agent — Supabase Edge Function
// Endpoint: /functions/v1/security-agent
// ============================================================================
// Cette fonction est le coeur de l'Agent de Sécurité Défensive ti-lex.
// Elle reçoit une demande de scan, vérifie l'autorisation (SOW), exécute
// les modules de reconnaissance/scan, puis demande à Claude d'analyser les
// résultats et de générer un rapport en français.
//
// MODÈLE CLAUDE: claude-opus-4-7 (en date du 2026-05-21)
// Si tu vois l'erreur "Modèle ou ressource introuvable", c'est qu'un ancien
// nom de modèle traîne quelque part. Vérifie que SECURITY_AGENT_MODEL pointe
// bien sur un modèle 2026.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ============================================================================
// CONFIGURATION — modèles Claude valides en 2026
// ============================================================================
const VALID_CLAUDE_MODELS = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

const SECURITY_AGENT_MODEL = Deno.env.get("SECURITY_AGENT_MODEL") ?? "claude-opus-4-7";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// TYPES
// ============================================================================
interface ScanRequest {
  authorization_id: string;
  target: string;
  scan_type:
    | "passive_recon"
    | "vuln_scan"
    | "web_scan"
    | "dark_web_monitor"
    | "config_audit"
    | "full_audit";
}

interface RawFinding {
  source: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  raw_description: string;
  affected_target: string;
  cve_ids?: string[];
  cwe_ids?: string[];
}

interface EnrichedFinding extends RawFinding {
  description: string;
  business_impact: string;
  loi25_relevance: string;
  remediation: string;
  remediation_effort: "trivial" | "low" | "medium" | "high";
}

// ============================================================================
// HEADERS CORS
// ============================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// SERVE
// ============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validation préalable du modèle
  if (!VALID_CLAUDE_MODELS.includes(SECURITY_AGENT_MODEL as any)) {
    return jsonError(
      500,
      `Modèle Claude invalide: "${SECURITY_AGENT_MODEL}". Modèles 2026 valides: ${VALID_CLAUDE_MODELS.join(", ")}. Mets à jour SECURITY_AGENT_MODEL.`,
    );
  }

  if (!ANTHROPIC_API_KEY) {
    return jsonError(500, "ANTHROPIC_API_KEY manquante dans l'environnement.");
  }

  try {
    // Authentification utilisateur
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "Header Authorization manquant");

    const userClient = createClient(SUPABASE_URL, authHeader.replace("Bearer ", ""), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonError(401, "Utilisateur non authentifié");

    // Client service role pour les opérations privilégiées
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parsing du body
    const body: ScanRequest = await req.json();
    if (!body.authorization_id || !body.target || !body.scan_type) {
      return jsonError(400, "Paramètres requis: authorization_id, target, scan_type");
    }

    // ========================================================================
    // GUARDRAIL #1 — Vérification d'autorisation via la fonction SQL
    // ========================================================================
    const { data: authCheck, error: authCheckError } = await adminClient.rpc(
      "verify_scan_authorization",
      {
        p_authorization_id: body.authorization_id,
        p_target: body.target,
        p_scan_type: body.scan_type,
      },
    );

    if (authCheckError) {
      return jsonError(500, `Erreur vérification autorisation: ${authCheckError.message}`);
    }

    const check = authCheck?.[0];
    if (!check?.authorized) {
      // Audit l'échec
      await adminClient.rpc("append_audit_log", {
        p_scan_id: null,
        p_authorization_id: body.authorization_id,
        p_user_id: user.id,
        p_event_type: "scan_refused",
        p_event_data: { target: body.target, scan_type: body.scan_type, reason: check?.reason },
      });
      return jsonError(403, `Scan refusé: ${check?.reason ?? "raison inconnue"}`);
    }

    // ========================================================================
    // Création de l'enregistrement de scan
    // ========================================================================
    const { data: scan, error: scanError } = await adminClient
      .from("security_scans")
      .insert({
        authorization_id: body.authorization_id,
        user_id: user.id,
        target: body.target,
        scan_type: body.scan_type,
        status: "running",
      })
      .select()
      .single();

    if (scanError || !scan) {
      return jsonError(500, `Erreur création scan: ${scanError?.message}`);
    }

    // Audit du démarrage
    await adminClient.rpc("append_audit_log", {
      p_scan_id: scan.id,
      p_authorization_id: body.authorization_id,
      p_user_id: user.id,
      p_event_type: "scan_started",
      p_event_data: { target: body.target, scan_type: body.scan_type, model: SECURITY_AGENT_MODEL },
    });

    // ========================================================================
    // GUARDRAIL #2 — Exécution des modules de scan (mode défensif uniquement)
    // ========================================================================
    // NOTE: dans cette version MVP, on simule l'exécution des outils externes.
    // En production, ces appels devraient passer par un worker dédié (Nuclei,
    // Subfinder, OWASP ZAP) hébergé dans une infra contrôlée.
    const rawFindings = await runScanModules(body.target, body.scan_type);

    // ========================================================================
    // ENRICHISSEMENT IA via Claude — analyse, impact Loi 25, remédiation
    // ========================================================================
    const enrichedFindings = await enrichFindingsWithClaude(rawFindings, body.target);
    const executiveSummary = await generateExecutiveSummary(enrichedFindings, body.target);

    // ========================================================================
    // Sauvegarde des findings
    // ========================================================================
    if (enrichedFindings.length > 0) {
      const { error: findingsError } = await adminClient
        .from("security_findings")
        .insert(
          enrichedFindings.map((f) => ({
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

      if (findingsError) {
        return jsonError(500, `Erreur insertion findings: ${findingsError.message}`);
      }
    }

    // Comptage par sévérité
    const counts = countBySeverity(enrichedFindings);

    // Mise à jour du scan en "completed"
    await adminClient
      .from("security_scans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        executive_summary: executiveSummary,
        findings_critical: counts.critical,
        findings_high: counts.high,
        findings_medium: counts.medium,
        findings_low: counts.low,
        findings_info: counts.info,
      })
      .eq("id", scan.id);

    // Audit de la fin du scan
    await adminClient.rpc("append_audit_log", {
      p_scan_id: scan.id,
      p_authorization_id: body.authorization_id,
      p_user_id: user.id,
      p_event_type: "scan_completed",
      p_event_data: { findings_count: enrichedFindings.length, severity_counts: counts },
    });

    return new Response(
      JSON.stringify({
        success: true,
        scan_id: scan.id,
        target: body.target,
        scan_type: body.scan_type,
        executive_summary: executiveSummary,
        findings_count: enrichedFindings.length,
        severity_counts: counts,
        findings: enrichedFindings,
        model_used: SECURITY_AGENT_MODEL,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Erreur security-agent:", err);
    return jsonError(500, `Erreur interne: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// ============================================================================
// HELPER: réponse JSON d'erreur
// ============================================================================
function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ============================================================================
// MODULES DE SCAN — version MVP simulée
// En production: invoquer les vrais outils via worker (Nuclei, ZAP, Subfinder)
// ============================================================================
async function runScanModules(target: string, scanType: string): Promise<RawFinding[]> {
  // MVP: retourne quelques findings simulés réalistes pour démontrer le flow.
  // Remplacer cette fonction par les vrais appels Nuclei/ZAP/Subfinder en prod.
  const findings: RawFinding[] = [];

  if (scanType === "passive_recon" || scanType === "full_audit") {
    findings.push({
      source: "subfinder",
      severity: "info",
      title: "Sous-domaines découverts",
      raw_description: `Énumération passive de ${target} via certificats SSL et DNS publics.`,
      affected_target: target,
    });
  }

  if (scanType === "web_scan" || scanType === "full_audit") {
    findings.push({
      source: "nuclei",
      severity: "medium",
      title: "Headers de sécurité HTTP manquants",
      raw_description: `Le serveur ${target} ne retourne pas Content-Security-Policy ni Strict-Transport-Security.`,
      affected_target: target,
      cwe_ids: ["CWE-693"],
    });
    findings.push({
      source: "nuclei",
      severity: "low",
      title: "Version du serveur exposée",
      raw_description: `L'en-tête Server divulgue la version du serveur web.`,
      affected_target: target,
      cwe_ids: ["CWE-200"],
    });
  }

  if (scanType === "vuln_scan" || scanType === "full_audit") {
    findings.push({
      source: "nuclei",
      severity: "high",
      title: "Endpoint API exposé sans authentification",
      raw_description: `Un endpoint /api/users semble accessible sans token d'authentification.`,
      affected_target: target,
      cwe_ids: ["CWE-306"],
    });
  }

  return findings;
}

// ============================================================================
// ENRICHISSEMENT via Claude — chaque finding reçoit une analyse contextuelle
// ============================================================================
async function enrichFindingsWithClaude(
  findings: RawFinding[],
  target: string,
): Promise<EnrichedFinding[]> {
  if (findings.length === 0) return [];

  const prompt = `Tu es l'Agent de Sécurité Défensive de ti-lex, une firme québécoise de cybersécurité.
Tu reçois ci-dessous une liste brute de vulnérabilités détectées sur la cible "${target}".

Pour CHAQUE finding, génère :
1. Une description claire en français du Québec (1-2 phrases)
2. L'impact business concret pour une organisation québécoise (1-2 phrases)
3. La pertinence vis-à-vis de la Loi 25 du Québec et/ou de PIPEDA — quel article est touché, quel risque réglementaire (1-2 phrases)
4. Un plan de remédiation actionnable (étapes concrètes)
5. L'effort de remédiation: "trivial" | "low" | "medium" | "high"

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks. Format strict:
{
  "enriched": [
    {
      "index": 0,
      "description": "...",
      "business_impact": "...",
      "loi25_relevance": "...",
      "remediation": "...",
      "remediation_effort": "low"
    }
  ]
}

Findings bruts:
${JSON.stringify(findings, null, 2)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: SECURITY_AGENT_MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    // Si le modèle est invalide, l'API Anthropic retourne 404 avec un message clair
    if (response.status === 404) {
      throw new Error(
        `Modèle Claude introuvable: "${SECURITY_AGENT_MODEL}". L'API a répondu 404. Vérifie la variable d'env SECURITY_AGENT_MODEL.`,
      );
    }
    throw new Error(`Anthropic API ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";

  // Parsing robuste
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return findings.map((f, idx) => {
    const enrichment = parsed.enriched?.find((e: any) => e.index === idx) ?? parsed.enriched?.[idx];
    return {
      ...f,
      description: enrichment?.description ?? f.raw_description,
      business_impact: enrichment?.business_impact ?? "À évaluer",
      loi25_relevance: enrichment?.loi25_relevance ?? "À évaluer",
      remediation: enrichment?.remediation ?? "À documenter",
      remediation_effort: enrichment?.remediation_effort ?? "medium",
    };
  });
}

// ============================================================================
// RÉSUMÉ EXÉCUTIF via Claude
// ============================================================================
async function generateExecutiveSummary(
  findings: EnrichedFinding[],
  target: string,
): Promise<string> {
  const prompt = `Tu es l'Agent de Sécurité Défensive de ti-lex.
Génère un résumé exécutif (3-5 phrases) en français du Québec, ton professionnel, pour un membre du CA ou un DG d'une organisation québécoise.

Cible auditée: ${target}
Nombre de findings: ${findings.length}
Répartition: ${JSON.stringify(countBySeverity(findings))}

Top 3 findings (par sévérité):
${findings.slice(0, 3).map((f) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.business_impact}`).join("\n")}

Le résumé doit:
- Commencer par une appréciation globale du risque
- Mentionner 1-2 enjeux Loi 25 concrets
- Se terminer par une recommandation d'action prioritaire
- Éviter le jargon technique inutile`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: SECURITY_AGENT_MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    return `Résumé indisponible (erreur API ${response.status}). ${findings.length} findings détectés sur ${target}.`;
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? "Résumé non généré.";
}

// ============================================================================
// COMPTAGE PAR SÉVÉRITÉ
// ============================================================================
function countBySeverity(findings: { severity: string }[]) {
  return findings.reduce(
    (acc, f) => {
      acc[f.severity as keyof typeof acc] = (acc[f.severity as keyof typeof acc] ?? 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  );
}
