// ============================================================================
// SILEX v2 « LEVEL MAX » — Moteur de scan cybersécurité 100% DÉFENSIF/PASSIF
// ti-lex-v10 — Produit du Québec ⚜️
// ----------------------------------------------------------------------------
// Actions : scan_complet | scan_rapide | comparer | lire_rapport
//
// Principes NON NÉGOCIABLES :
//   • Autorisation OBLIGATOIRE vérifiée DANS la fonction (admin / SOW /
//     cible vérifiée) — jamais de scan sans droit explicite.
//   • Anti-SSRF : uniquement des domaines publics ou IPv4 publiques.
//     localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, 0.0.0.0,
//     .local, .internal → REFUSÉS.
//   • Passif UNIQUEMENT : DNS-over-HTTPS, GET/HEAD standards, crt.sh.
//     AUCUN port scan, AUCUNE exploitation, AUCUNE attaque.
//   • Chaque module est isolé (try/catch) : un module en panne ne fait
//     jamais échouer le scan complet.
//   • Aucun secret en dur : tout passe par les variables d'environnement.
//   • Score réel : 100 − (25×critical + 12×high + 6×medium + 2×low), min 0.
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── CONFIGURATION (env uniquement, zéro secret en dur) ─────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY"); // optionnel : résumé IA
const AI_MODEL = "claude-sonnet-5";
const ADMIN_USER_ID = "d9a1985a-e106-4ea5-9ada-cac775c0b820";
const MAX_SCANS_PAR_JOUR = 20;
const CORS_PROBE_ORIGIN = "https://silex-cors-probe.example";

const CORS = {
  "Access-Control-Allow-Origin": "*", // pattern existant du projet
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── TYPES ──────────────────────────────────────────────────────────────────
type Sev = "critical" | "high" | "medium" | "low" | "info";
type Action = "scan_complet" | "scan_rapide" | "comparer" | "lire_rapport";

interface Finding {
  module: string;        // nom du module (sert à la signature du diff)
  severity: Sev;
  title: string;
  description: string;
  remediation: string;
  cwe?: string[];
}

// deno-lint-ignore no-explicit-any
type DB = any;

// ─── RÉPONSES JSON PROPRES ──────────────────────────────────────────────────
function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ success: true, ...payload }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function err(status: number, message: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ success: false, error: message, ...extra }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── UTILITAIRES RÉSEAU (timeout OBLIGATOIRE partout) ───────────────────────
async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Lit au max `maxBytes` octets du corps puis annule le flux (jamais de gros download).
async function lireCorpsPlafonne(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } catch {
    // Corps illisible : on garde ce qu'on a.
  }
  try { await reader.cancel(); } catch { /* flux déjà fermé */ }
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.min(c.length, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.length;
    if (offset >= merged.length) break;
  }
  return new TextDecoder().decode(merged);
}

// ─── NORMALISATION DE CIBLE + ANTI-SSRF ─────────────────────────────────────
// Extrait le hostname : sans schéma, sans port, sans chemin, en minuscules.
function hostOf(target: string): string {
  try {
    return new URL(target.includes("://") ? target : `https://${target}`).hostname.toLowerCase();
  } catch {
    return target.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
  }
}
function urlOf(target: string): string {
  return target.includes("://") ? target : `https://${target}`;
}

// Cible publique raisonnable ? REFUSE tout ce qui est privé/interne (anti-SSRF).
function ciblePubliqueValide(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (
    host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".local") || host.endsWith(".internal")
  ) return false;

  // IPv4 : seules les adresses PUBLIQUES sont acceptées.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts.some((p) => Number.isNaN(p) || p > 255)) return false;
    const [a, b] = parts;
    if (a === 0) return false;                          // 0.0.0.0/8
    if (a === 10) return false;                         // privé RFC1918
    if (a === 127) return false;                        // loopback
    if (a === 169 && b === 254) return false;           // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;  // privé RFC1918
    if (a === 192 && b === 168) return false;           // privé RFC1918
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false;                         // multicast/réservé
    return true;
  }

  // Domaine : labels valides, au moins un point (évite les noms internes).
  const label = "(?!-)[a-z0-9-]{1,63}(?<!-)";
  const re = new RegExp(`^${label}(\\.${label})+$`);
  return re.test(host);
}

// host est-il couvert par une cible déclarée ? (sous-domaines acceptés)
function hoteCouvert(host: string, declare: string): boolean {
  const d = hostOf(declare);
  return host === d || host.endsWith(`.${d}`);
}

// ─── AUTORISATION (DANS la fonction : admin → SOW → cible vérifiée) ─────────
async function verifierAutorisation(
  db: DB,
  userId: string,
  host: string,
): Promise<{ ok: boolean; via?: string }> {
  // 1) Administrateur ti-lex : accès complet.
  if (userId === ADMIN_USER_ID) return { ok: true, via: "admin" };

  // 2) SOW (Statement of Work) actif couvrant la cible.
  try {
    const { data: sows } = await db.from("security_sow").select("*").eq("status", "active");
    const maintenant = Date.now();
    for (const s of sows ?? []) {
      // Si la ligne est rattachée à un utilisateur, elle doit être la sienne.
      if (s.user_id && s.user_id !== userId) continue;
      const debut = s.valid_from ? Date.parse(s.valid_from) : Number.NEGATIVE_INFINITY;
      const fin = s.valid_until ? Date.parse(s.valid_until) : Number.POSITIVE_INFINITY;
      if (maintenant < debut || maintenant > fin) continue;
      const cibles: unknown[] = Array.isArray(s.allowed_targets) ? s.allowed_targets : [];
      if (cibles.some((c) => hoteCouvert(host, String(c)))) return { ok: true, via: "sow" };
    }
  } catch {
    // Table absente/inaccessible : on continue vers les cibles vérifiées.
  }

  // 3) Cible vérifiée par l'utilisateur lui-même (preuve de propriété).
  try {
    const { data: vt } = await db
      .from("cyber_verified_targets")
      .select("id")
      .eq("user_id", userId)
      .eq("host", host)
      .eq("verified", true)
      .gt("expires_at", new Date().toISOString())
      .limit(1);
    if (vt && vt.length > 0) return { ok: true, via: "cible_verifiee" };
  } catch {
    // Table absente : refus.
  }

  return { ok: false };
}

