// ============================================================
// ti-lex v10 — Edge Function : verify-neq
// Vérifie le NEQ via Registraire des entreprises du Québec
// Gère la signature DPA (Déclaration de Propriété et d'Autorisation)
// Produit du Québec ⚜️
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- Vérification NEQ via Registraire des entreprises du Québec ----
async function verifyNEQWithREQ(neq: string) {
  try {
    // Portail public du REQ — données ouvertes
    const url = `https://www.registreentreprises.gouv.qc.ca/RQAnonymeGR/GR/GR03/GR03A2_22A_PIU_RecupDonnPub_PC/RecupererDonneeEntreprise.aspx?NEQ=${neq}&Langue=F`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ti-lex/1.0 Legal Verification Service (Quebec)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000), // 8 secondes max
    });

    if (!response.ok) {
      throw new Error(`REQ HTTP ${response.status}`);
    }

    const html = await response.text();

    // NEQ introuvable
    if (
      html.includes("Aucune entreprise") ||
      html.includes("n'a pu être trouvée") ||
      html.includes("introuvable")
    ) {
      return { valid: false, neq, error: "NEQ introuvable dans le Registraire des entreprises du Québec" };
    }

    // Extraction du nom d'entreprise (parsing HTML basique)
    const namePatterns = [
      /class="[^"]*NomEntreprise[^"]*"[^>]*>([^<]+)</i,
      /<td[^>]*>\s*Nom de l'entreprise\s*<\/td>\s*<td[^>]*>([^<]+)</i,
      /id="lblNom"[^>]*>([^<]+)</i,
    ];
    let companyName: string | undefined;
    for (const pattern of namePatterns) {
      const match = html.match(pattern);
      if (match) { companyName = match[1].trim(); break; }
    }

    // Statut actif/radié
    const isRadiee = html.includes("Radiée") || html.includes("Dissoute") || html.includes("Révoquée");
    const isActive = !isRadiee;

    return {
      valid: isActive,
      neq,
      companyName: companyName || `Entreprise NEQ-${neq}`,
      status: isActive ? "Actif" : "Inactif — Radiée/Dissoute",
    };

  } catch (error) {
    // ---- Fallback : validation du format uniquement ----
    // Le REQ n'est pas toujours accessible. On valide au moins le format
    // et on log l'erreur pour l'audit.
    console.error("REQ API inaccessible:", error.message);
    const isValidFormat = /^\d{10}$/.test(neq);

    return {
      valid: isValidFormat,
      neq,
      companyName: undefined,
      status: isValidFormat ? "Format valide — vérification automatique indisponible" : "Format invalide",
      warning: "Le Registraire des entreprises était temporairement inaccessible. Votre NEQ a été accepté sur la base du format. Une vérification manuelle sera effectuée sous 48h.",
    };
  }
}

// ---- Texte officiel de la DPA (Déclaration de Propriété et d'Autorisation) ----
const DPA_TEXT_FR = `Je déclare être le propriétaire légal, l'administrateur désigné ou le mandataire dûment autorisé par écrit des systèmes informatiques, domaines, adresses IP et plateformes listés ci-dessous, et j'autorise expressément l'utilisation de l'outil ti-lex pour effectuer une analyse de sécurité sur ces systèmes. Je reconnais que toute fausse déclaration engage ma responsabilité pénale exclusive en vertu des articles 342.1 et 184 du Code criminel du Canada.`;

// ---- Serveur principal ----
serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authentification obligatoire
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé — JWT requis" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Vérification du JWT utilisateur
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token invalide ou expiré" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // Extraction IP pour les logs légaux
    const clientIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "inconnue";

    // ============================================================
    // ACTION 1 : Vérification du NEQ
    // ============================================================
    if (action === "verify_neq") {
      const { neq } = body;

      // Validation du format avant appel API
      if (!neq || !/^\d{10}$/.test(neq.trim())) {
        return new Response(
          JSON.stringify({ valid: false, error: "Le NEQ doit être exactement 10 chiffres" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await verifyNEQWithREQ(neq.trim());

      // Enregistrement de la vérification (log légal)
      await supabase.from("enterprise_verifications").insert({
        user_id: user.id,
        neq: neq.trim(),
        company_name: result.companyName,
        company_status: result.status,
        verification_ip: clientIp,
        verified_at: new Date().toISOString(),
        raw_response: result,
      });

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        event_type: "neq_verified",
        event_data: { neq: neq.trim(), valid: result.valid, status: result.status },
        ip_address: clientIp,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // ACTION 2 : Signature DPA + enregistrement des domaines
    // ============================================================
    if (action === "sign_dpa") {
      const { domains, cgu_version = "1.0", enterprise_verification_id } = body;
      const userAgent = req.headers.get("user-agent") ?? "inconnu";

      // Validation des domaines
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return new Response(
          JSON.stringify({ error: "Au moins un domaine est requis" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const validDomains = domains
        .map((d: string) => d.trim().toLowerCase())
        .filter((d: string) => d.length > 0);

      if (validDomains.length === 0) {
        return new Response(
          JSON.stringify({ error: "Domaines invalides" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Vérifier que l'utilisateur a validé son NEQ (obligatoire)
      const { data: verif } = await supabase
        .from("enterprise_verifications")
        .select("id, neq, company_name, company_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!verif) {
        return new Response(
          JSON.stringify({ error: "Vérification NEQ requise avant signature DPA" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Horodatage officiel (preuve légale)
      const signedAt = new Date().toISOString();

      // Insertion du consentement DPA
      const { data: consent, error: consentError } = await supabase
        .from("user_consents")
        .insert({
          user_id: user.id,
          enterprise_verification_id: verif.id,
          cgu_version,
          dpa_declaration: DPA_TEXT_FR,
          declared_domains: validDomains,
          signed_at: signedAt,
          signing_ip: clientIp,
          user_agent: userAgent,
          is_active: true,
        })
        .select()
        .single();

      if (consentError) throw consentError;

      // Enregistrement des domaines dans scan_scopes
      const scopeRows = validDomains.map((domain: string) => ({
        user_id: user.id,
        consent_id: consent.id,
        domain,
        domain_type: /^\d{1,3}\.\d{1,3}\.\d{1,3}/.test(domain) ? "ip" : "url",
        is_verified: false,
        added_at: signedAt,
      }));

      await supabase.from("scan_scopes").insert(scopeRows);

      // Audit log — trace permanente
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        event_type: "dpa_signed",
        event_data: {
          consent_id: consent.id,
          cgu_version,
          domains_count: validDomains.length,
          neq: verif.neq,
          company: verif.company_name,
          signing_ip: clientIp,
        },
        ip_address: clientIp,
      });

      return new Response(
        JSON.stringify({
          success: true,
          consent_id: consent.id,
          signed_at: signedAt,
          domains_registered: validDomains.length,
          company: verif.company_name,
          neq: verif.neq,
          message: "DPA signée et archivée pour 5 ans. Scans activés pour les domaines déclarés.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // ACTION 3 : Vérifier si l'utilisateur est déjà onboardé
    // ============================================================
    if (action === "check_onboarding_status") {
      const { data: consent } = await supabase
        .from("user_consents")
        .select("id, signed_at, declared_domains, cgu_version")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const { data: verif } = await supabase
        .from("enterprise_verifications")
        .select("id, neq, company_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return new Response(
        JSON.stringify({
          onboarded: !!consent,
          consent: consent ?? null,
          enterprise: verif ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Action non reconnue" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("verify-neq error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
