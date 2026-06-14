import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Liste stricte des modèles 2026 validés (claude-opus-4-8 = le plus récent)
const VALID_MODELS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];
const DEFAULT_MODEL = "claude-opus-4-8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ------------------------------------------------------------------ *
 *  HELPERS DE RECONNAISSANCE PASSIVE
 *  Uniquement de la collecte de données publiques (équivalent dig/curl).
 *  Aucun scan de ports actif, aucune tentative d'exploitation.
 * ------------------------------------------------------------------ */

async function resolveDns(hostname: string, type: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.Answer ?? []).map((a: { data: string }) => a.data);
  } catch {
    return [];
  }
}

async function fetchHttpHeaders(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "ti-lex-security-agent/1.0 (passive recon)" },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    try { await res.body?.cancel(); } catch { /* corps ignoré volontairement */ }
    return { status: res.status, headers };
  } catch (e) {
    return { status: 0, headers: {} as Record<string, string>, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRobots(origin: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 4000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

    let modelName = Deno.env.get("SECURITY_AGENT_MODEL") ?? DEFAULT_MODEL;
    if (!VALID_MODELS.includes(modelName)) modelName = DEFAULT_MODEL;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { target, authorization_id } = await req.json();
    if (!target || !authorization_id) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants : 'target' et 'authorization_id' requis." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: authValid, error: authError } = await supabase.rpc(
      "verify_scan_authorization",
      { auth_id: authorization_id, requested_target: target },
    );
    if (authError || !authValid) {
      return new Response(
        JSON.stringify({ error: "🚨 Guardrail Sec : Cible hors-scope ou SOW expiré/invalide. Scan bloqué." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanTarget = target.replace(/(^\w+:|^)\/\//, "").trim();
    const hostname = cleanTarget.split("/")[0].split(":")[0];
    const origin = `https://${hostname}`;

    const [aRecords, aaaaRecords, mxRecords, txtRecords, nsRecords, httpInfo, robots] =
      await Promise.all([
        resolveDns(hostname, "A"),
        resolveDns(hostname, "AAAA"),
        resolveDns(hostname, "MX"),
        resolveDns(hostname, "TXT"),
        resolveDns(hostname, "NS"),
        fetchHttpHeaders(origin),
        fetchRobots(origin),
      ]);

    const securityHeaders = {
      "strict-transport-security": httpInfo.headers["strict-transport-security"] ?? null,
      "content-security-policy": httpInfo.headers["content-security-policy"] ?? null,
      "x-frame-options": httpInfo.headers["x-frame-options"] ?? null,
      "x-content-type-options": httpInfo.headers["x-content-type-options"] ?? null,
      "referrer-policy": httpInfo.headers["referrer-policy"] ?? null,
      "permissions-policy": httpInfo.headers["permissions-policy"] ?? null,
    };

    const evidence = {
      target: cleanTarget,
      hostname,
      collected_at: new Date().toISOString(),
      dns: { A: aRecords, AAAA: aaaaRecords, MX: mxRecords, TXT: txtRecords, NS: nsRecords },
      http: {
        reachable: httpInfo.status > 0,
        status: httpInfo.status,
        server: httpInfo.headers["server"] ?? null,
        security_headers: securityHeaders,
        all_headers: httpInfo.headers,
        error: (httpInfo as { error?: string }).error ?? null,
      },
      robots_txt: robots,
    };

    const promptSystem = `Tu es un agent de cybersécurité défensive opérant sous mandat légal strict (conforme à l'art. 342.1 C.cr. et à la Loi 25, Québec/Canada).
Tu reçois des PREUVES de reconnaissance PASSIVE réellement collectées (DNS, en-têtes HTTP de surface, robots.txt).
RÈGLES ABSOLUES :
- Base CHAQUE constat uniquement sur les preuves fournies. N'invente JAMAIS de vulnérabilité, de port, de service ou de version absent des preuves.
- Si une preuve manque ou n'est pas concluante, dis-le explicitement au lieu de spéculer.
- Ne fournis aucune méthode d'exploitation, charge utile ni technique offensive (ni DoS, ni ingénierie sociale).
- Reste défensif : en-têtes de sécurité manquants, fuites d'information, pistes de durcissement.
Réponds UNIQUEMENT avec un JSON valide, sans préambule ni balises Markdown, de la forme :
{ "findings": [ { "titre": "", "criticite": "Critique|Haute|Moyenne|Basse", "preuve": "", "recommandation": "" } ], "synthese": "" }`;

    const userMessage = `Analyse les preuves de reconnaissance passive suivantes et produis le rapport d'audit défensif au format JSON demandé.

PREUVES (JSON) :
${JSON.stringify(evidence, null, 2)}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 2500,
        system: promptSystem,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur API Anthropic (${modelName}) : ${errText}`);
    }

    const anthropicData = await response.json();
    const textBlock = (anthropicData.content ?? []).find((b: { type: string }) => b.type === "text");
    const rawOutput = textBlock?.text ?? "";

    let parsed: { findings?: unknown; synthese?: unknown; raw_report?: string } = {};
    try {
      parsed = JSON.parse(rawOutput.replace(/```json|```/g, "").trim());
    } catch {
      parsed = { raw_report: rawOutput };
    }

    const generatedAt = new Date().toISOString();
    const auditBundle = {
      authorization_id,
      target: cleanTarget,
      evidence,
      findings: parsed,
      model_used: modelName,
      generated_at: generatedAt,
    };
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(auditBundle)));
    const finalHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await supabase
      .from("security_authorizations")
      .update({ sow_hash: finalHash })
      .eq("id", authorization_id);

    return new Response(
      JSON.stringify({
        success: true,
        model_used: modelName,
        audit_hash: finalHash,
        generated_at: generatedAt,
        evidence,
        findings: parsed.findings ?? parsed,
        synthese: parsed.synthese ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