// ─── DNS-over-HTTPS (Cloudflare) — passif ───────────────────────────────────
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

// Fabrique de finding en français (severity/title/description/remediation).
function mk(module: string, severity: Sev, title: string, description: string, remediation: string, cwe?: string[]): Finding {
  return { module, severity, title, description, remediation, cwe: cwe ?? [] };
}

// ════════════════════════════════════════════════════════════════════════════
// MODULES DE SCAN — tous PASSIFS (DoH, GET/HEAD standards, crt.sh)
// ════════════════════════════════════════════════════════════════════════════

// ─── MODULE 1 : dns_v2 — hygiène DNS/courriel (DoH) ─────────────────────────
async function moduleDnsV2(host: string): Promise<Finding[]> {
  const out: Finding[] = [];

  // SPF
  const txt = await dohQuery(host, "TXT");
  const spf = txt.find((r) => r.toLowerCase().includes("v=spf1"));
  if (!spf) {
    out.push(mk("dns_v2", "medium", "SPF absent",
      `Aucun enregistrement SPF trouvé pour ${host}. Le domaine peut être usurpé pour envoyer des courriels frauduleux (hameçonnage).`,
      "Publier un enregistrement TXT SPF (ex. « v=spf1 include:_spf.google.com ~all ») sur le domaine.",
      ["CWE-290"]));
  } else {
    out.push(mk("dns_v2", "info", "SPF présent",
      `Un enregistrement SPF est publié pour ${host}.`,
      "Aucune action requise."));
  }

  // DMARC
  const dmarcTxt = await dohQuery(`_dmarc.${host}`, "TXT");
  const dmarc = dmarcTxt.find((r) => r.toLowerCase().includes("v=dmarc1"));
  if (!dmarc) {
    out.push(mk("dns_v2", "medium", "DMARC absent",
      `Aucune politique DMARC pour ${host}. La protection contre l'usurpation de courriels est incomplète.`,
      "Publier un TXT _dmarc avec une politique (commencer par p=quarantine puis p=reject).",
      ["CWE-290"]));
  } else if (/p\s*=\s*none/i.test(dmarc)) {
    out.push(mk("dns_v2", "low", "DMARC en mode surveillance (p=none)",
      `DMARC présent pour ${host} mais p=none : aucun blocage réel des courriels usurpés.`,
      "Passer progressivement à p=quarantine puis p=reject après analyse des rapports."));
  } else {
    out.push(mk("dns_v2", "info", "DMARC appliqué",
      `DMARC actif avec politique de blocage pour ${host}.`,
      "Aucune action requise."));
  }

  // DKIM : on teste les sélecteurs les plus courants.
  const selecteurs = ["google", "default", "selector1", "selector2", "k1", "mail", "dkim"];
  const trouves: string[] = [];
  for (const sel of selecteurs) {
    const recs = await dohQuery(`${sel}._domainkey.${host}`, "TXT");
    if (recs.some((r) => /v=dkim1|k=rsa|\bp=/.test(r.toLowerCase()))) trouves.push(sel);
  }
  if (trouves.length === 0) {
    out.push(mk("dns_v2", "low", "DKIM non détecté",
      `Aucun sélecteur DKIM courant (${selecteurs.join(", ")}) ne répond pour ${host}. Les courriels ne sont peut-être pas signés.`,
      "Activer la signature DKIM chez le fournisseur de courriel et publier la clé publique en DNS."));
  } else {
    out.push(mk("dns_v2", "info", "DKIM détecté",
      `Sélecteur(s) DKIM trouvé(s) pour ${host} : ${trouves.join(", ")}.`,
      "Aucune action requise."));
  }

  // CAA : restreint les autorités de certification autorisées.
  const caa = await dohQuery(host, "CAA");
  if (caa.length === 0) {
    out.push(mk("dns_v2", "low", "CAA absent",
      `Aucun enregistrement CAA pour ${host} : n'importe quelle autorité de certification peut émettre un certificat pour ce domaine.`,
      "Publier un enregistrement CAA (ex. « 0 issue \"letsencrypt.org\" ») pour restreindre l'émission de certificats.",
      ["CWE-295"]));
  } else {
    out.push(mk("dns_v2", "info", "CAA présent",
      `Enregistrement(s) CAA publié(s) pour ${host}.`,
      "Aucune action requise."));
  }

  // DNSSEC : présence d'un enregistrement DS.
  const ds = await dohQuery(host, "DS");
  if (ds.length === 0) {
    out.push(mk("dns_v2", "info", "DNSSEC non activé",
      `Aucun enregistrement DS pour ${host} : la zone n'est pas signée DNSSEC.`,
      "Envisager l'activation de DNSSEC chez le registraire pour prévenir l'empoisonnement DNS."));
  } else {
    out.push(mk("dns_v2", "info", "DNSSEC activé",
      `La zone ${host} est signée (enregistrement DS présent).`,
      "Aucune action requise."));
  }

  // MX : simple inventaire.
  const mx = await dohQuery(host, "MX");
  out.push(mk("dns_v2", "info", "Enregistrements MX",
    `${mx.length} serveur(s) de courriel détecté(s) pour ${host}.`,
    "Aucune action requise."));

  // MTA-STS : chiffrement imposé entre serveurs SMTP.
  const mtaSts = await dohQuery(`_mta-sts.${host}`, "TXT");
  if (!mtaSts.some((r) => r.toLowerCase().includes("v=stsv1"))) {
    out.push(mk("dns_v2", "info", "MTA-STS absent",
      `Aucun enregistrement _mta-sts pour ${host} : le chiffrement SMTP entrant n'est pas imposé.`,
      "Publier une politique MTA-STS si le domaine reçoit du courriel sensible."));
  } else {
    out.push(mk("dns_v2", "info", "MTA-STS présent",
      `MTA-STS est configuré pour ${host}.`,
      "Aucune action requise."));
  }

  return out;
}

