import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getIdentifier, tooManyRequests } from "../_shared/rate-limit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCAN_MODEL = "claude-sonnet-4-6";

function salvageTruncatedJSON(s: string): unknown | null {
  let inStr = false, esc = false;
  const stack: string[] = [];
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let fixed = s;
  if (inStr) fixed += '"';
  while (stack.length) {
    const open = stack.pop();
    fixed += open === "{" ? "}" : "]";
  }
  try { return JSON.parse(fixed); } catch { return null; }
}

let _cors: Record<string, string>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ..._cors, "Content-Type": "application/json" },
  });
}

function buildScanPrompt(target: string, scanType: string): string {
  const types: Record<string, string> = {
    hibp: `Analyse de brèches de données (Have I Been Pwned) pour la cible "${target}". Simule une vérification dans les bases de données de fuites connues. Génère 2-4 résultats plausibles et éducatifs.`,
    osint: `Scan OSINT (open source intelligence) de la cible "${target}". Analyse les informations publiques : DNS, WHOIS, certificats, réseaux sociaux, technologies. Génère 2-4 résultats plausibles et éducatifs.`,
    darkweb: `Recherche dark web et paste sites pour la cible "${target}". Simule une vérification des forums underground et paste sites connus. Génère 1-3 résultats plausibles et éducatifs.`,
  };
  return (
    (types[scanType] || types["osint"]) +
    "\n\nNote : tout est SIMULÉ et ÉDUCATIF. Aucun système réel n'est scanné."
  );
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  _cors = corsHeaders(req);
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non autorisé" }, 401);

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Session invalide" }, 401);

    const rl = await checkRateLimit(getIdentifier(req, user.id), { prefix: "scan-engine", max: 10, windowSec: 60 });
    if (!rl.allowed) return tooManyRequests(rl, _cors);

    const body = await req.json();
    const { target, scan_type, mandate_id, company_id } = body;

    if (!target || !scan_type) {
      return json({ error: "target et scan_type requis" }, 400);
    }

    const userId = user.id;

    // Check admin
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    // Check plan limits (skip for admin)
    if (!isAdmin) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("price_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (!sub) {
        return json({ error: "Aucun abonnement cyber actif" }, 403);
      }

      const { data: limits } = await supabase
        .from("plan_limits")
        .select(
          "cyber_hibp_per_month, cyber_osint_per_month, cyber_darkweb_per_month",
        )
        .eq("stripe_price_id", sub.price_id)
        .maybeSingle();

      if (!limits) {
        return json({ error: "Forfait non trouvé" }, 403);
      }

      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();

      const { count } = await supabase
        .from("cyber_scans")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("scan_type", scan_type)
        .gte("queued_at", startOfMonth);

      const limitMap: Record<string, number> = {
        hibp: limits.cyber_hibp_per_month ?? 0,
        osint: limits.cyber_osint_per_month ?? 0,
        darkweb: limits.cyber_darkweb_per_month ?? 0,
      };
      const limit = limitMap[scan_type] ?? 0;

      if (limit !== -1 && (count ?? 0) >= limit) {
        return json(
          { error: "Limite mensuelle atteinte pour ce type de scan" },
          429,
        );
      }
    }

    // Create scan entry
    const { data: scanRow, error: scanErr } = await supabase
      .from("cyber_scans")
      .insert({
        user_id: userId,
        mandate_id: mandate_id || null,
        company_id: company_id || null,
        scan_type,
        target,
        sources_web: scan_type === "osint",
        sources_dark_web: scan_type === "darkweb",
        sources_paste_sites: scan_type === "hibp" || scan_type === "osint",
        sources_breach_db: scan_type === "hibp",
        sources_social_media: scan_type === "osint",
        status: "running",
        queued_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        scan_engine: "PHANTOM-RED / Équipe AL v1.0",
        metadata: {},
        total_findings: 0,
        critical_count: 0,
        high_count: 0,
        medium_count: 0,
        low_count: 0,
        info_count: 0,
      })
      .select()
      .single();

    if (scanErr || !scanRow) {
      throw new Error("Impossible de créer le scan : " + scanErr?.message);
    }

    // Call AI
    const scanStart = Date.now();
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: SCAN_MODEL,
        max_tokens: 8192,
        // ⚡ Prompt caching : consigne PHANTOM-RED (stable, ~1k tokens) mise en cache.
        system: [{ type: "text", cache_control: { type: "ephemeral" }, text: `Tu es PHANTOM-RED, le moteur de scan du Centre INDAR.
Tu génères des rapports de sécurité SIMULÉS et éducatifs.

CALIBRATION DE SÉVÉRITÉ — RÈGLES OBLIGATOIRES :
- RLS (Row Level Security) est activé sur les 68 tables Supabase. Cela annule la plupart des risques d'exfiltration.
- Rate limiting absent = LOW si RLS actif (defense-in-depth, pas barrière anti-exfiltration).
- CORS permissif = LOW si auth par token et RLS actif.
- Headers HTTP manquants = LOW (amélioration préventive).
- Seule une table SANS RLS exposée via API publique mérite HIGH ou CRITIQUE.
- Loi 25 : mentionne uniquement les obligations préventives (mesures raisonnables, art. 3.7). Ne mentionne JAMAIS de montant de sanction (25 M$) ni de délai (24h/48h) sauf incident de confidentialité confirmé.
- Délais de remédiation réalistes : CRITIQUE=7j, HAUTE=30j, MOYENNE=90j, FAIBLE=backlog, INFO=optionnel.
- Si aucune finding CRITIQUE ni HAUTE après calibration, le risk_level doit être FAIBLE et le risk_score < 30.

RÉPONDS UNIQUEMENT EN JSON VALIDE, compact, sans indentation inutile.
Aucun backtick, aucun texte avant ou après le JSON.
Limite les descriptions à 2 phrases maximum par finding.
Format :
{
  "risk_score": 0-100,
  "risk_level": "FAIBLE|MOYEN|ÉLEVÉ|CRITIQUE",
  "executive_summary": "2-3 phrases pour le décideur",
  "technical_summary": "2-3 phrases techniques",
  "findings": [
    {
      "finding_type": "breach|osint|darkweb|vulnerability|config",
      "title": "titre court",
      "description": "description détaillée",
      "severity": "CRITIQUE|HAUTE|MOYENNE|FAIBLE|INFO",
      "source": "nom de la source",
      "remediation": "action corrective concrète",
      "remediation_priority": "7 JOURS|30 JOURS|90 JOURS|BACKLOG|OPTIONNEL"
    }
  ],
  "recommendations": ["rec1", "rec2", "rec3"]
}` }],
        messages: [
          { role: "user", content: buildScanPrompt(target, scan_type) },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      await supabase
        .from("cyber_scans")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: `Anthropic API ${aiRes.status}: ${errText.slice(0, 200)}`,
        })
        .eq("id", scanRow.id);
      throw new Error("Erreur API IA: " + aiRes.status);
    }

    const aiData = await aiRes.json();
    const aiText =
      aiData.content?.find((c: { type: string }) => c.type === "text")?.text ||
      "{}";
    const cleanedText = aiText.replace(/```json|```/g, "").trim();

    let result: {
      risk_score?: number;
      risk_level?: string;
      executive_summary?: string;
      technical_summary?: string;
      findings?: Array<{
        finding_type: string;
        title: string;
        description: string;
        severity: string;
        source: string;
        remediation: string;
        remediation_priority: string;
      }>;
      recommendations?: string[];
    };

    const truncated = aiData.stop_reason === "max_tokens";
    if (truncated) {
      console.warn("[scan-engine] stop_reason=max_tokens, payload length:", aiText.length);
    }

    try {
      result = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error("[scan-engine] JSON parse failed:", parseErr, "raw length:", aiText.length, "stop_reason:", aiData.stop_reason);
      const salvaged = salvageTruncatedJSON(cleanedText);
      if (salvaged && typeof salvaged === "object" && !Array.isArray(salvaged)) {
        console.warn("[scan-engine] Salvaged truncated JSON successfully");
        result = salvaged as typeof result;
      } else {
        await supabase
          .from("cyber_scans")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: truncated
              ? "Réponse IA tronquée (max_tokens atteint)"
              : "Réponse IA invalide (JSON malformé)",
          })
          .eq("id", scanRow.id);
        return json({
          error: truncated
            ? "Le rapport IA a été tronqué. Relancez le scan."
            : "Erreur de parsing du rapport IA.",
        }, 502);
      }
    }

    const duration = Math.floor((Date.now() - scanStart) / 1000);

    // Save findings
    const findings = result.findings || [];
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

    if (findings.length > 0) {
      const findingRows = findings.map(
        (f: {
          finding_type: string;
          title: string;
          description: string;
          severity: string;
          source: string;
          remediation: string;
          remediation_priority: string;
        }) => {
          const sev = f.severity?.toUpperCase() || "INFO";
          if (sev === "CRITIQUE") counts.critical++;
          else if (sev === "HAUTE") counts.high++;
          else if (sev === "MOYENNE") counts.medium++;
          else if (sev === "FAIBLE") counts.low++;
          else counts.info++;

          return {
            scan_id: scanRow.id,
            user_id: userId,
            mandate_id: mandate_id || null,
            company_id: company_id || null,
            finding_type: f.finding_type || "vulnerability",
            title: f.title,
            description: f.description,
            severity: sev,
            source: f.source || "PHANTOM-RED",
            leak_confirmed: false,
            data_types_exposed: [],
            external_references: [],
            remediation: f.remediation,
            remediation_priority: f.remediation_priority,
            status: "new",
          };
        },
      );
      await supabase.from("cyber_findings").insert(findingRows);
    }

    const totalFindings = findings.length;

    // Update scan with results
    await supabase
      .from("cyber_scans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
        total_findings: totalFindings,
        critical_count: counts.critical,
        high_count: counts.high,
        medium_count: counts.medium,
        low_count: counts.low,
        info_count: counts.info,
        requests_sent: Math.floor(Math.random() * 800) + 200,
        bytes_analyzed: Math.floor(Math.random() * 5000000) + 500000,
      })
      .eq("id", scanRow.id);

    // Create report
    const { data: reportRow } = await supabase
      .from("cyber_reports")
      .insert({
        user_id: userId,
        mandate_id: mandate_id || null,
        company_id: company_id || null,
        title: `Rapport de scan — ${target}`,
        report_type: scan_type,
        period_start: new Date().toISOString(),
        period_end: new Date().toISOString(),
        total_employees_scanned: 0,
        total_scans_run: 1,
        total_findings: totalFindings,
        critical_count: counts.critical,
        high_count: counts.high,
        medium_count: counts.medium,
        low_count: counts.low,
        info_count: counts.info,
        risk_score: result.risk_score || 0,
        risk_level: result.risk_level || "FAIBLE",
        executive_summary: result.executive_summary || "",
        technical_summary: result.technical_summary || "",
        recommendations: result.recommendations || [],
        status: "published",
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    return json({
      success: true,
      scan_id: scanRow.id,
      report_id: reportRow?.id,
      risk_score: result.risk_score,
      risk_level: result.risk_level,
      total_findings: totalFindings,
      critical_count: counts.critical,
      high_count: counts.high,
      medium_count: counts.medium,
      low_count: counts.low,
      info_count: counts.info,
      executive_summary: result.executive_summary,
      technical_summary: result.technical_summary,
      findings,
      recommendations: result.recommendations,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
