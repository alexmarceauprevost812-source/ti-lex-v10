// ============================================================================
// lib/security-agent.ts
// Wrapper TypeScript pour invoquer l'Agent de Sécurité ti-lex
// ============================================================================

import { createClient } from "@supabase/supabase-js";

// Modèles Claude valides en 2026
export const VALID_MODELS = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export type ScanType =
  | "passive_recon"
  | "vuln_scan"
  | "web_scan"
  | "dark_web_monitor"
  | "config_audit"
  | "full_audit";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  severity: Severity;
  title: string;
  description: string;
  affected_target: string;
  cve_ids?: string[];
  cwe_ids?: string[];
  business_impact: string;
  loi25_relevance: string;
  remediation: string;
  remediation_effort: "trivial" | "low" | "medium" | "high";
}

export interface ScanResult {
  success: boolean;
  scan_id?: string;
  target?: string;
  scan_type?: ScanType;
  executive_summary?: string;
  findings_count?: number;
  severity_counts?: Record<Severity, number>;
  findings?: Finding[];
  model_used?: string;
  error?: string;
}

export interface Authorization {
  id: string;
  client_name: string;
  allowed_targets: string[];
  allowed_techniques: ScanType[];
  valid_from: string;
  valid_until: string;
  status: "active" | "revoked" | "expired" | "completed";
}

// ============================================================================
// CLIENT
// ============================================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// API
// ============================================================================

/** Lance un scan de sécurité défensif sur une cible autorisée. */
export async function runSecurityScan(params: {
  authorization_id: string;
  target: string;
  scan_type: ScanType;
}): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke("security-agent", {
    body: params,
  });

  if (error) {
    // Détecter spécifiquement l'erreur de modèle introuvable
    if (error.message?.includes("Modèle Claude") || error.message?.includes("introuvable")) {
      return {
        success: false,
        error: `Modèle ou ressource introuvable. 💡 Le modèle est peut-être déprécié — contacte Alex pour mettre à jour. (Détail: ${error.message})`,
      };
    }
    return { success: false, error: error.message };
  }

  return data as ScanResult;
}

/** Crée une nouvelle autorisation (SOW signé). */
export async function createAuthorization(params: {
  client_name: string;
  client_email: string;
  client_signatory_name: string;
  client_signatory_title: string;
  allowed_targets: string[];
  allowed_techniques: ScanType[];
  valid_from: Date;
  valid_until: Date;
  sow_document_url?: string;
}): Promise<{ data: Authorization | null; error: string | null }> {
  // Calcul du hash du SOW (côté client pour preuve d'intégrité)
  const sowContent = JSON.stringify({
    client_name: params.client_name,
    allowed_targets: params.allowed_targets,
    allowed_techniques: params.allowed_techniques,
    valid_from: params.valid_from.toISOString(),
    valid_until: params.valid_until.toISOString(),
  });

  const sow_hash = await sha256(sowContent);

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: null, error: "Non authentifié" };

  const { data, error } = await supabase
    .from("security_authorizations")
    .insert({
      user_id: user.user.id,
      client_name: params.client_name,
      client_email: params.client_email,
      client_signatory_name: params.client_signatory_name,
      client_signatory_title: params.client_signatory_title,
      allowed_targets: params.allowed_targets,
      allowed_techniques: params.allowed_techniques,
      valid_from: params.valid_from.toISOString(),
      valid_until: params.valid_until.toISOString(),
      sow_hash,
      sow_document_url: params.sow_document_url,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Authorization, error: null };
}

/** Liste les autorisations actives de l'utilisateur. */
export async function listAuthorizations(): Promise<Authorization[]> {
  const { data, error } = await supabase
    .from("security_authorizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur listAuthorizations:", error);
    return [];
  }
  return data as Authorization[];
}

/** Kill switch — révoque immédiatement une autorisation. */
export async function killAuthorization(
  authorization_id: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("security_authorizations")
    .update({
      status: "revoked",
      killed_at: new Date().toISOString(),
      killed_reason: reason,
    })
    .eq("id", authorization_id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Liste les scans récents. */
export async function listRecentScans(limit = 20) {
  const { data, error } = await supabase
    .from("security_scans")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Erreur listRecentScans:", error);
    return [];
  }
  return data;
}

/** Récupère les findings d'un scan. */
export async function getScanFindings(scan_id: string) {
  const { data, error } = await supabase
    .from("security_findings")
    .select("*")
    .eq("scan_id", scan_id)
    .order("severity", { ascending: true });

  if (error) return [];
  return data;
}

// ============================================================================
// UTILS
// ============================================================================
async function sha256(input: string): Promise<string> {
  const buffer = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