// ─── MODULE 2 : http_headers — en-têtes de sécurité HTTP (GET simple) ───────
async function moduleHttpHeaders(target: string): Promise<Finding[]> {
  const url = urlOf(target);
  const out: Finding[] = [];
  let res: Response;
  try {
    res = await fetchT(url, { method: "GET", redirect: "follow" }, 10000);
  } catch (e) {
    out.push(mk("http_headers", "info", "Cible HTTP injoignable",
      `Impossible de charger ${url} : ${e instanceof Error ? e.message : String(e)}.`,
      "Vérifier que le site est en ligne et accessible en HTTPS."));
    return out;
  }
  const h = res.headers;

  if (!h.has("strict-transport-security")) {
    out.push(mk("http_headers", "medium", "HSTS manquant",
      `L'en-tête Strict-Transport-Security est absent sur ${url}. Un utilisateur peut être rétrogradé vers HTTP (interception).`,
      "Ajouter « Strict-Transport-Security: max-age=31536000; includeSubDomains » sur toutes les réponses HTTPS.",
      ["CWE-319"]));
  }
  if (!h.has("content-security-policy")) {
    out.push(mk("http_headers", "medium", "Content-Security-Policy manquante",
      `Aucune politique CSP sur ${url}. Le risque d'injection XSS et de chargement de ressources malveillantes est accru.`,
      "Définir une Content-Security-Policy restrictive (default-src 'self' puis durcissement progressif).",
      ["CWE-693"]));
  }
  const csp = h.get("content-security-policy") ?? "";
  if (!h.has("x-frame-options") && !csp.includes("frame-ancestors")) {
    out.push(mk("http_headers", "low", "Protection clickjacking manquante",
      `Ni X-Frame-Options ni frame-ancestors (CSP) sur ${url} : la page peut être intégrée dans un cadre malveillant.`,
      "Ajouter « X-Frame-Options: DENY » ou une directive frame-ancestors dans la CSP.",
      ["CWE-1021"]));
  }
  if (!h.has("x-content-type-options")) {
    out.push(mk("http_headers", "low", "X-Content-Type-Options manquant",
      `Le navigateur peut deviner le type MIME des réponses de ${url} (MIME sniffing).`,
      "Ajouter « X-Content-Type-Options: nosniff ».",
      ["CWE-693"]));
  }
  if (!h.has("referrer-policy")) {
    out.push(mk("http_headers", "low", "Referrer-Policy manquante",
      `Aucune politique de référent sur ${url} : l'URL complète peut fuiter vers des sites tiers.`,
      "Ajouter « Referrer-Policy: strict-origin-when-cross-origin »."));
  }
  if (!h.has("permissions-policy")) {
    out.push(mk("http_headers", "low", "Permissions-Policy manquante",
      `Aucune Permissions-Policy sur ${url} : les API sensibles du navigateur (caméra, micro, géolocalisation) ne sont pas restreintes.`,
      "Ajouter une Permissions-Policy désactivant les fonctionnalités inutilisées."));
  }

  // Divulgation de versions serveur.
  const server = h.get("server");
  if (server && /\d/.test(server)) {
    out.push(mk("http_headers", "low", "Version du serveur exposée",
      `L'en-tête Server de ${url} divulgue une version précise du logiciel serveur (valeur masquée ici volontairement).`,
      "Configurer le serveur pour masquer la version (server_tokens off sous nginx, ServerTokens Prod sous Apache).",
      ["CWE-200"]));
  }
  const xpb = h.get("x-powered-by");
  if (xpb) {
    out.push(mk("http_headers", "low", "En-tête X-Powered-By exposé",
      `La technologie dorsale de ${url} est divulguée via X-Powered-By.`,
      "Supprimer l'en-tête X-Powered-By de la configuration du serveur ou du framework.",
      ["CWE-200"]));
  }

  // Drapeaux des cookies de session (Secure / HttpOnly / SameSite).
  const cookies: string[] = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
  if (cookies.length > 0) {
    const manques: string[] = [];
    for (const c of cookies) {
      const nom = c.split("=")[0].trim();
      const flags = c.toLowerCase();
      const absents: string[] = [];
      if (!flags.includes("secure")) absents.push("Secure");
      if (!flags.includes("httponly")) absents.push("HttpOnly");
      if (!flags.includes("samesite")) absents.push("SameSite");
      if (absents.length > 0) manques.push(`${nom} (${absents.join(", ")})`);
    }
    if (manques.length > 0) {
      out.push(mk("http_headers", "low", "Drapeaux de cookies manquants",
        `Cookie(s) sans drapeaux de sécurité complets sur ${url} : ${manques.slice(0, 5).join("; ")}.`,
        "Ajouter Secure, HttpOnly et SameSite=Lax/Strict à tous les cookies de session.",
        ["CWE-614"]));
    }
  }
  return out;
}

// ─── MODULE 3 : tls_cert — certificat via crt.sh (journaux CT publics) ──────
async function moduleTlsCert(host: string): Promise<Finding[]> {
  try {
    const res = await fetchT(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json`, { headers: { accept: "application/json" } }, 8000);
    if (!res.ok) throw new Error(`crt.sh HTTP ${res.status}`);
    const entrees = await res.json() as Array<{
      id: number; not_before: string; not_after: string; issuer_name: string; common_name: string;
    }>;
    if (!Array.isArray(entrees) || entrees.length === 0) throw new Error("aucune entrée CT");

    // Certificat le plus récent émis pour ce domaine.
    const dernier = entrees.reduce((a, b) =>
      Date.parse(b.not_before) > Date.parse(a.not_before) ? b : a
    );
    const joursRestants = Math.floor((Date.parse(dernier.not_after) - Date.now()) / 86400000);
    const out: Finding[] = [];

    if (joursRestants < 7) {
      out.push(mk("tls_cert", "critical", "Certificat TLS expiré ou sur le point d'expirer",
        `Le certificat le plus récent de ${host} expire dans ${Math.max(joursRestants, 0)} jour(s) (${dernier.not_after}). Le site deviendra inaccessible ou affichera un avertissement de sécurité.`,
        "Renouveler le certificat immédiatement et automatiser le renouvellement (ex. certbot, managed certificates).",
        ["CWE-295"]));
    } else if (joursRestants < 30) {
      out.push(mk("tls_cert", "high", "Certificat TLS expire bientôt",
        `Le certificat de ${host} expire dans ${joursRestants} jours (${dernier.not_after}).`,
        "Planifier le renouvellement du certificat cette semaine.",
        ["CWE-295"]));
    } else if (joursRestants < 60) {
      out.push(mk("tls_cert", "low", "Certificat TLS à renouveler sous peu",
        `Le certificat de ${host} expire dans ${joursRestants} jours (${dernier.not_after}).`,
        "Vérifier que le renouvellement automatique fonctionne."));
    } else {
      out.push(mk("tls_cert", "info", "Certificat TLS valide",
        `Le certificat de ${host} est valide encore ${joursRestants} jours (jusqu'au ${dernier.not_after}).`,
        "Aucune action requise."));
    }
    out.push(mk("tls_cert", "info", "Émetteur du certificat",
      `Certificat de ${host} émis par : ${dernier.issuer_name.slice(0, 120)}.`,
      "Aucune action requise."));
    return out;
  } catch {
    // Dégradation gracieuse : crt.sh est un service externe, parfois indisponible.
    return [mk("tls_cert", "info", "Certificat TLS non vérifié",
      `Le registre public crt.sh est indisponible : l'expiration du certificat de ${host} n'a pas pu être vérifiée (aucune supposition faite).`,
      "Relancer le scan plus tard ou vérifier le certificat manuellement.")];
  }
}

// ─── MODULE 4 : sous_domaines — inventaire passif via crt.sh ────────────────
async function moduleSousDomaines(host: string): Promise<Finding[]> {
  try {
    const res = await fetchT(`https://crt.sh/?q=%25.${encodeURIComponent(host)}&output=json`, { headers: { accept: "application/json" } }, 10000);
    if (!res.ok) throw new Error(`crt.sh HTTP ${res.status}`);
    const entrees = await res.json() as Array<{ name_value: string }>;

    // Déduplication, retrait des jokers, plafond de 25.
    const ensemble = new Set<string>();
    for (const e of entrees ?? []) {
      for (const nom of String(e.name_value ?? "").split("\n")) {
        const n = nom.trim().toLowerCase().replace(/^\*\./, "");
        if (n && n.endsWith(host)) ensemble.add(n);
      }
      if (ensemble.size >= 25) break;
    }
    const sousDomaines = [...ensemble].slice(0, 25).sort();
    const out: Finding[] = [];

    out.push(mk("sous_domaines", "info", "Sous-domaines découverts (passif)",
      `${sousDomaines.length} sous-domaine(s) de ${host} référencé(s) dans les journaux publics de certificats.`,
      "Vérifier que chaque sous-domaine listé est encore nécessaire et sécurisé."));

    // Sous-domaines à vocation sensible : surface d'attaque à surveiller.
    const sensible = /(^|\.)(dev|staging|admin|vpn|test|old|backup)(\.|$)/;
    const flags = sousDomaines.filter((s) => sensible.test(s));
    for (const s of flags) {
      out.push(mk("sous_domaines", "info", "Sous-domaine sensible exposé",
        `Le sous-domaine « ${s} » (dev/staging/admin/vpn/test/old/backup) est visible publiquement dans les journaux de certificats.`,
        "S'assurer que cet environnement est protégé (authentification, restrictions IP) ou le retirer s'il est inutilisé.",
        ["CWE-200"]));
    }

    if (ensemble.size > 20) {
      out.push(mk("sous_domaines", "low", "Surface d'attaque étendue",
        `Plus de 20 sous-domaines sont associés à ${host} : chacun est un point d'entrée potentiel à maintenir.`,
        "Faire l'inventaire des sous-domaines actifs et désactiver ceux qui sont orphelins."));
    }
    return out;
  } catch {
    return [mk("sous_domaines", "info", "Sous-domaines non vérifiés",
      `crt.sh est indisponible : l'inventaire passif des sous-domaines de ${host} n'a pas pu être fait.`,
      "Relancer le scan plus tard.")];
  }
}

// ─── MODULE 5 : fichiers_exposes — GET statut + 2 Ko max, contenu MASQUÉ ────
async function moduleFichiersExposes(target: string): Promise<Finding[]> {
  const base = urlOf(target).replace(/\/+$/, "");
  const out: Finding[] = [];

  // Sonde un chemin : ne retourne QUE le statut et le tout début du corps
  // (jamais affiché en clair dans les findings — uniquement pour la détection).
  async function sonde(chemin: string): Promise<{ statut: number; extrait: string }> {
    try {
      const res = await fetchT(`${base}${chemin}`, { method: "GET", redirect: "manual" }, 8000);
      const extrait = await lireCorpsPlafonne(res, 2048);
      return { statut: res.status, extrait };
    } catch {
      return { statut: 0, extrait: "" };
    }
  }

  // /.git/HEAD : dépôt Git exposé = fuite de code source.
  const gitHead = await sonde("/.git/HEAD");
  if (gitHead.statut === 200 && gitHead.extrait.includes("ref:")) {
    out.push(mk("fichiers_exposes", "critical", "Dépôt Git exposé publiquement",
      `L'URL ${base}/.git/HEAD répond avec un contenu de dépôt Git valide (statut 200). Le code source complet peut être téléchargé (contenu masqué volontairement).`,
      "Bloquer immédiatement l'accès aux chemins /.git/* dans la configuration du serveur web et vérifier qu'aucun secret n'a fuité dans l'historique.",
      ["CWE-538", "CWE-200"]));
  }

  // /.git/config
  const gitConfig = await sonde("/.git/config");
  if (gitConfig.statut === 200) {
    out.push(mk("fichiers_exposes", "critical", "Fichier .git/config accessible",
      `${base}/.git/config répond 200 : la configuration du dépôt (URL distante, branches) est exposée (contenu masqué volontairement).`,
      "Bloquer l'accès à /.git/* et auditer le dépôt pour des secrets éventuellement exposés.",
      ["CWE-538", "CWE-200"]));
  }

  // /.env : secrets applicatifs.
  const env = await sonde("/.env");
  if (env.statut === 200) {
    out.push(mk("fichiers_exposes", "critical", "Fichier .env accessible publiquement",
      `${base}/.env répond 200 : le fichier d'environnement (qui contient souvent des clés et mots de passe) est téléchargeable (contenu masqué volontairement, jamais lu ni stocké).`,
      "URGENT : bloquer l'accès au fichier .env, puis révoquer et régénérer TOUS les secrets qu'il contient (clés API, mots de passe BD).",
      ["CWE-538", "CWE-798"]));
  }

  // /robots.txt : purement informatif, relève les Disallow sensibles.
  const robots = await sonde("/robots.txt");
  if (robots.statut === 200) {
    const disallows = robots.extrait.split("\n")
      .map((l) => l.trim())
      .filter((l) => /^disallow\s*:/i.test(l))
      .map((l) => l.split(":")[1]?.trim() ?? "")
      .filter((p) => /^\/(admin|backup|private)/i.test(p));
    const note = disallows.length > 0
      ? ` Chemins sensibles déclarés : ${disallows.slice(0, 5).join(", ")} — à protéger réellement (robots.txt n'est pas un contrôle d'accès).`
      : "";
    out.push(mk("fichiers_exposes", "info", "robots.txt présent",
      `${base}/robots.txt existe (statut 200).${note}`,
      disallows.length > 0
        ? "Ne jamais compter sur robots.txt pour protéger un chemin : ajouter une authentification côté serveur."
        : "Aucune action requise."));
  }

  // /.well-known/security.txt : point de contact pour les chercheurs en sécurité.
  const secTxt = await sonde("/.well-known/security.txt");
  if (secTxt.statut !== 200) {
    out.push(mk("fichiers_exposes", "info", "security.txt absent",
      `Aucun fichier /.well-known/security.txt sur ${base} : les chercheurs en sécurité n'ont pas de canal officiel pour signaler une faille.`,
      "Publier un security.txt (RFC 9116) avec un contact de sécurité."));
  }

  // /sitemap.xml : informatif.
  const sitemap = await sonde("/sitemap.xml");
  if (sitemap.statut === 200) {
    out.push(mk("fichiers_exposes", "info", "sitemap.xml présent",
      `${base}/sitemap.xml est accessible (statut 200) : la structure publique du site est listée.`,
      "Aucune action requise."));
  }

  return out;
}

// ─── MODULE 6 : fingerprint — technologies visibles (GET /, 200 Ko max) ─────
async function moduleFingerprint(target: string): Promise<Finding[]> {
  const url = urlOf(target);
  const out: Finding[] = [];
  let corps = "";
  try {
    const res = await fetchT(url, { method: "GET", redirect: "follow" }, 10000);
    corps = (await lireCorpsPlafonne(res, 200 * 1024)).toLowerCase();
  } catch {
    return [mk("fingerprint", "info", "Fingerprint impossible",
      `Impossible de charger la page d'accueil de ${url} pour l'identification des technologies.`,
      "Réessayer plus tard.")];
  }

  const versionRe = /\d+\.\d+(\.\d+)?/;
  const pousse = (nom: string, detail: string, version?: string) => {
    if (version) {
      out.push(mk("fingerprint", "low", `${nom} ${version} détecté`,
        `La technologie ${nom} version ${version} est identifiable publiquement sur ${url} (${detail}). Les versions précises facilitent le ciblage de vulnérabilités connues.`,
        `Vérifier que ${nom} est à jour et masquer la version si possible.`,
        ["CWE-200"]));
    } else {
      out.push(mk("fingerprint", "info", `${nom} détecté`,
        `La technologie ${nom} est utilisée sur ${url} (${detail}).`,
        "Maintenir ce composant à jour."));
    }
  };

  // Meta generator (WordPress, Drupal, etc.).
  const gen = corps.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/);
  if (gen) {
    const contenu = gen[1];
    const v = contenu.match(versionRe)?.[0];
    pousse(contenu.split(" ")[0].replace(/^\w/, (c) => c.toUpperCase()), "balise meta generator", v);
  }
  if (corps.includes("/wp-content/") || corps.includes("/wp-includes/")) {
    const v = corps.match(/wp-content[^"']*\?ver=(\d+\.\d+[\d.]*)/)?.[1];
    pousse("WordPress", "chemins /wp-content/", v);
  }
  const jq = corps.match(/jquery[-.]?(\d+\.\d+[\d.]*)?/);
  if (jq) pousse("jQuery", "script jQuery référencé", jq[1]);
  if (corps.includes("/_next/") || corps.includes("__next_data__")) {
    pousse("Next.js / React", "artefacts _next détectés");
  } else if (corps.includes("data-reactroot") || corps.includes("react-dom")) {
    pousse("React", "artefacts React détectés");
  }
  if (corps.includes("cdn.shopify.com") || corps.includes("shopify")) {
    pousse("Shopify", "plateforme Shopify identifiée");
  }
  if (corps.includes("wix.com") || corps.includes("x-wix")) {
    pousse("Wix", "plateforme Wix identifiée");
  }

  if (out.length === 0) {
    out.push(mk("fingerprint", "info", "Aucune technologie identifiable",
      `Aucune technologie courante n'a pu être identifiée sur ${url} à partir de la page d'accueil.`,
      "Aucune action requise."));
  }
  return out;
}

// ─── MODULE 7 : cors — sonde avec origine piégée (passive, GET unique) ──────
async function moduleCors(target: string): Promise<Finding[]> {
  const url = urlOf(target);
  let res: Response;
  try {
    res = await fetchT(url, { method: "GET", headers: { Origin: CORS_PROBE_ORIGIN } }, 10000);
  } catch {
    return [mk("cors", "info", "CORS non testable",
      `La cible ${url} est injoignable pour le test CORS.`,
      "Réessayer plus tard.")];
  }
  const acao = res.headers.get("access-control-allow-origin");
  const acac = (res.headers.get("access-control-allow-credentials") ?? "").toLowerCase() === "true";

  if (acao === CORS_PROBE_ORIGIN && acac) {
    return [mk("cors", "high", "CORS reflète une origine arbitraire AVEC identifiants",
      `${url} renvoie Access-Control-Allow-Origin égal à l'origine piégée ET Allow-Credentials: true. N'importe quel site malveillant peut lire les réponses authentifiées des visiteurs.`,
      "Restreindre Access-Control-Allow-Origin à une liste blanche d'origines connues et ne jamais combiner reflet + credentials.",
      ["CWE-942"])];
  }
  if (acao === "*" && acac) {
    return [mk("cors", "high", "CORS joker (*) avec identifiants",
      `${url} combine Access-Control-Allow-Origin: * et Allow-Credentials: true — configuration dangereuse.`,
      "Remplacer le joker par une liste blanche d'origines et réévaluer le besoin des credentials.",
      ["CWE-942"])];
  }
  if (acao === CORS_PROBE_ORIGIN) {
    return [mk("cors", "medium", "CORS reflète une origine arbitraire",
      `${url} renvoie l'origine piégée dans Access-Control-Allow-Origin : n'importe quel site peut lire les réponses publiques cross-origin.`,
      "Restreindre Access-Control-Allow-Origin à une liste blanche d'origines connues.",
      ["CWE-942"])];
  }
  if (acao === "*") {
    return [mk("cors", "low", "CORS permissif (joker *)",
      `${url} répond Access-Control-Allow-Origin: *. Acceptable pour du contenu strictement public, à documenter sinon.`,
      "Vérifier qu'aucune donnée privée n'est servie derrière ce joker.",
      ["CWE-942"])];
  }
  return [mk("cors", "info", "CORS restrictif",
    `Aucun joker ni reflet d'origine détecté sur ${url}.`,
    "Aucune action requise.")];
}

// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION, SCORE, DIFF, RÉSUMÉ, PERSISTANCE
// ════════════════════════════════════════════════════════════════════════════

// Registre des modules disponibles (tous passifs).
const MODULES: Record<string, (target: string, host: string) => Promise<Finding[]>> = {
  dns_v2: (_t, host) => moduleDnsV2(host),
  http_headers: (t) => moduleHttpHeaders(t),
  tls_cert: (_t, host) => moduleTlsCert(host),
  sous_domaines: (_t, host) => moduleSousDomaines(host),
  fichiers_exposes: (t) => moduleFichiersExposes(t),
  fingerprint: (t) => moduleFingerprint(t),
  cors: (t) => moduleCors(t),
};
const MODULES_RAPIDE = ["dns_v2", "http_headers", "tls_cert"];
const MODULES_COMPLET = Object.keys(MODULES);

// Exécute chaque module dans un try/catch : un module en panne produit un
// finding info « module indisponible » au lieu de faire échouer le scan.
async function executerModules(
  noms: string[],
  target: string,
  host: string,
): Promise<{ findings: Finding[]; statuts: Record<string, unknown> }> {
  const resultats = await Promise.all(noms.map(async (nom) => {
    try {
      const findings = await MODULES[nom](target, host);
      return { nom, findings, statut: "ok" as const };
    } catch (e) {
      return {
        nom,
        findings: [mk(nom, "info", `Module ${nom} indisponible`,
          `Le module ${nom} a rencontré une erreur : ${String(e instanceof Error ? e.message : e).slice(0, 160)}. Les autres modules ont continué normalement.`,
          "Relancer le scan plus tard.")],
        statut: "erreur" as const,
      };
    }
  }));
  const findings: Finding[] = [];
  const statuts: Record<string, unknown> = {};
  for (const r of resultats) {
    findings.push(...r.findings);
    statuts[r.nom] = { statut: r.statut, nb_findings: r.findings.length };
  }
  return { findings, statuts };
}

// ─── SCORE ET GRADES (système de couleurs existant du projet) ───────────────
function compterParSeverite(findings: Finding[]): Record<string, number> {
  const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) c[f.severity] = (c[f.severity] ?? 0) + 1;
  return c;
}
function calculerScore(c: Record<string, number>): number {
  return Math.max(0, 100 - (25 * c.critical + 12 * c.high + 6 * c.medium + 2 * c.low));
}
function gradeDe(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  if (score >= 20) return "E";
  return "F";
}
function risqueDe(score: number): string {
  if (score < 20) return "CRITIQUE 🔴";
  if (score < 40) return "ÉLEVÉ 🟠";
  if (score < 60) return "MODÉRÉ 🟡";
  if (score < 80) return "FAIBLE 🔵";
  return "MINIMAL ⚪";
}

// ─── DIFF entre deux scans (signature = module + title) ─────────────────────
function signature(f: { module?: string; title?: string }): string {
  return `${f.module ?? "inconnu"}::${f.title ?? "sans titre"}`;
}
interface DiffResult {
  nouveaux: Finding[];
  resolus: Finding[];
  persistants: Finding[];
  verdict: string;
}
function calculerDiff(precedents: Finding[], actuels: Finding[]): DiffResult {
  const sigAvant = new Map((precedents ?? []).map((f) => [signature(f), f]));
  const sigApres = new Map((actuels ?? []).map((f) => [signature(f), f]));
  const nouveaux = actuels.filter((f) => !sigAvant.has(signature(f)));
  const resolus = (precedents ?? []).filter((f) => !sigApres.has(signature(f)));
  const persistants = actuels.filter((f) => sigAvant.has(signature(f)));
  let verdict: string;
  if (nouveaux.length > resolus.length) {
    verdict = `dégradé : ${nouveaux.length} nouveau(x) finding(s) contre ${resolus.length} résolu(s)`;
  } else if (resolus.length > nouveaux.length) {
    verdict = `amélioré : ${resolus.length} finding(s) résolu(s) contre ${nouveaux.length} nouveau(x)`;
  } else {
    verdict = `stable : ${persistants.length} finding(s) persistant(s), ${nouveaux.length} nouveau(x), ${resolus.length} résolu(s)`;
  }
  return { nouveaux, resolus, persistants, verdict };
}

// ─── RÉSUMÉ EXÉCUTIF ────────────────────────────────────────────────────────
// Gabarit déterministe (repli si pas de clé IA ou si l'appel échoue).
function resumeDeterministe(
  mode: string, target: string, score: number, grade: string,
  risque: string, counts: Record<string, number>, findings: Finding[],
): string {
  const critiques = findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 3)
    .map((f) => f.title);
  const priorite = critiques.length > 0
    ? ` Action(s) prioritaire(s) : ${critiques.join(" ; ")}.`
    : " Aucun enjeu critique : maintenir la veille et les bonnes pratiques.";
  return `Scan ${mode === "scan_complet" ? "complet" : "rapide"} de ${target} : score ${score}/100 (grade ${grade}, risque ${risque}). `
    + `${counts.critical} critique(s), ${counts.high} élevé(s), ${counts.medium} moyen(s), ${counts.low} faible(s), ${counts.info} information(s).`
    + priorite;
}

// Résumé IA optionnel (claude-sonnet-5) — rédige à partir des FAITS seulement.
async function resumeIA(
  mode: string, target: string, score: number, grade: string,
  risque: string, counts: Record<string, number>, findings: Finding[],
): Promise<string> {
  if (!ANTHROPIC_KEY) return resumeDeterministe(mode, target, score, grade, risque, counts, findings);
  const faits = findings.map((f) => `[${f.severity}] ${f.title} — ${f.description}`).join("\n");
  const prompt =
    `Tu es SILEX, moteur de cybersécurité DÉFENSIVE de ti-lex (Québec). Rédige un résumé exécutif en FRANÇAIS de 4 à 6 phrases à partir UNIQUEMENT des faits ci-dessous — n'invente jamais rien.\n\n` +
    `Cible : ${target}\nMode : ${mode}\nScore : ${score}/100 (grade ${grade}, risque ${risque})\n` +
    `Sévérités : ${counts.critical} critique(s), ${counts.high} élevé(s), ${counts.medium} moyen(s), ${counts.low} faible(s)\n\nFindings réels :\n${faits}\n\n` +
    `Structure : appréciation globale → enjeux principaux → action prioritaire concrète.`;
  try {
    const res = await fetchT("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    }, 30000);
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const d = await res.json();
    const texte = d.content?.[0]?.text?.trim();
    if (!texte) throw new Error("réponse vide");
    return texte;
  } catch {
    // Repli déterministe : les faits sont toujours livrés.
    return resumeDeterministe(mode, target, score, grade, risque, counts, findings);
  }
}

// ─── PERSISTANCE : security_scans + security_findings + silex_reports ───────
async function persister(
  db: DB,
  userId: string,
  target: string,
  mode: string,
  findings: Finding[],
  counts: Record<string, number>,
  summary: string,
  statutsModules: Record<string, unknown>,
  diff: Record<string, unknown>,
  score: number,
  grade: string,
  risque: string,
  debutMs: number,
): Promise<{ scan_id: string | null; report_id: string | null }> {
  const maintenant = new Date().toISOString();
  let scanId: string | null = null;

  // 1) security_scans : compatibilité avec l'UI existante.
  //    Si la table historique a des contraintes particulières, on dégrade
  //    proprement : le rapport silex_reports (source de vérité v2) est quand
  //    même écrit.
  try {
    const { data: scan, error: scanErr } = await db.from("security_scans").insert({
      user_id: userId,
      target,
      scan_type: "web_scan",
      status: "completed",
      started_at: new Date(debutMs).toISOString(),
      completed_at: maintenant,
      findings_critical: counts.critical,
      findings_high: counts.high,
      findings_medium: counts.medium,
      findings_low: counts.low,
      findings_info: counts.info,
      executive_summary: summary,
    }).select("id").single();
    if (scanErr) console.warn("[silex-v2] insert security_scans:", scanErr.message);
    scanId = scan?.id ?? null;

    // 2) security_findings : une ligne par finding.
    if (scanId && findings.length > 0) {
      const { error: fErr } = await db.from("security_findings").insert(
        findings.map((f) => ({
          scan_id: scanId,
          severity: f.severity,
          title: f.title,
          description: f.description,
          affected_target: target,
          remediation: f.remediation,
          cwe_ids: f.cwe ?? [],
        })),
      );
      if (fErr) console.warn("[silex-v2] insert security_findings:", fErr.message);
    }
  } catch (e) {
    console.warn("[silex-v2] persistance security_scans impossible:", e);
  }

  // 3) silex_reports : rapport complet v2 (score, grade, diff, modules).
  let reportId: string | null = null;
  try {
    const { data: report, error: rErr } = await db.from("silex_reports").insert({
      user_id: userId,
      scan_id: scanId,
      target,
      mode,
      score,
      grade,
      risk_level: risque,
      findings,
      modules: statutsModules,
      diff,
      summary,
      duration_ms: Date.now() - debutMs,
    }).select("id").single();
    if (rErr) console.warn("[silex-v2] insert silex_reports:", rErr.message);
    reportId = report?.id ?? null;
  } catch (e) {
    console.warn("[silex-v2] persistance silex_reports impossible:", e);
  }

  return { scan_id: scanId, report_id: reportId };
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── JWT obligatoire ──────────────────────────────────────────────────
    const auth = req.headers.get("Authorization");
    if (!auth) return err(401, "Jeton d'authentification manquant (Authorization: Bearer ...).");
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return err(401, "Session invalide ou expirée.");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "") as Action;
    if (!["scan_complet", "scan_rapide", "comparer", "lire_rapport"].includes(action)) {
      return err(400, "Action invalide. Valeurs acceptées : scan_complet, scan_rapide, comparer, lire_rapport.");
    }

    // Client service_role : nécessaire pour écrire les rapports (RLS) et lire
    // les tables d'autorisation. L'autorisation MÉTIER est vérifiée ici, dans
    // la fonction — jamais déléguée aveuglément.
    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Action lire_rapport : lecture seule, scopée à l'utilisateur ─────
    if (action === "lire_rapport") {
      let q = db.from("silex_reports").select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (body.target && typeof body.target === "string") {
        q = q.eq("target", body.target.trim().slice(0, 255));
      }
      const { data: rapports } = await q;
      const rapport = rapports?.[0];
      if (!rapport) return err(404, "Aucun rapport SILEX v2 trouvé pour cette cible.");
      return ok({
        action,
        report_id: rapport.id,
        scan_id: rapport.scan_id,
        target: rapport.target,
        mode: rapport.mode,
        score: rapport.score,
        grade: rapport.grade,
        risk_level: rapport.risk_level,
        findings: rapport.findings,
        diff: rapport.diff,
        summary: rapport.summary,
        duration_ms: rapport.duration_ms,
        created_at: rapport.created_at,
      });
    }

    // ── Cible obligatoire et validée (anti-SSRF) ────────────────────────
    const target = typeof body.target === "string" ? body.target.trim().slice(0, 255) : "";
    if (!target) return err(400, "Paramètre « target » requis (domaine ou IPv4 publique).");
    const host = hostOf(target);
    if (!ciblePubliqueValide(host)) {
      return err(400, "Cible invalide ou interdite : seuls les domaines publics et les IPv4 publiques sont acceptés (anti-SSRF).");
    }

    // ── Action comparer : diff entre les 2 derniers rapports ────────────
    if (action === "comparer") {
      const { data: rapports } = await db.from("silex_reports")
        .select("id, created_at, mode, score, grade, findings")
        .eq("user_id", user.id)
        .eq("target", target)
        .order("created_at", { ascending: false })
        .limit(2);
      if (!rapports || rapports.length < 2) {
        return err(404, "Il faut au moins 2 rapports sur cette cible pour comparer (lance d'abord 2 scans).");
      }
      const diff = calculerDiff(rapports[1].findings ?? [], rapports[0].findings ?? []);
      return ok({
        action,
        target,
        rapport_recent: { id: rapports[0].id, date: rapports[0].created_at, score: rapports[0].score, grade: rapports[0].grade },
        rapport_precedent: { id: rapports[1].id, date: rapports[1].created_at, score: rapports[1].score, grade: rapports[1].grade },
        diff,
      });
    }

    // ── AUTORISATION OBLIGATOIRE (dans la fonction) ─────────────────────
    const autorisation = await verifierAutorisation(db, user.id, host);
    if (!autorisation.ok) {
      return err(403, `Scan refusé : aucune autorisation active ne couvre « ${host} ».`, {
        hint: "Vérifie ta cible ou ton SOW",
      });
    }

    // ── Rate limit : max 20 scans/jour/utilisateur ──────────────────────
    const debutJour = new Date();
    debutJour.setUTCHours(0, 0, 0, 0);
    const { count: scansDuJour } = await db.from("security_scans")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("started_at", debutJour.toISOString());
    if ((scansDuJour ?? 0) >= MAX_SCANS_PAR_JOUR) {
      return err(429, `Limite atteinte : maximum ${MAX_SCANS_PAR_JOUR} scans par jour. Réessaie demain.`);
    }

    // ── EXÉCUTION DU SCAN (modules passifs uniquement) ──────────────────
    const debutMs = Date.now();
    const nomsModules = action === "scan_rapide" ? MODULES_RAPIDE : MODULES_COMPLET;
    const { findings, statuts } = await executerModules(nomsModules, target, host);

    const counts = compterParSeverite(findings);
    const score = calculerScore(counts);
    const grade = gradeDe(score);
    const risque = risqueDe(score);

    // Diff automatique après un scan_complet : contre le dernier rapport
    // existant pour le même (utilisateur, cible).
    let diff: Record<string, unknown> = {};
    if (action === "scan_complet") {
      const { data: precedents } = await db.from("silex_reports")
        .select("findings")
        .eq("user_id", user.id)
        .eq("target", target)
        .order("created_at", { ascending: false })
        .limit(1);
      if (precedents?.[0]) {
        diff = calculerDiff(precedents[0].findings ?? [], findings) as unknown as Record<string, unknown>;
      }
    }

    // Résumé exécutif : IA si la clé est configurée, sinon gabarit déterministe.
    const summary = await resumeIA(action, target, score, grade, risque, counts, findings);

    // Persistance : security_scans + security_findings + silex_reports.
    const { scan_id, report_id } = await persister(
      db, user.id, target, action, findings, counts, summary, statuts, diff, score, grade, risque, debutMs,
    );

    return ok({
      action,
      report_id,
      scan_id,
      target,
      autorisation: autorisation.via,
      score,
      grade,
      risk_level: risque,
      severity_counts: counts,
      findings,
      modules: statuts,
      diff,
      summary,
      duration_ms: Date.now() - debutMs,
    });
  } catch (e) {
    return err(500, `Erreur interne SILEX v2 : ${e instanceof Error ? e.message : String(e)}`);
  }
});
