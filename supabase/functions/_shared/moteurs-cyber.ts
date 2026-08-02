// ============================================================================
// ti-lex v10 — BIBLIOTHÈQUE DE MOTEURS DE CYBERSÉCURITÉ RÉELS — Équipe SILEX
// ----------------------------------------------------------------------------
// Règle absolue de cette bibliothèque : AUCUN constat inventé.
// Chaque moteur fait une vérification réelle (DNS-over-HTTPS, requête HTTP,
// journaux de transparence des certificats, API HIBP, catalogue PostgreSQL)
// et joint la donnée brute observée dans `preuve`. Quand une vérification est
// impossible depuis une Edge Function (sockets bruts, moteur CVE), le moteur
// le dit honnêtement au lieu de simuler.
//
// Claude n'intervient jamais ici : il rédige la prose en aval, pas la détection.
//
// Invasivité :
//   • passif      → observation seule (DNS, en-têtes, journaux publics)
//   • actif-leger → requêtes HTTP supplémentaires vers la cible
//                   (chemins connus, ports applicatifs) — exige une
//                   autorisation de scan valide (ctx.autoriseActif).
// ============================================================================

export type Severite = "critical" | "high" | "medium" | "low" | "info";
export type Invasivite = "passif" | "actif-leger";
export type CategorieId =
  | "recon"
  | "courriel"
  | "web"
  | "exposition"
  | "actif"
  | "posture"
  | "fuites";

export interface Constat {
  moteur: string;
  source: string;
  severity: Severite;
  title: string;
  raw_description: string;
  affected_target: string;
  cve_ids: string[];
  cwe_ids: string[];
  preuve: Record<string, unknown>;
}

// deno-lint-ignore no-explicit-any
type DB = any;

export interface ContexteScan {
  cible: string;
  hote: string;
  url: string;
  db?: DB;
  supabaseUrl?: string;
  anonKey?: string;
  hibpKey?: string;
  autoriseActif: boolean;
  cache: Map<string, unknown>;
}

export interface MoteurCyber {
  id: string;
  nom: string;
  categorie: CategorieId;
  invasivite: Invasivite;
  besoin: "reseau" | "base" | "cle";
  duree: number;
  description: string;
  executer(ctx: ContexteScan): Promise<Constat[]>;
}

export const CATEGORIES: Array<{ id: CategorieId; nom: string; icone: string }> = [
  { id: "recon", nom: "Reconnaissance DNS", icone: "🛰️" },
  { id: "courriel", nom: "Sécurité du courriel", icone: "✉️" },
  { id: "web", nom: "Surface web", icone: "🌐" },
  { id: "exposition", nom: "Exposition publique", icone: "🔦" },
  { id: "actif", nom: "Sondage actif léger", icone: "⚡" },
  { id: "posture", nom: "Posture interne", icone: "🗄️" },
  { id: "fuites", nom: "Fuites de données", icone: "🌑" },
];

// ════════════════════════════════════════════════════════════════════════════
// OUTILS COMMUNS
// ════════════════════════════════════════════════════════════════════════════

export async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function hostnameOf(cible: string): string {
  try {
    return new URL(cible.includes("://") ? cible : `https://${cible}`).hostname;
  } catch {
    return cible.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function urlOf(cible: string): string {
  return cible.includes("://") ? cible : `https://${cible}`;
}

function estCourriel(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Domaine enregistrable approximatif (gère les suffixes composés fréquents au Québec/Canada). */
function domaineRacine(hote: string): string {
  const p = hote.split(".");
  if (p.length <= 2) return hote;
  const deuxDerniers = p.slice(-2).join(".");
  const composes = ["co.uk", "com.au", "co.nz", "gouv.qc.ca", "gc.ca", "qc.ca", "on.ca", "com.br"];
  for (const c of composes) {
    if (hote.endsWith("." + c)) {
      const reste = hote.slice(0, -(c.length + 1)).split(".");
      return reste[reste.length - 1] + "." + c;
    }
  }
  return deuxDerniers;
}

function c(
  moteur: string,
  source: string,
  severity: Severite,
  title: string,
  raw_description: string,
  cible: string,
  preuve: Record<string, unknown> = {},
  cwe: string[] = [],
): Constat {
  return {
    moteur,
    source,
    severity,
    title,
    raw_description,
    affected_target: cible,
    cve_ids: [],
    cwe_ids: cwe,
    preuve,
  };
}

/** Exécute `fn` sur `items` avec un plafond de concurrence (protège la cible et l'Edge Function). */
async function enParallele<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const ouvriers = new Array(Math.min(limite, items.length || 1)).fill(0).map(async () => {
    while (true) {
      const k = i++;
      if (k >= items.length) return;
      try {
        out[k] = await fn(items[k]);
      } catch {
        out[k] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(ouvriers);
  return out;
}

// ─── DNS-over-HTTPS (Cloudflare) ────────────────────────────────────────────
export interface ReponseDoh {
  answers: string[];
  ad: boolean;
  status: number;
  ok: boolean;
}

export async function doh(nom: string, type: string): Promise<ReponseDoh> {
  try {
    const u = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nom)}&type=${type}`;
    const res = await fetchT(u, { headers: { accept: "application/dns-json" } }, 8000);
    if (!res.ok) return { answers: [], ad: false, status: -1, ok: false };
    const j = await res.json();
    const answers = (j.Answer ?? [])
      .map((a: { data: string }) => String(a.data).replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
    return { answers, ad: !!j.AD, status: j.Status ?? -1, ok: true };
  } catch {
    return { answers: [], ad: false, status: -1, ok: false };
  }
}

/** Récupère (une seule fois par scan) le HTML de la page d'accueil. */
async function pageAccueil(ctx: ContexteScan): Promise<{ html: string; res: Response | null }> {
  const cle = "html:" + ctx.url;
  if (ctx.cache.has(cle)) return ctx.cache.get(cle) as { html: string; res: Response | null };
  let out: { html: string; res: Response | null } = { html: "", res: null };
  try {
    const res = await fetchT(ctx.url, { method: "GET", redirect: "follow" }, 12000);
    const brut = await res.text();
    out = { html: brut.slice(0, 600_000), res };
  } catch {
    out = { html: "", res: null };
  }
  ctx.cache.set(cle, out);
  return out;
}

/** Journaux de transparence des certificats (crt.sh) — mémoïsé. */
async function journauxCT(ctx: ContexteScan): Promise<Array<Record<string, string>>> {
  const racine = domaineRacine(ctx.hote);
  const cle = "ct:" + racine;
  if (ctx.cache.has(cle)) return ctx.cache.get(cle) as Array<Record<string, string>>;
  let out: Array<Record<string, string>> = [];
  try {
    const res = await fetchT(
      `https://crt.sh/?q=${encodeURIComponent("%." + racine)}&output=json`,
      { headers: { accept: "application/json" } },
      20000,
    );
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j)) out = j.slice(0, 3000);
    }
  } catch {
    out = [];
  }
  ctx.cache.set(cle, out);
  return out;
}

function sousDomainesDepuisCT(entrees: Array<Record<string, string>>, racine: string): string[] {
  const set = new Set<string>();
  for (const e of entrees) {
    const noms = String(e.name_value ?? "").split(/\n/);
    for (const n of noms) {
      const nom = n.trim().toLowerCase().replace(/^\*\./, "");
      if (nom.endsWith(racine) && /^[a-z0-9.\-_]+$/.test(nom)) set.add(nom);
    }
  }
  return [...set].sort();
}

function entetesSetCookie(h: Headers): string[] {
  const anyH = h as unknown as { getSetCookie?: () => string[] };
  if (typeof anyH.getSetCookie === "function") {
    try {
      return anyH.getSetCookie();
    } catch { /* poursuit sur le repli */ }
  }
  const brut = h.get("set-cookie");
  return brut ? [brut] : [];
}

/** Masque une valeur sensible : on prouve la détection sans recopier le secret. */
function masquer(v: string): string {
  const s = String(v);
  if (s.length <= 8) return s.slice(0, 2) + "…";
  return s.slice(0, 6) + "…" + s.slice(-2) + ` (${s.length} car.)`;
}

// ════════════════════════════════════════════════════════════════════════════
// CATÉGORIE : RECONNAISSANCE DNS
// ════════════════════════════════════════════════════════════════════════════

const moteurDNS: MoteurCyber = {
  id: "dns",
  nom: "Empreinte DNS",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 8,
  description: "Inventaire réel des enregistrements A/AAAA/NS/MX/TXT/CNAME via DNS-over-HTTPS.",
  async executer(ctx) {
    const h = ctx.hote;
    const out: Constat[] = [];
    const [a, aaaa, ns, mx, cname, soa] = await Promise.all([
      doh(h, "A"), doh(h, "AAAA"), doh(h, "NS"), doh(h, "MX"), doh(h, "CNAME"), doh(h, "SOA"),
    ]);

    if (a.answers.length === 0 && cname.answers.length === 0) {
      out.push(c("dns", "dns-recon", "high", "Domaine non résolu",
        `Aucun enregistrement A ni CNAME pour ${h}. Le domaine ne pointe vers aucun serveur.`,
        ctx.cible, { a: a.answers, cname: cname.answers }, ["CWE-1104"]));
      return out;
    }

    const ipsPrivees = a.answers.filter((ip) =>
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip)
    );
    if (ipsPrivees.length > 0) {
      out.push(c("dns", "dns-recon", "medium", "Adresse IP privée exposée dans le DNS public",
        `Le DNS public de ${h} publie ${ipsPrivees.length} adresse(s) RFC 1918 : ${ipsPrivees.join(", ")}. Cela révèle la topologie du réseau interne.`,
        ctx.cible, { ips: ipsPrivees }, ["CWE-200"]));
    }

    out.push(c("dns", "dns-recon", "info", "Inventaire DNS",
      `${h} : ${a.answers.length} enregistrement(s) A, ${aaaa.answers.length} AAAA, ${ns.answers.length} NS, ${mx.answers.length} MX. ${aaaa.answers.length === 0 ? "Aucune adresse IPv6 publiée." : "IPv6 publiée."}`,
      ctx.cible, {
        a: a.answers.slice(0, 8),
        aaaa: aaaa.answers.slice(0, 4),
        ns: ns.answers.slice(0, 8),
        mx: mx.answers.slice(0, 8),
        soa: soa.answers.slice(0, 1),
      }));

    if (ns.answers.length === 1) {
      out.push(c("dns", "dns-recon", "low", "Serveur de noms unique",
        `${h} ne publie qu'un seul serveur de noms (${ns.answers[0]}). Aucune redondance DNS en cas de panne.`,
        ctx.cible, { ns: ns.answers }, ["CWE-1104"]));
    }
    return out;
  },
};

const moteurDNSSEC: MoteurCyber = {
  id: "dnssec",
  nom: "DNSSEC",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 5,
  description: "Vérifie la présence d'enregistrements DS et la validation DNSSEC du résolveur.",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    const [ds, a] = await Promise.all([doh(racine, "DS"), doh(ctx.hote, "A")]);
    if (ds.answers.length > 0) {
      return [c("dnssec", "dns-recon", "info", "DNSSEC actif",
        `${racine} publie ${ds.answers.length} enregistrement(s) DS et la réponse est validée (AD=${a.ad}). La chaîne DNS est signée.`,
        ctx.cible, { ds: ds.answers.slice(0, 3), ad: a.ad })];
    }
    return [c("dnssec", "dns-recon", "low", "DNSSEC absent",
      `Aucun enregistrement DS pour ${racine} : la zone DNS n'est pas signée. Un empoisonnement de cache DNS ne serait pas détecté par les résolveurs validants.`,
      ctx.cible, { ds: [], ad: a.ad }, ["CWE-350"])];
  },
};

const moteurCAA: MoteurCyber = {
  id: "caa",
  nom: "Enregistrements CAA",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 4,
  description: "Vérifie quelles autorités de certification peuvent émettre pour le domaine.",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    const caa = await doh(racine, "CAA");
    if (caa.answers.length === 0) {
      return [c("caa", "dns-recon", "low", "Aucun enregistrement CAA",
        `${racine} ne restreint aucune autorité de certification. N'importe quelle AC publique peut émettre un certificat pour ce domaine.`,
        ctx.cible, { caa: [] }, ["CWE-295"])];
    }
    return [c("caa", "dns-recon", "info", "CAA configuré",
      `${racine} restreint l'émission de certificats : ${caa.answers.slice(0, 4).join(" | ")}`,
      ctx.cible, { caa: caa.answers.slice(0, 6) })];
  },
};

const moteurDNSInverse: MoteurCyber = {
  id: "dns_inverse",
  nom: "DNS inverse et hébergeur",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 6,
  description: "Résolution PTR des adresses IP pour identifier l'hébergeur réel.",
  async executer(ctx) {
    const a = await doh(ctx.hote, "A");
    const ips = a.answers.filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x)).slice(0, 4);
    if (ips.length === 0) {
      return [c("dns_inverse", "dns-recon", "info", "DNS inverse non applicable",
        `Aucune adresse IPv4 directe pour ${ctx.hote} (probablement derrière un CNAME ou un CDN).`,
        ctx.cible, {})];
    }
    const ptrs = await enParallele(ips, 4, async (ip) => {
      const rev = ip.split(".").reverse().join(".") + ".in-addr.arpa";
      const r = await doh(rev, "PTR");
      return { ip, ptr: r.answers[0] ?? null };
    });
    const connus = ptrs.filter((p) => p?.ptr).map((p) => `${p.ip} → ${p.ptr}`);
    return [c("dns_inverse", "dns-recon", "info", "Hébergement identifié",
      connus.length > 0
        ? `Résolution inverse : ${connus.join(" ; ")}.`
        : `Les ${ips.length} adresse(s) de ${ctx.hote} n'ont pas de PTR publié (fréquent derrière un CDN).`,
      ctx.cible, { ptr: ptrs })];
  },
};

const moteurSousDomaines: MoteurCyber = {
  id: "sous_domaines",
  nom: "Énumération de sous-domaines",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 30,
  description: "Sous-domaines réels issus des journaux de transparence des certificats, puis résolus par DNS.",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    const entrees = await journauxCT(ctx);
    if (entrees.length === 0) {
      return [c("sous_domaines", "ct-logs", "info", "Journaux de transparence indisponibles",
        `crt.sh n'a retourné aucune donnée pour ${racine} au moment du scan. Aucune supposition faite — relancer plus tard.`,
        ctx.cible, { source: "crt.sh", entrees: 0 })];
    }
    const noms = sousDomainesDepuisCT(entrees, racine);
    ctx.cache.set("sousdomaines:" + racine, noms);

    const aTester = noms.slice(0, 60);
    const resolus = await enParallele(aTester, 10, async (n) => {
      const r = await doh(n, "A");
      return { nom: n, actif: r.answers.length > 0, ips: r.answers.slice(0, 2) };
    });
    const actifs = resolus.filter((r) => r?.actif);

    const out: Constat[] = [];
    out.push(c("sous_domaines", "ct-logs", "info", "Surface de sous-domaines",
      `${noms.length} sous-domaine(s) distinct(s) trouvé(s) dans les journaux de transparence pour ${racine}; ${actifs.length} sur ${aTester.length} testés résolvent encore. Chaque hôte vivant élargit la surface d'attaque.`,
      ctx.cible, { total: noms.length, testes: aTester.length, actifs: actifs.slice(0, 25).map((x) => x.nom) }));

    const sensibles = actifs.filter((r) =>
      /(^|\.)(dev|test|staging|stage|preprod|uat|recette|admin|internal|interne|vpn|db|sql|backup|old|legacy|jenkins|gitlab|grafana|kibana)\./.test(r.nom + ".")
    );
    if (sensibles.length > 0) {
      out.push(c("sous_domaines", "ct-logs", "medium", "Sous-domaines hors production exposés",
        `${sensibles.length} sous-domaine(s) à vocation interne ou hors production résolvent publiquement : ${sensibles.slice(0, 8).map((s) => s.nom).join(", ")}. Ces environnements sont souvent moins durcis que la production.`,
        ctx.cible, { hotes: sensibles.slice(0, 12).map((s) => s.nom) }, ["CWE-200"]));
    }
    return out;
  },
};

const moteurCertificats: MoteurCyber = {
  id: "certificats",
  nom: "Certificats TLS émis",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 15,
  description: "Analyse des certificats réellement émis (autorités, expiration, jokers) via crt.sh.",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    const entrees = await journauxCT(ctx);
    if (entrees.length === 0) {
      return [c("certificats", "ct-logs", "info", "Historique de certificats indisponible",
        `Aucune donnée crt.sh pour ${racine} au moment du scan.`, ctx.cible, {})];
    }
    const out: Constat[] = [];
    const emetteurs = new Map<string, number>();
    let jokers = 0;
    let dernierNotAfter: number | null = null;

    for (const e of entrees) {
      const iss = String(e.issuer_name ?? "").match(/O=([^,]+)/)?.[1]?.trim() ?? "inconnu";
      emetteurs.set(iss, (emetteurs.get(iss) ?? 0) + 1);
      if (String(e.name_value ?? "").includes("*.")) jokers++;
      const na = Date.parse(String(e.not_after ?? ""));
      if (!Number.isNaN(na)) {
        const couvre = String(e.name_value ?? "").split("\n").some((n) =>
          n.trim().toLowerCase() === ctx.hote || n.trim().toLowerCase() === "*." + racine
        );
        if (couvre && (dernierNotAfter === null || na > dernierNotAfter)) dernierNotAfter = na;
      }
    }

    const listeEmetteurs = [...emetteurs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
    out.push(c("certificats", "ct-logs", "info", "Historique des certificats",
      `${entrees.length} certificat(s) enregistré(s) pour ${racine}. Autorités principales : ${listeEmetteurs.map(([n, k]) => `${n} (${k})`).join(", ")}. ${jokers} certificat(s) joker.`,
      ctx.cible, { total: entrees.length, emetteurs: listeEmetteurs, jokers }));

    if (dernierNotAfter !== null) {
      const jours = Math.round((dernierNotAfter - Date.now()) / 86_400_000);
      if (jours < 0) {
        out.push(c("certificats", "ct-logs", "high", "Aucun certificat valide connu",
          `Le certificat le plus récent couvrant ${ctx.hote} dans les journaux publics a expiré il y a ${-jours} jour(s).`,
          ctx.cible, { expire_le: new Date(dernierNotAfter).toISOString() }, ["CWE-324"]));
      } else if (jours < 21) {
        out.push(c("certificats", "ct-logs", "medium", "Certificat proche de l'expiration",
          `Le certificat connu le plus récent pour ${ctx.hote} expire dans ${jours} jour(s). Sans renouvellement, le site deviendra inaccessible en HTTPS.`,
          ctx.cible, { expire_le: new Date(dernierNotAfter).toISOString() }, ["CWE-324"]));
      }
    }

    if (jokers > 0) {
      out.push(c("certificats", "ct-logs", "low", "Certificats joker en usage",
        `${jokers} certificat(s) joker (*.${racine}) ont été émis. Une clé privée compromise couvre alors tous les sous-domaines d'un coup.`,
        ctx.cible, { jokers }, ["CWE-295"]));
    }
    return out;
  },
};

const moteurTakeover: MoteurCyber = {
  id: "takeover",
  nom: "Détournement de sous-domaine",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 25,
  description: "Détecte les CNAME pendants vers des services SaaS libérés (subdomain takeover).",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    let noms = ctx.cache.get("sousdomaines:" + racine) as string[] | undefined;
    if (!noms) {
      const entrees = await journauxCT(ctx);
      noms = sousDomainesDepuisCT(entrees, racine);
      ctx.cache.set("sousdomaines:" + racine, noms);
    }
    if (noms.length === 0) {
      return [c("takeover", "dns-recon", "info", "Détournement non évaluable",
        `Aucun sous-domaine connu pour ${racine} : rien à vérifier.`, ctx.cible, {})];
    }

    const saas = [
      { motif: /\.github\.io$/, service: "GitHub Pages" },
      { motif: /\.herokuapp\.com$/, service: "Heroku" },
      { motif: /\.s3[.-][a-z0-9-]*\.amazonaws\.com$/, service: "Amazon S3" },
      { motif: /\.cloudfront\.net$/, service: "CloudFront" },
      { motif: /\.azurewebsites\.net$/, service: "Azure App Service" },
      { motif: /\.blob\.core\.windows\.net$/, service: "Azure Blob" },
      { motif: /\.netlify\.app$/, service: "Netlify" },
      { motif: /\.vercel\.app$/, service: "Vercel" },
      { motif: /\.surge\.sh$/, service: "Surge" },
      { motif: /\.pantheonsite\.io$/, service: "Pantheon" },
      { motif: /\.fastly\.net$/, service: "Fastly" },
      { motif: /\.shopify\.com$/, service: "Shopify" },
      { motif: /\.myshopify\.com$/, service: "Shopify" },
      { motif: /\.wpengine\.com$/, service: "WP Engine" },
      { motif: /\.zendesk\.com$/, service: "Zendesk" },
      { motif: /\.statuspage\.io$/, service: "Statuspage" },
      { motif: /\.readthedocs\.io$/, service: "Read the Docs" },
      { motif: /\.ghost\.io$/, service: "Ghost" },
      { motif: /\.bitbucket\.io$/, service: "Bitbucket" },
    ];

    const aTester = noms.slice(0, 60);
    const resultats = await enParallele(aTester, 10, async (n) => {
      const cn = await doh(n, "CNAME");
      if (cn.answers.length === 0) return null;
      const cible = cn.answers[0].replace(/\.$/, "").toLowerCase();
      const match = saas.find((s) => s.motif.test(cible));
      if (!match) return null;
      const a = await doh(n, "A");
      // NXDOMAIN (status 3) ou absence totale de A malgré un CNAME SaaS = pointeur pendant.
      const pendant = a.status === 3 || a.answers.length === 0;
      return pendant ? { nom: n, cible, service: match.service, statutDns: a.status } : null;
    });

    const pendants = resultats.filter(Boolean) as Array<{ nom: string; cible: string; service: string; statutDns: number }>;
    if (pendants.length === 0) {
      return [c("takeover", "dns-recon", "info", "Aucun CNAME pendant détecté",
        `Les ${aTester.length} sous-domaine(s) testés ne présentent pas de CNAME orphelin vers un service SaaS.`,
        ctx.cible, { testes: aTester.length })];
    }
    return pendants.map((p) =>
      c("takeover", "dns-recon", "high", "CNAME pendant — détournement possible",
        `${p.nom} pointe (CNAME) vers ${p.cible} (${p.service}) mais ne résout plus. Si la ressource est libre chez ${p.service}, un tiers peut la réclamer et servir du contenu sous votre domaine.`,
        ctx.cible, { sous_domaine: p.nom, cname: p.cible, service: p.service, statut_dns: p.statutDns }, ["CWE-350"])
    );
  },
};

const moteurTyposquat: MoteurCyber = {
  id: "typosquat",
  nom: "Domaines jumeaux",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 20,
  description: "Génère des variantes typographiques du domaine et vérifie lesquelles sont enregistrées.",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    const point = racine.indexOf(".");
    if (point < 2) {
      return [c("typosquat", "dns-recon", "info", "Analyse de domaines jumeaux impossible",
        `Le domaine ${racine} est trop court pour générer des variantes fiables.`, ctx.cible, {})];
    }
    const base = racine.slice(0, point);
    const tld = racine.slice(point);
    const variantes = new Set<string>();

    for (let i = 0; i < base.length - 1; i++) {
      variantes.add(base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2) + tld); // transposition
    }
    for (let i = 0; i < base.length; i++) {
      variantes.add(base.slice(0, i) + base.slice(i + 1) + tld); // omission
      variantes.add(base.slice(0, i) + base[i] + base[i] + base.slice(i) + tld); // doublement
    }
    const homoglyphes: Array<[RegExp, string]> = [
      [/o/g, "0"], [/l/g, "1"], [/i/g, "1"], [/e/g, "3"], [/rn/g, "m"], [/m/g, "rn"], [/a/g, "@"],
    ];
    for (const [de, vers] of homoglyphes) {
      const v = base.replace(de, vers);
      if (v !== base && /^[a-z0-9-]+$/.test(v)) variantes.add(v + tld);
    }
    for (const t of [".com", ".net", ".org", ".ca", ".co", ".info", ".online", ".site"]) {
      if (t !== tld) variantes.add(base + t);
    }
    variantes.delete(racine);

    const liste = [...variantes].filter((v) => /^[a-z0-9.-]+$/.test(v)).slice(0, 40);
    const resultats = await enParallele(liste, 10, async (v) => {
      const r = await doh(v, "A");
      if (r.answers.length === 0) return null;
      const mx = await doh(v, "MX");
      return { domaine: v, ips: r.answers.slice(0, 2), mx: mx.answers.length > 0 };
    });
    const trouves = resultats.filter(Boolean) as Array<{ domaine: string; ips: string[]; mx: boolean }>;

    if (trouves.length === 0) {
      return [c("typosquat", "dns-recon", "info", "Aucun domaine jumeau actif",
        `Aucune des ${liste.length} variantes typographiques de ${racine} testées ne résout.`,
        ctx.cible, { testees: liste.length })];
    }
    const avecCourriel = trouves.filter((t) => t.mx);
    const out: Constat[] = [c("typosquat", "dns-recon", "medium", "Domaines jumeaux enregistrés",
      `${trouves.length} variante(s) de ${racine} sur ${liste.length} testées sont enregistrées et actives : ${trouves.slice(0, 8).map((t) => t.domaine).join(", ")}. Ces domaines servent couramment à l'hameçonnage ciblé.`,
      ctx.cible, { trouves: trouves.slice(0, 15) }, ["CWE-1021"])];

    if (avecCourriel.length > 0) {
      out.push(c("typosquat", "dns-recon", "high", "Domaine jumeau capable d'envoyer du courriel",
        `${avecCourriel.length} domaine(s) jumeau(x) publient des serveurs MX : ${avecCourriel.slice(0, 6).map((t) => t.domaine).join(", ")}. Ils peuvent recevoir et émettre des courriels imitant votre organisation.`,
        ctx.cible, { domaines: avecCourriel.slice(0, 10).map((t) => t.domaine) }, ["CWE-290"]));
    }
    return out;
  },
};

const moteurReputation: MoteurCyber = {
  id: "reputation",
  nom: "Listes de blocage",
  categorie: "recon",
  invasivite: "passif",
  besoin: "reseau",
  duree: 8,
  description: "Interroge les listes de réputation Spamhaus (DBL domaine, ZEN adresse IP).",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    const out: Constat[] = [];

    const dbl = await doh(`${racine}.dbl.spamhaus.org`, "A");
    const bloqueParResolveur = dbl.answers.some((r) => r.startsWith("127.255.255."));
    if (bloqueParResolveur) {
      out.push(c("reputation", "blocklist", "info", "Réputation non concluante",
        `Spamhaus refuse les requêtes provenant du résolveur public utilisé (réponse 127.255.255.x). Vérification non concluante — aucune conclusion tirée.`,
        ctx.cible, { dbl: dbl.answers }));
    } else if (dbl.answers.some((r) => /^127\.0\.1\./.test(r))) {
      out.push(c("reputation", "blocklist", "high", "Domaine listé chez Spamhaus DBL",
        `${racine} figure sur la liste Spamhaus DBL (${dbl.answers.join(", ")}). Les passerelles de courriel et certains navigateurs bloqueront le domaine.`,
        ctx.cible, { dbl: dbl.answers }, ["CWE-350"]));
    } else {
      out.push(c("reputation", "blocklist", "info", "Domaine non listé (Spamhaus DBL)",
        `${racine} n'apparaît pas sur la liste Spamhaus DBL.`, ctx.cible, { dbl: dbl.answers }));
    }

    const a = await doh(ctx.hote, "A");
    const ip = a.answers.find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x));
    if (ip) {
      const rev = ip.split(".").reverse().join(".");
      const zen = await doh(`${rev}.zen.spamhaus.org`, "A");
      if (zen.answers.some((r) => /^127\.0\.0\.\d+$/.test(r))) {
        out.push(c("reputation", "blocklist", "high", "Adresse IP listée chez Spamhaus ZEN",
          `L'adresse ${ip} de ${ctx.hote} est listée (${zen.answers.join(", ")}). Les courriels envoyés depuis cette IP seront rejetés.`,
          ctx.cible, { ip, zen: zen.answers }, ["CWE-350"]));
      }
    }
    return out;
  },
};

const moteurArchives: MoteurCyber = {
  id: "archives",
  nom: "Archives web",
  categorie: "exposition",
  invasivite: "passif",
  besoin: "reseau",
  duree: 18,
  description: "Interroge la Wayback Machine pour repérer des chemins sensibles archivés publiquement.",
  async executer(ctx) {
    const racine = domaineRacine(ctx.hote);
    let urls: string[] = [];
    try {
      const res = await fetchT(
        `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(racine)}%2F*&output=json&fl=original&collapse=urlkey&limit=800`,
        { headers: { accept: "application/json" } },
        20000,
      );
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j) && j.length > 1) urls = j.slice(1).map((r: string[]) => r[0]);
      }
    } catch { /* archive.org indisponible → dégradation honnête */ }

    if (urls.length === 0) {
      return [c("archives", "wayback", "info", "Aucune archive exploitable",
        `La Wayback Machine n'a retourné aucune URL indexée pour ${racine} (ou le service était indisponible).`,
        ctx.cible, { source: "web.archive.org" })];
    }

    const motifSensible = /(\.env|\.git|\.sql|\.bak|\.zip|\.tar|\.gz|backup|dump|wp-config|config\.json|phpinfo|adminer|\.log|id_rsa|credentials|secret|api[_-]?key|token=)/i;
    const sensibles = [...new Set(urls.filter((u) => motifSensible.test(u)))].slice(0, 20);

    const out: Constat[] = [c("archives", "wayback", "info", "Empreinte historique publique",
      `${urls.length} URL(s) de ${racine} sont archivées publiquement dans la Wayback Machine. Le contenu retiré du site reste consultable.`,
      ctx.cible, { total: urls.length })];

    if (sensibles.length > 0) {
      out.push(c("archives", "wayback", "medium", "Chemins sensibles archivés publiquement",
        `${sensibles.length} URL(s) archivée(s) correspondent à des fichiers sensibles (sauvegardes, configuration, secrets) : ${sensibles.slice(0, 5).join(", ")}. Même supprimées du site, elles restent lisibles dans l'archive.`,
        ctx.cible, { urls: sensibles }, ["CWE-530"]));
    }
    return out;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CATÉGORIE : SÉCURITÉ DU COURRIEL
// ════════════════════════════════════════════════════════════════════════════

const moteurCourrielAuth: MoteurCyber = {
  id: "courriel_auth",
  nom: "SPF · DKIM · DMARC",
  categorie: "courriel",
  invasivite: "passif",
  besoin: "reseau",
  duree: 12,
  description: "Vérifie l'authentification du courriel : SPF (et ses limites), sélecteurs DKIM, politique DMARC.",
  async executer(ctx) {
    const h = domaineRacine(ctx.hote);
    const out: Constat[] = [];

    // ─ SPF
    const txt = await doh(h, "TXT");
    const spf = txt.answers.find((r) => r.toLowerCase().includes("v=spf1"));
    if (!spf) {
      out.push(c("courriel_auth", "dns-recon", "medium", "SPF absent",
        `Aucun enregistrement SPF pour ${h}. N'importe quel serveur peut envoyer du courriel en se faisant passer pour ce domaine.`,
        ctx.cible, { txt: txt.answers.slice(0, 5) }, ["CWE-290"]));
    } else {
      const lookups = (spf.match(/(include:|a:|mx:|ptr:|exists:|redirect=)/gi) ?? []).length;
      const all = spf.match(/([-~?+])all/)?.[1] ?? null;
      if (all === "+" || all === "?") {
        out.push(c("courriel_auth", "dns-recon", "medium", "SPF permissif",
          `SPF de ${h} se termine par « ${all}all » : aucune usurpation n'est rejetée. Valeur : ${spf.slice(0, 160)}`,
          ctx.cible, { spf }, ["CWE-290"]));
      } else if (all === "~") {
        out.push(c("courriel_auth", "dns-recon", "low", "SPF en échec doux (~all)",
          `SPF de ${h} utilise « ~all » (softfail) : les courriels usurpés sont marqués mais pas rejetés.`,
          ctx.cible, { spf }, ["CWE-290"]));
      } else {
        out.push(c("courriel_auth", "dns-recon", "info", "SPF strict",
          `SPF de ${h} se termine par « -all » : les expéditeurs non autorisés sont rejetés. ${lookups} mécanisme(s) de recherche DNS.`,
          ctx.cible, { spf, lookups }));
      }
      if (lookups > 10) {
        out.push(c("courriel_auth", "dns-recon", "medium", "SPF au-delà de la limite de 10 recherches DNS",
          `L'enregistrement SPF de ${h} déclenche ${lookups} recherches DNS (limite RFC 7208 : 10). Les serveurs récepteurs traiteront le SPF comme « permerror » et l'ignoreront.`,
          ctx.cible, { spf, lookups }, ["CWE-290"]));
      }
    }

    // ─ DMARC
    const dmarcTxt = await doh(`_dmarc.${h}`, "TXT");
    const dmarc = dmarcTxt.answers.find((r) => r.toLowerCase().includes("v=dmarc1"));
    if (!dmarc) {
      out.push(c("courriel_auth", "dns-recon", "medium", "DMARC absent",
        `Aucune politique DMARC pour ${h}. Sans DMARC, SPF et DKIM ne sont pas appliqués de bout en bout et aucun rapport d'usurpation n'est reçu.`,
        ctx.cible, {}, ["CWE-290"]));
    } else {
      const p = dmarc.match(/\bp\s*=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? "none";
      const rua = /rua\s*=/i.test(dmarc);
      const pct = dmarc.match(/\bpct\s*=\s*(\d+)/i)?.[1];
      if (p === "none") {
        out.push(c("courriel_auth", "dns-recon", "low", "DMARC en mode surveillance (p=none)",
          `DMARC présent sur ${h} mais p=none : aucune usurpation n'est bloquée. Valeur : ${dmarc.slice(0, 160)}`,
          ctx.cible, { dmarc, rua }, ["CWE-290"]));
      } else {
        out.push(c("courriel_auth", "dns-recon", "info", `DMARC appliqué (p=${p})`,
          `DMARC actif sur ${h} avec p=${p}${pct ? `, pct=${pct}` : ""}${rua ? ", rapports agrégés activés" : ", sans adresse de rapport (rua)"}.`,
          ctx.cible, { dmarc }));
      }
      if (!rua) {
        out.push(c("courriel_auth", "dns-recon", "low", "DMARC sans rapports agrégés",
          `La politique DMARC de ${h} ne définit pas de « rua= » : aucune visibilité sur les tentatives d'usurpation.`,
          ctx.cible, { dmarc }));
      }
    }

    // ─ DKIM (sélecteurs répandus)
    const selecteurs = ["default", "google", "selector1", "selector2", "k1", "mail", "dkim", "s1", "s2", "zoho", "mandrill", "sendgrid", "resend"];
    const trouves = await enParallele(selecteurs, 7, async (s) => {
      const r = await doh(`${s}._domainkey.${h}`, "TXT");
      return r.answers.some((x) => /v=dkim1|p=/i.test(x)) ? s : null;
    });
    const dkim = trouves.filter(Boolean) as string[];
    if (dkim.length === 0) {
      out.push(c("courriel_auth", "dns-recon", "low", "Aucun sélecteur DKIM répandu détecté",
        `Aucun des ${selecteurs.length} sélecteurs DKIM courants ne répond pour ${h}. Un sélecteur personnalisé peut exister — vérification non exhaustive par nature.`,
        ctx.cible, { selecteurs_testes: selecteurs }, ["CWE-290"]));
    } else {
      out.push(c("courriel_auth", "dns-recon", "info", "DKIM configuré",
        `Sélecteur(s) DKIM actif(s) pour ${h} : ${dkim.join(", ")}.`, ctx.cible, { selecteurs: dkim }));
    }
    return out;
  },
};

const moteurCourrielTransport: MoteurCyber = {
  id: "courriel_transport",
  nom: "MTA-STS · TLS-RPT · BIMI",
  categorie: "courriel",
  invasivite: "passif",
  besoin: "reseau",
  duree: 10,
  description: "Vérifie le chiffrement imposé du transport courriel et la déclaration de marque.",
  async executer(ctx) {
    const h = domaineRacine(ctx.hote);
    const out: Constat[] = [];

    const mtaTxt = await doh(`_mta-sts.${h}`, "TXT");
    const aMtaSts = mtaTxt.answers.some((r) => /v=STSv1/i.test(r));
    if (aMtaSts) {
      let politique = "";
      try {
        const res = await fetchT(`https://mta-sts.${h}/.well-known/mta-sts.txt`, { method: "GET" }, 8000);
        if (res.ok) politique = (await res.text()).slice(0, 400);
      } catch { /* politique inaccessible */ }
      const mode = politique.match(/mode\s*:\s*(\w+)/i)?.[1]?.toLowerCase();
      if (mode === "enforce") {
        out.push(c("courriel_transport", "dns-recon", "info", "MTA-STS appliqué",
          `${h} publie une politique MTA-STS en mode enforce : le TLS est obligatoire pour la livraison du courriel.`,
          ctx.cible, { politique: politique.slice(0, 200) }));
      } else {
        out.push(c("courriel_transport", "dns-recon", "low", "MTA-STS non contraignant",
          `${h} publie MTA-STS mais en mode « ${mode ?? "indéterminé"} » : le déclassement TLS reste possible.`,
          ctx.cible, { politique: politique.slice(0, 200) }, ["CWE-319"]));
      }
    } else {
      out.push(c("courriel_transport", "dns-recon", "low", "MTA-STS absent",
        `Aucune politique MTA-STS pour ${h}. Une attaque active peut forcer la livraison du courriel en clair.`,
        ctx.cible, {}, ["CWE-319"]));
    }

    const tlsrpt = await doh(`_smtp._tls.${h}`, "TXT");
    if (!tlsrpt.answers.some((r) => /v=TLSRPTv1/i.test(r))) {
      out.push(c("courriel_transport", "dns-recon", "info", "TLS-RPT absent",
        `Aucun enregistrement TLS-RPT pour ${h} : aucun rapport d'échec de chiffrement du transport n'est reçu.`,
        ctx.cible, {}));
    } else {
      out.push(c("courriel_transport", "dns-recon", "info", "TLS-RPT actif",
        `${h} reçoit des rapports d'échec TLS du transport courriel.`, ctx.cible,
        { tlsrpt: tlsrpt.answers.slice(0, 2) }));
    }

    const bimi = await doh(`default._bimi.${h}`, "TXT");
    if (bimi.answers.some((r) => /v=BIMI1/i.test(r))) {
      out.push(c("courriel_transport", "dns-recon", "info", "BIMI publié",
        `${h} publie un enregistrement BIMI (logo de marque affiché dans les clients compatibles).`,
        ctx.cible, { bimi: bimi.answers.slice(0, 1) }));
    }
    return out;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CATÉGORIE : SURFACE WEB
// ════════════════════════════════════════════════════════════════════════════

const moteurEntetes: MoteurCyber = {
  id: "entetes",
  nom: "En-têtes de sécurité HTTP",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 10,
  description: "Lit les en-têtes réels renvoyés par la cible et analyse la qualité de chaque politique.",
  async executer(ctx) {
    const out: Constat[] = [];
    let res: Response;
    try {
      res = await fetchT(ctx.url, { method: "GET", redirect: "manual" }, 12000);
    } catch (e) {
      return [c("entetes", "http-probe", "info", "Cible HTTP injoignable",
        `Impossible de charger ${ctx.url} : ${e instanceof Error ? e.message : String(e)}`,
        ctx.cible, {})];
    }
    const h = res.headers;
    const presents: Record<string, string> = {};
    for (const k of ["content-security-policy", "strict-transport-security", "x-frame-options",
      "x-content-type-options", "referrer-policy", "permissions-policy",
      "cross-origin-opener-policy", "cross-origin-resource-policy", "server", "x-powered-by"]) {
      const v = h.get(k);
      if (v) presents[k] = v.slice(0, 300);
    }

    const csp = h.get("content-security-policy") ?? "";
    if (!csp) {
      out.push(c("entetes", "http-probe", "medium", "Content-Security-Policy manquant",
        `Aucun en-tête CSP sur ${ctx.url}. Rien ne limite l'exécution de scripts injectés : le risque XSS n'est pas atténué.`,
        ctx.cible, presents, ["CWE-693"]));
    } else {
      const faiblesses: string[] = [];
      if (/unsafe-inline/i.test(csp)) faiblesses.push("'unsafe-inline'");
      if (/unsafe-eval/i.test(csp)) faiblesses.push("'unsafe-eval'");
      if (/(script-src|default-src)[^;]*\*/i.test(csp)) faiblesses.push("joker * sur les sources de script");
      if (!/frame-ancestors/i.test(csp)) faiblesses.push("frame-ancestors absent");
      if (faiblesses.length > 0) {
        out.push(c("entetes", "http-probe", "low", "CSP présent mais affaibli",
          `La CSP de ${ctx.url} contient : ${faiblesses.join(", ")}. Ces directives réduisent fortement la protection contre le XSS.`,
          ctx.cible, { csp: csp.slice(0, 400), faiblesses }, ["CWE-693"]));
      } else {
        out.push(c("entetes", "http-probe", "info", "CSP stricte",
          `CSP présente sans directive permissive détectée sur ${ctx.url}.`, ctx.cible, { csp: csp.slice(0, 300) }));
      }
    }

    const hsts = h.get("strict-transport-security");
    if (!hsts) {
      out.push(c("entetes", "http-probe", "medium", "HSTS manquant",
        `Strict-Transport-Security absent sur ${ctx.url}. Un intercepteur réseau peut forcer une connexion HTTP en clair.`,
        ctx.cible, presents, ["CWE-319"]));
    } else {
      const maxAge = parseInt(hsts.match(/max-age\s*=\s*(\d+)/i)?.[1] ?? "0", 10);
      if (maxAge < 15_552_000) {
        out.push(c("entetes", "http-probe", "low", "HSTS de courte durée",
          `HSTS présent mais max-age=${maxAge}s (moins de 6 mois recommandés par la liste de préchargement).`,
          ctx.cible, { hsts }, ["CWE-319"]));
      }
      if (!/includeSubDomains/i.test(hsts)) {
        out.push(c("entetes", "http-probe", "low", "HSTS sans includeSubDomains",
          `HSTS de ${ctx.hote} ne couvre pas les sous-domaines : ceux-ci restent joignables en HTTP.`,
          ctx.cible, { hsts }, ["CWE-319"]));
      }
    }

    if (!h.get("x-frame-options") && !/frame-ancestors/i.test(csp)) {
      out.push(c("entetes", "http-probe", "low", "Protection clickjacking manquante",
        `Ni X-Frame-Options ni CSP frame-ancestors sur ${ctx.url} : la page peut être encadrée par un site tiers.`,
        ctx.cible, presents, ["CWE-1021"]));
    }
    if (!h.get("x-content-type-options")) {
      out.push(c("entetes", "http-probe", "low", "X-Content-Type-Options manquant",
        `Le navigateur peut deviner le type MIME des réponses de ${ctx.url} (MIME sniffing).`,
        ctx.cible, presents, ["CWE-693"]));
    }
    if (!h.get("referrer-policy")) {
      out.push(c("entetes", "http-probe", "low", "Referrer-Policy manquant",
        `Sans Referrer-Policy, les URL internes de ${ctx.hote} fuient vers les sites tiers via l'en-tête Referer.`,
        ctx.cible, presents, ["CWE-200"]));
    }
    if (!h.get("permissions-policy")) {
      out.push(c("entetes", "http-probe", "info", "Permissions-Policy manquant",
        `Aucune restriction déclarée sur caméra, micro et géolocalisation pour ${ctx.hote}.`,
        ctx.cible, presents));
    }

    const server = h.get("server");
    if (server && /\d/.test(server)) {
      out.push(c("entetes", "http-probe", "low", "Version serveur exposée",
        `L'en-tête Server divulgue « ${server} » : un attaquant cible directement les CVE de cette version.`,
        ctx.cible, { server }, ["CWE-200"]));
    }
    const xpb = h.get("x-powered-by");
    if (xpb) {
      out.push(c("entetes", "http-probe", "low", "En-tête X-Powered-By exposé",
        `Technologie divulguée par ${ctx.hote} : « ${xpb} ».`, ctx.cible, { "x-powered-by": xpb }, ["CWE-200"]));
    }
    return out;
  },
};

const moteurTLS: MoteurCyber = {
  id: "tls",
  nom: "TLS et redirection HTTPS",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 12,
  description: "Vrai handshake TLS, vérification de la redirection HTTP→HTTPS et du préchargement HSTS.",
  async executer(ctx) {
    const out: Constat[] = [];
    try {
      await fetchT(`https://${ctx.hote}`, { method: "HEAD" }, 10000);
      out.push(c("tls", "tls-probe", "info", "HTTPS joignable",
        `Handshake TLS réussi avec ${ctx.hote}.`, ctx.cible, { hote: ctx.hote }));
    } catch (e) {
      out.push(c("tls", "tls-probe", "high", "HTTPS non joignable",
        `Échec de la connexion HTTPS à ${ctx.hote} : ${e instanceof Error ? e.message : String(e)}. Certificat invalide, expiré ou service hors ligne.`,
        ctx.cible, { erreur: String(e).slice(0, 200) }, ["CWE-319"]));
      return out;
    }

    try {
      const r = await fetchT(`http://${ctx.hote}`, { method: "HEAD", redirect: "manual" }, 8000);
      const loc = r.headers.get("location") ?? "";
      if (r.status >= 300 && r.status < 400 && loc.startsWith("https://")) {
        out.push(c("tls", "tls-probe", "info", "Redirection HTTP→HTTPS active",
          `${ctx.hote} force la redirection vers HTTPS (${r.status} → ${loc.slice(0, 120)}).`,
          ctx.cible, { statut: r.status, location: loc.slice(0, 200) }));
      } else {
        out.push(c("tls", "tls-probe", "medium", "Pas de redirection HTTPS forcée",
          `http://${ctx.hote} répond ${r.status} sans rediriger vers HTTPS : le trafic peut rester en clair.`,
          ctx.cible, { statut: r.status, location: loc.slice(0, 200) }, ["CWE-319"]));
      }
    } catch {
      out.push(c("tls", "tls-probe", "info", "Port HTTP (80) fermé",
        `Aucune écoute HTTP en clair sur ${ctx.hote} — bonne pratique.`, ctx.cible, {}));
    }

    try {
      const r = await fetchT(
        `https://hstspreload.org/api/v2/status?domain=${encodeURIComponent(domaineRacine(ctx.hote))}`,
        { headers: { accept: "application/json" } }, 8000,
      );
      if (r.ok) {
        const j = await r.json();
        const statut = String(j.status ?? "unknown");
        if (statut === "preloaded") {
          out.push(c("tls", "tls-probe", "info", "Domaine préchargé HSTS",
            `${domaineRacine(ctx.hote)} figure dans la liste de préchargement HSTS des navigateurs.`,
            ctx.cible, { statut }));
        } else {
          out.push(c("tls", "tls-probe", "info", "Domaine non préchargé HSTS",
            `${domaineRacine(ctx.hote)} n'est pas dans la liste de préchargement HSTS (statut : ${statut}). La toute première visite reste vulnérable au déclassement.`,
            ctx.cible, { statut }));
        }
      }
    } catch { /* hstspreload.org indisponible → on ne conclut rien */ }
    return out;
  },
};

const moteurCORS: MoteurCyber = {
  id: "cors",
  nom: "Politique CORS",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 8,
  description: "Envoie une origine piégée et observe si le serveur la reflète.",
  async executer(ctx) {
    const origineSonde = "https://silex-cors-probe.example";
    let res: Response;
    try {
      res = await fetchT(ctx.url, { method: "GET", headers: { Origin: origineSonde } }, 10000);
    } catch {
      return [c("cors", "cors-probe", "info", "CORS non testable",
        `Cible ${ctx.url} injoignable pour le test CORS.`, ctx.cible, {})];
    }
    const acao = res.headers.get("access-control-allow-origin");
    const acac = (res.headers.get("access-control-allow-credentials") ?? "").toLowerCase();
    const preuve = { "access-control-allow-origin": acao, "access-control-allow-credentials": acac, origine_sonde: origineSonde };

    if (acao === origineSonde) {
      return [c("cors", "cors-probe", "high", "CORS reflète une origine arbitraire",
        `Access-Control-Allow-Origin renvoie exactement l'origine piégée envoyée (${origineSonde}). N'importe quel site peut lire les réponses authentifiées de ${ctx.hote}.`,
        ctx.cible, preuve, ["CWE-942"])];
    }
    if (acao === "*") {
      if (acac === "true") {
        return [c("cors", "cors-probe", "high", "CORS joker avec identifiants",
          `Access-Control-Allow-Origin: * combiné à Access-Control-Allow-Credentials: true sur ${ctx.hote}. Configuration rejetée par les navigateurs et signe d'une politique mal maîtrisée.`,
          ctx.cible, preuve, ["CWE-942"])];
      }
      return [c("cors", "cors-probe", "medium", "CORS permissif (Origin: *)",
        `Access-Control-Allow-Origin: * sur ${ctx.hote}. Acceptable pour une API publique ou une clé anon Supabase, à documenter explicitement sinon.`,
        ctx.cible, preuve, ["CWE-942"])];
    }
    return [c("cors", "cors-probe", "info", "CORS restrictif",
      `Aucun joker ni reflet d'origine détecté sur ${ctx.url}.`, ctx.cible, preuve)];
  },
};

const moteurTemoins: MoteurCyber = {
  id: "temoins",
  nom: "Témoins (cookies)",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 8,
  description: "Analyse les attributs Secure, HttpOnly et SameSite des témoins réellement déposés.",
  async executer(ctx) {
    let res: Response;
    try {
      res = await fetchT(ctx.url, { method: "GET", redirect: "follow" }, 10000);
    } catch {
      return [c("temoins", "http-probe", "info", "Témoins non analysables",
        `${ctx.url} injoignable.`, ctx.cible, {})];
    }
    const cookies = entetesSetCookie(res.headers);
    if (cookies.length === 0) {
      return [c("temoins", "http-probe", "info", "Aucun témoin déposé",
        `${ctx.url} ne dépose aucun témoin à la première visite — bonne pratique pour la Loi 25.`,
        ctx.cible, {})];
    }
    const out: Constat[] = [];
    const analyse = cookies.map((ck) => {
      const nom = ck.split("=")[0].trim();
      return {
        nom,
        secure: /;\s*secure/i.test(ck),
        httpOnly: /;\s*httponly/i.test(ck),
        sameSite: ck.match(/;\s*samesite\s*=\s*(\w+)/i)?.[1] ?? null,
      };
    });

    const sansSecure = analyse.filter((a) => !a.secure);
    const sansHttpOnly = analyse.filter((a) => !a.httpOnly);
    const sansSameSite = analyse.filter((a) => !a.sameSite);

    if (sansSecure.length > 0) {
      out.push(c("temoins", "http-probe", "medium", "Témoins sans attribut Secure",
        `${sansSecure.length} témoin(s) de ${ctx.hote} sont déposés sans l'attribut Secure (${sansSecure.map((a) => a.nom).join(", ")}). Ils peuvent transiter en clair.`,
        ctx.cible, { temoins: sansSecure }, ["CWE-614"]));
    }
    if (sansHttpOnly.length > 0) {
      out.push(c("temoins", "http-probe", "medium", "Témoins accessibles au JavaScript",
        `${sansHttpOnly.length} témoin(s) sans HttpOnly (${sansHttpOnly.map((a) => a.nom).join(", ")}) : un XSS permettrait de voler la session.`,
        ctx.cible, { temoins: sansHttpOnly }, ["CWE-1004"]));
    }
    if (sansSameSite.length > 0) {
      out.push(c("temoins", "http-probe", "low", "Témoins sans SameSite explicite",
        `${sansSameSite.length} témoin(s) ne déclarent pas SameSite (${sansSameSite.map((a) => a.nom).join(", ")}) : protection CSRF laissée au comportement par défaut du navigateur.`,
        ctx.cible, { temoins: sansSameSite }, ["CWE-352"]));
    }
    if (out.length === 0) {
      out.push(c("temoins", "http-probe", "info", "Témoins correctement protégés",
        `Les ${analyse.length} témoin(s) déposés par ${ctx.hote} portent Secure, HttpOnly et SameSite.`,
        ctx.cible, { temoins: analyse }));
    }
    return out;
  },
};

const moteurMethodesHTTP: MoteurCyber = {
  id: "methodes_http",
  nom: "Méthodes HTTP autorisées",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 6,
  description: "Requête OPTIONS pour lister les méthodes réellement acceptées par le serveur.",
  async executer(ctx) {
    let res: Response;
    try {
      res = await fetchT(ctx.url, { method: "OPTIONS" }, 10000);
    } catch {
      return [c("methodes_http", "http-probe", "info", "OPTIONS non supporté",
        `${ctx.url} ne répond pas aux requêtes OPTIONS.`, ctx.cible, {})];
    }
    const allow = res.headers.get("allow") ?? res.headers.get("access-control-allow-methods") ?? "";
    if (!allow) {
      return [c("methodes_http", "http-probe", "info", "Méthodes non déclarées",
        `${ctx.url} répond ${res.status} à OPTIONS sans en-tête Allow.`, ctx.cible, { statut: res.status })];
    }
    const methodes = allow.toUpperCase().split(/[,\s]+/).filter(Boolean);
    const risquees = methodes.filter((m) => ["PUT", "DELETE", "TRACE", "TRACK", "CONNECT", "PATCH"].includes(m));
    if (risquees.length > 0) {
      return [c("methodes_http", "http-probe", "low", "Méthodes HTTP à risque déclarées",
        `${ctx.hote} annonce les méthodes ${risquees.join(", ")} (Allow: ${allow}). TRACE expose au Cross-Site Tracing; PUT/DELETE doivent être strictement authentifiés.`,
        ctx.cible, { allow, methodes }, ["CWE-650"])];
    }
    return [c("methodes_http", "http-probe", "info", "Méthodes HTTP limitées",
      `${ctx.hote} n'annonce que : ${allow}.`, ctx.cible, { allow })];
  },
};

const moteurRobots: MoteurCyber = {
  id: "robots",
  nom: "robots.txt et plan de site",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 8,
  description: "Lit robots.txt et sitemap.xml, et repère les chemins sensibles qu'ils divulguent.",
  async executer(ctx) {
    const out: Constat[] = [];
    let robots = "";
    try {
      const r = await fetchT(`${ctx.url.replace(/\/$/, "")}/robots.txt`, { method: "GET" }, 8000);
      if (r.ok) {
        const t = await r.text();
        if (!/^\s*</.test(t)) robots = t.slice(0, 20000);
      }
    } catch { /* absent */ }

    if (!robots) {
      out.push(c("robots", "http-probe", "info", "robots.txt absent",
        `${ctx.hote} ne publie pas de robots.txt.`, ctx.cible, {}));
    } else {
      const disallow = [...robots.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1]);
      const sensibles = disallow.filter((d) =>
        /(admin|backup|config|private|prive|interne|internal|\.git|\.env|db|sql|secret|token|api[_-]?key|staging|dev|test)/i.test(d)
      );
      out.push(c("robots", "http-probe", "info", "robots.txt publié",
        `${disallow.length} règle(s) Disallow sur ${ctx.hote}.`, ctx.cible, { disallow: disallow.slice(0, 25) }));
      if (sensibles.length > 0) {
        out.push(c("robots", "http-probe", "low", "robots.txt divulgue des chemins sensibles",
          `robots.txt de ${ctx.hote} nomme ${sensibles.length} chemin(s) sensible(s) : ${sensibles.slice(0, 8).join(", ")}. Le fichier est public : il sert de carte aux attaquants.`,
          ctx.cible, { chemins: sensibles.slice(0, 15) }, ["CWE-200"]));
      }
    }

    try {
      const r = await fetchT(`${ctx.url.replace(/\/$/, "")}/sitemap.xml`, { method: "GET" }, 8000);
      const t = r.ok ? (await r.text()).slice(0, 2000) : "";
      out.push(c("robots", "http-probe", "info", r.ok && /<urlset|<sitemapindex/i.test(t) ? "Plan de site publié" : "Plan de site absent",
        r.ok && /<urlset|<sitemapindex/i.test(t)
          ? `${ctx.hote} publie un sitemap.xml valide.`
          : `Aucun sitemap.xml exploitable sur ${ctx.hote} (statut ${r.status}).`,
        ctx.cible, { statut: r.status }));
    } catch { /* absent */ }
    return out;
  },
};

const moteurSecurityTxt: MoteurCyber = {
  id: "security_txt",
  nom: "security.txt (RFC 9116)",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 6,
  description: "Vérifie la présence et la validité du canal de divulgation responsable.",
  async executer(ctx) {
    const base = ctx.url.replace(/\/$/, "");
    for (const chemin of ["/.well-known/security.txt", "/security.txt"]) {
      try {
        const r = await fetchT(base + chemin, { method: "GET" }, 8000);
        if (!r.ok) continue;
        const t = (await r.text()).slice(0, 4000);
        if (!/contact\s*:/i.test(t)) continue;
        const expires = t.match(/expires\s*:\s*(\S+)/i)?.[1];
        const perime = expires ? Date.parse(expires) < Date.now() : true;
        return [c("security_txt", "http-probe", perime ? "low" : "info",
          perime ? "security.txt expiré ou sans date de validité" : "security.txt valide",
          perime
            ? `${ctx.hote} publie un security.txt en ${chemin} mais son champ Expires est absent ou dépassé (${expires ?? "absent"}). La RFC 9116 exige une date de validité future.`
            : `${ctx.hote} publie un security.txt valide en ${chemin} (Expires : ${expires}). Un chercheur peut signaler une faille par un canal officiel.`,
          ctx.cible, { chemin, expires: expires ?? null, extrait: t.slice(0, 200) })];
      } catch { /* chemin suivant */ }
    }
    return [c("security_txt", "http-probe", "low", "security.txt absent",
      `${ctx.hote} ne publie pas de fichier security.txt. Aucun canal officiel n'existe pour recevoir un signalement de vulnérabilité.`,
      ctx.cible, {}, ["CWE-1059"])];
  },
};

const moteurTechnologies: MoteurCyber = {
  id: "technologies",
  nom: "Empreinte technologique",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 10,
  description: "Identifie serveur, cadriciel et CMS à partir des en-têtes et du HTML réellement servis.",
  async executer(ctx) {
    const { html, res } = await pageAccueil(ctx);
    if (!res) {
      return [c("technologies", "http-probe", "info", "Empreinte non réalisable",
        `${ctx.url} injoignable.`, ctx.cible, {})];
    }
    const detecte: string[] = [];
    const h = res.headers;
    for (const k of ["server", "x-powered-by", "x-aspnet-version", "x-generator", "via", "x-vercel-id", "x-served-by", "cf-ray"]) {
      const v = h.get(k);
      if (v) detecte.push(`${k}: ${v.slice(0, 80)}`);
    }
    const signatures: Array<[RegExp, string]> = [
      [/wp-content|wp-includes/i, "WordPress"],
      [/\/_next\/|__NEXT_DATA__/i, "Next.js"],
      [/\/_nuxt\//i, "Nuxt"],
      [/ng-version=/i, "Angular"],
      [/data-reactroot|react(-dom)?\.production/i, "React"],
      [/drupal-settings-json|\/sites\/default\/files/i, "Drupal"],
      [/joomla/i, "Joomla"],
      [/cdn\.shopify\.com/i, "Shopify"],
      [/static\.parastorage\.com|wix\.com/i, "Wix"],
      [/squarespace/i, "Squarespace"],
      [/laravel_session|csrf-token/i, "Laravel"],
      [/supabase\.co/i, "Supabase"],
      [/firebaseio\.com|firebaseapp\.com/i, "Firebase"],
    ];
    for (const [motif, nom] of signatures) if (motif.test(html)) detecte.push(nom);
    const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1];
    if (generator) detecte.push(`generator: ${generator}`);

    const versionnes = detecte.filter((d) => /\d+\.\d+/.test(d));
    const out: Constat[] = [c("technologies", "http-probe", "info", "Pile technologique identifiée",
      detecte.length > 0
        ? `Technologies détectées sur ${ctx.hote} : ${[...new Set(detecte)].slice(0, 12).join(" · ")}.`
        : `Aucune signature technologique évidente sur ${ctx.hote} — empreinte discrète.`,
      ctx.cible, { detecte: [...new Set(detecte)].slice(0, 20) })];

    if (versionnes.length > 0) {
      out.push(c("technologies", "http-probe", "low", "Numéros de version divulgués",
        `${ctx.hote} divulgue des versions précises : ${versionnes.slice(0, 5).join(" · ")}. Cela permet de cibler directement les CVE correspondantes.`,
        ctx.cible, { versions: versionnes.slice(0, 10) }, ["CWE-200"]));
    }
    return out;
  },
};

const moteurContenuMixte: MoteurCyber = {
  id: "contenu_mixte",
  nom: "Contenu mixte et formulaires",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 8,
  description: "Repère les ressources chargées en HTTP et les formulaires qui postent en clair.",
  async executer(ctx) {
    const { html } = await pageAccueil(ctx);
    if (!html) {
      return [c("contenu_mixte", "http-probe", "info", "Page non analysable",
        `Aucun HTML récupéré pour ${ctx.url}.`, ctx.cible, {})];
    }
    const out: Constat[] = [];
    const ressourcesHttp = [...html.matchAll(/(?:src|href)\s*=\s*["'](http:\/\/[^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((u) => !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u));
    const uniques = [...new Set(ressourcesHttp)].slice(0, 15);

    if (uniques.length > 0) {
      out.push(c("contenu_mixte", "http-probe", "medium", "Contenu mixte détecté",
        `${uniques.length} ressource(s) de la page d'accueil de ${ctx.hote} sont chargées en HTTP alors que la page est servie en HTTPS : ${uniques.slice(0, 4).join(", ")}. Les navigateurs bloquent ou dégradent ces ressources et le contenu est modifiable en transit.`,
        ctx.cible, { ressources: uniques }, ["CWE-319"]));
    }

    const formulaires = [...html.matchAll(/<form\b[^>]*>/gi)].map((m) => m[0]);
    const formsHttp = formulaires.filter((f) => /action\s*=\s*["']http:\/\//i.test(f));
    if (formsHttp.length > 0) {
      out.push(c("contenu_mixte", "http-probe", "high", "Formulaire soumis en clair",
        `${formsHttp.length} formulaire(s) de ${ctx.hote} envoient leurs données vers une URL HTTP non chiffrée. Tout ce qui est saisi circule en clair.`,
        ctx.cible, { formulaires: formsHttp.slice(0, 4) }, ["CWE-319"]));
    }

    const aMotDePasse = /<input[^>]+type\s*=\s*["']password["']/i.test(html);
    if (aMotDePasse && !ctx.url.startsWith("https://")) {
      out.push(c("contenu_mixte", "http-probe", "critical", "Champ mot de passe hors HTTPS",
        `Un champ de mot de passe est servi sur une page non HTTPS (${ctx.url}). Les identifiants transitent en clair.`,
        ctx.cible, {}, ["CWE-319"]));
    }
    if (out.length === 0) {
      out.push(c("contenu_mixte", "http-probe", "info", "Aucun contenu mixte",
        `Toutes les ressources et tous les formulaires de la page d'accueil de ${ctx.hote} utilisent HTTPS.`,
        ctx.cible, { formulaires: formulaires.length }));
    }
    return out;
  },
};

const moteurSRI: MoteurCyber = {
  id: "sri",
  nom: "Intégrité des ressources tierces",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 8,
  description: "Vérifie l'attribut integrity sur les scripts tiers et inventorie les origines externes.",
  async executer(ctx) {
    const { html } = await pageAccueil(ctx);
    if (!html) {
      return [c("sri", "http-probe", "info", "Page non analysable",
        `Aucun HTML récupéré pour ${ctx.url}.`, ctx.cible, {})];
    }
    const balises = [...html.matchAll(/<(script|link)\b[^>]*>/gi)].map((m) => m[0]);
    const tiers = balises.filter((b) => {
      const src = b.match(/(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      if (!/^https?:\/\//i.test(src)) return false;
      try {
        return new URL(src).hostname !== ctx.hote;
      } catch {
        return false;
      }
    });
    const executables = tiers.filter((b) => /^<script/i.test(b) || /rel\s*=\s*["']stylesheet["']/i.test(b));
    const sansIntegrite = executables.filter((b) => !/integrity\s*=/i.test(b));
    const origines = [...new Set(tiers.map((b) => {
      const src = b.match(/(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      try { return new URL(src).hostname; } catch { return ""; }
    }).filter(Boolean))];

    const out: Constat[] = [c("sri", "http-probe", "info", "Dépendances tierces chargées",
      origines.length > 0
        ? `${ctx.hote} charge des ressources depuis ${origines.length} origine(s) tierce(s) : ${origines.slice(0, 10).join(", ")}. Chacune est un point de compromission de la chaîne d'approvisionnement.`
        : `${ctx.hote} ne charge aucune ressource tierce sur sa page d'accueil.`,
      ctx.cible, { origines })];

    if (sansIntegrite.length > 0) {
      out.push(c("sri", "http-probe", "medium", "Scripts tiers sans contrôle d'intégrité",
        `${sansIntegrite.length} ressource(s) exécutable(s) tierce(s) sont chargées sans attribut integrity sur ${ctx.hote}. Si le fournisseur est compromis, le code malveillant s'exécute dans vos pages sans détection.`,
        ctx.cible, { balises: sansIntegrite.slice(0, 6).map((b) => b.slice(0, 160)) }, ["CWE-494"]));
    }
    return out;
  },
};

const moteurSecretsClient: MoteurCyber = {
  id: "secrets_client",
  nom: "Secrets exposés côté client",
  categorie: "exposition",
  invasivite: "passif",
  besoin: "reseau",
  duree: 20,
  description: "Télécharge le HTML et les bundles JS servis, puis y cherche des clés d'API réelles.",
  async executer(ctx) {
    const { html } = await pageAccueil(ctx);
    if (!html) {
      return [c("secrets_client", "http-probe", "info", "Analyse impossible",
        `Aucun contenu récupéré pour ${ctx.url}.`, ctx.cible, {})];
    }
    const scripts = [...html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .map((s) => {
        try { return new URL(s, ctx.url).toString(); } catch { return ""; }
      })
      .filter((s) => s && new URL(s).hostname === ctx.hote)
      .slice(0, 8);

    const corpus: Array<{ source: string; texte: string }> = [{ source: "page d'accueil", texte: html }];
    const bundles = await enParallele(scripts, 4, async (u) => {
      try {
        const r = await fetchT(u, { method: "GET" }, 12000);
        if (!r.ok) return null;
        return { source: u, texte: (await r.text()).slice(0, 800_000) };
      } catch {
        return null;
      }
    });
    for (const b of bundles) if (b) corpus.push(b);

    const motifs: Array<{ re: RegExp; nom: string; sev: Severite }> = [
      { re: /AKIA[0-9A-Z]{16}/g, nom: "clé d'accès AWS", sev: "critical" },
      { re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, nom: "clé privée", sev: "critical" },
      { re: /sk_live_[0-9a-zA-Z]{20,}/g, nom: "clé secrète Stripe (production)", sev: "critical" },
      { re: /rk_live_[0-9a-zA-Z]{20,}/g, nom: "clé restreinte Stripe (production)", sev: "high" },
      { re: /sk-ant-[A-Za-z0-9\-_]{20,}/g, nom: "clé API Anthropic", sev: "critical" },
      { re: /sk-proj-[A-Za-z0-9\-_]{20,}/g, nom: "clé API OpenAI", sev: "critical" },
      { re: /gh[pousr]_[A-Za-z0-9]{30,}/g, nom: "jeton GitHub", sev: "critical" },
      { re: /xox[baprs]-[0-9A-Za-z-]{10,}/g, nom: "jeton Slack", sev: "high" },
      { re: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{30,}/g, nom: "clé SendGrid", sev: "high" },
      { re: /AIza[0-9A-Za-z\-_]{35}/g, nom: "clé API Google", sev: "medium" },
      { re: /key-[0-9a-f]{32}/g, nom: "clé Mailgun", sev: "high" },
      { re: /SK[0-9a-f]{32}/g, nom: "clé Twilio", sev: "high" },
    ];

    const out: Constat[] = [];
    const trouves: Array<{ type: string; source: string; extrait: string; sev: Severite }> = [];

    for (const { source, texte } of corpus) {
      for (const m of motifs) {
        const occ = texte.match(m.re);
        if (occ && occ.length > 0) {
          trouves.push({ type: m.nom, source, extrait: masquer(occ[0]), sev: m.sev });
        }
      }
      // Jetons JWT : seul un service_role est une fuite; la clé anon Supabase est publique par conception.
      const jwts = texte.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) ?? [];
      for (const jwt of jwts.slice(0, 40)) {
        try {
          const charge = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (String(charge.role ?? "") === "service_role") {
            trouves.push({ type: "clé service_role Supabase", source, extrait: masquer(jwt), sev: "critical" });
          }
        } catch { /* pas un JWT décodable */ }
      }
    }

    if (trouves.length === 0) {
      return [c("secrets_client", "secret-scan", "info", "Aucun secret exposé détecté",
        `Le HTML et ${corpus.length - 1} paquet(s) JavaScript de ${ctx.hote} ont été analysés : aucune clé d'API ni clé privée détectée.`,
        ctx.cible, { fichiers_analyses: corpus.length })];
    }

    const parType = new Map<string, typeof trouves>();
    for (const t of trouves) {
      if (!parType.has(t.type)) parType.set(t.type, []);
      parType.get(t.type)!.push(t);
    }
    for (const [type, liste] of parType) {
      out.push(c("secrets_client", "secret-scan", liste[0].sev, `Secret exposé : ${type}`,
        `Une ${type} est servie publiquement dans le code client de ${ctx.hote} (${liste.length} occurrence(s), ex. ${liste[0].source}). N'importe quel visiteur peut la récupérer : elle doit être considérée comme compromise et révoquée immédiatement.`,
        ctx.cible, { type, occurrences: liste.length, valeur_masquee: liste[0].extrait, sources: liste.slice(0, 3).map((l) => l.source) },
        ["CWE-798"]));
    }
    return out;
  },
};

const moteurLoi25: MoteurCyber = {
  id: "loi25",
  nom: "Vie privée et Loi 25",
  categorie: "web",
  invasivite: "passif",
  besoin: "reseau",
  duree: 12,
  description: "Vérifie politique de confidentialité, bandeau de consentement et traceurs tiers réellement chargés.",
  async executer(ctx) {
    const { html } = await pageAccueil(ctx);
    if (!html) {
      return [c("loi25", "http-probe", "info", "Analyse impossible",
        `Aucun HTML récupéré pour ${ctx.url}.`, ctx.cible, {})];
    }
    const out: Constat[] = [];
    const bas = html.toLowerCase();

    const cheminsPolitique = [
      "/politique-de-confidentialite", "/politique-confidentialite", "/confidentialite",
      "/vie-privee", "/privacy", "/privacy-policy",
    ];
    const lienDansPage = cheminsPolitique.some((p) => bas.includes(p)) ||
      /politique de confidentialit|privacy policy|protection des renseignements personnels/i.test(html);

    let politiqueTrouvee = lienDansPage;
    if (!politiqueTrouvee) {
      const essais = await enParallele(cheminsPolitique, 3, async (p) => {
        try {
          const r = await fetchT(ctx.url.replace(/\/$/, "") + p, { method: "GET" }, 8000);
          return r.ok ? p : null;
        } catch {
          return null;
        }
      });
      politiqueTrouvee = essais.some(Boolean);
    }
    if (!politiqueTrouvee) {
      out.push(c("loi25", "privacy-check", "medium", "Politique de confidentialité introuvable",
        `Aucune politique de confidentialité n'a été trouvée sur ${ctx.hote}. La Loi 25 (art. 8 et 8.1) exige une information claire et accessible sur la collecte de renseignements personnels.`,
        ctx.cible, { chemins_testes: cheminsPolitique }, ["CWE-359"]));
    } else {
      out.push(c("loi25", "privacy-check", "info", "Politique de confidentialité présente",
        `Une politique de confidentialité est référencée sur ${ctx.hote}.`, ctx.cible, {}));
    }

    const traceurs: Array<[RegExp, string]> = [
      [/google-analytics\.com|googletagmanager\.com|gtag\(/i, "Google Analytics / Tag Manager"],
      [/connect\.facebook\.net|facebook\.com\/tr/i, "Meta Pixel"],
      [/hotjar\.com/i, "Hotjar"],
      [/clarity\.ms/i, "Microsoft Clarity"],
      [/doubleclick\.net/i, "DoubleClick"],
      [/matomo|piwik/i, "Matomo"],
      [/segment\.(com|io)/i, "Segment"],
      [/linkedin\.com\/px|snap\.licdn\.com/i, "LinkedIn Insight"],
      [/tiktok\.com\/i18n|analytics\.tiktok/i, "TikTok Pixel"],
    ];
    const detectes = traceurs.filter(([re]) => re.test(html)).map(([, n]) => n);
    const banniere = /consentement|cookie|témoin|temoin|accepter les cookies|gérer mes préférences/i.test(html) &&
      /(banner|bandeau|consent|cookie-?(banner|notice|consent))/i.test(html);

    if (detectes.length > 0) {
      out.push(c("loi25", "privacy-check", banniere ? "low" : "medium",
        banniere ? "Traceurs tiers avec bandeau de consentement" : "Traceurs tiers sans consentement visible",
        banniere
          ? `${detectes.length} traceur(s) détecté(s) sur ${ctx.hote} (${detectes.join(", ")}) avec un mécanisme de consentement dans la page. Vérifier que les traceurs ne se déclenchent qu'après acceptation.`
          : `${detectes.length} traceur(s) tiers sont chargés dès l'arrivée sur ${ctx.hote} (${detectes.join(", ")}) sans bandeau de consentement détecté. La Loi 25 (art. 8.1) exige le consentement préalable pour la technologie de suivi.`,
        ctx.cible, { traceurs: detectes, banniere }, ["CWE-359"]));
    } else {
      out.push(c("loi25", "privacy-check", "info", "Aucun traceur tiers détecté",
        `Aucun traceur publicitaire ou analytique connu n'est chargé sur la page d'accueil de ${ctx.hote}.`,
        ctx.cible, {}));
    }

    const responsable = /responsable de la protection des renseignements personnels|responsable de la protection des rp|privacy officer|délégué à la protection/i.test(html);
    if (!responsable && !lienDansPage) {
      out.push(c("loi25", "privacy-check", "low", "Responsable de la protection des RP non identifié",
        `Aucune mention d'un responsable de la protection des renseignements personnels sur la page d'accueil de ${ctx.hote}. La Loi 25 (art. 3.1) impose de désigner cette personne et de publier son titre et ses coordonnées.`,
        ctx.cible, {}));
    }
    return out;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CATÉGORIE : SONDAGE ACTIF LÉGER (autorisation requise)
// ════════════════════════════════════════════════════════════════════════════

/** Refus standard quand l'autorisation de scan actif n'est pas accordée. */
function refusActif(moteur: string, ctx: ContexteScan): Constat {
  return c(moteur, "scope-note", "info", "Sondage actif non exécuté",
    `Le moteur « ${moteur} » envoie des requêtes supplémentaires vers la cible et exige une autorisation de scan actif. Elle n'a pas été accordée pour ${ctx.hote} : aucune requête n'a été envoyée, aucun résultat n'est supposé.`,
    ctx.cible, { autorise_actif: false });
}

const moteurFichiersExposes: MoteurCyber = {
  id: "fichiers_exposes",
  nom: "Fichiers sensibles exposés",
  categorie: "actif",
  invasivite: "actif-leger",
  besoin: "reseau",
  duree: 25,
  description: "Teste des chemins connus (.env, .git, sauvegardes) et confirme par signature de contenu.",
  async executer(ctx) {
    if (!ctx.autoriseActif) return [refusActif("fichiers_exposes", ctx)];
    const base = ctx.url.replace(/\/$/, "");
    const cibles: Array<{ chemin: string; signature: RegExp; sev: Severite; quoi: string }> = [
      { chemin: "/.env", signature: /^[A-Z0-9_]+\s*=/m, sev: "critical", quoi: "fichier de variables d'environnement" },
      { chemin: "/.env.local", signature: /^[A-Z0-9_]+\s*=/m, sev: "critical", quoi: "fichier d'environnement local" },
      { chemin: "/.env.production", signature: /^[A-Z0-9_]+\s*=/m, sev: "critical", quoi: "fichier d'environnement de production" },
      { chemin: "/.git/config", signature: /\[core\]|\[remote /, sev: "critical", quoi: "dépôt Git exposé" },
      { chemin: "/.git/HEAD", signature: /^ref:\s*refs\//, sev: "critical", quoi: "dépôt Git exposé" },
      { chemin: "/.svn/entries", signature: /^\d+\s*$|dir\s*$/m, sev: "high", quoi: "dépôt Subversion exposé" },
      { chemin: "/.DS_Store", signature: /Bud1/, sev: "low", quoi: "index de dossier macOS" },
      { chemin: "/.npmrc", signature: /_authToken|registry=/, sev: "critical", quoi: "configuration npm avec jeton" },
      { chemin: "/.aws/credentials", signature: /aws_access_key_id/i, sev: "critical", quoi: "identifiants AWS" },
      { chemin: "/id_rsa", signature: /BEGIN (RSA |OPENSSH )?PRIVATE KEY/, sev: "critical", quoi: "clé privée SSH" },
      { chemin: "/docker-compose.yml", signature: /^\s*(services|version)\s*:/m, sev: "medium", quoi: "composition Docker" },
      { chemin: "/Dockerfile", signature: /^\s*FROM\s+/m, sev: "low", quoi: "Dockerfile" },
      { chemin: "/package.json", signature: /"dependencies"|"name"\s*:/, sev: "low", quoi: "manifeste npm" },
      { chemin: "/composer.json", signature: /"require"\s*:/, sev: "low", quoi: "manifeste Composer" },
      { chemin: "/web.config", signature: /<configuration/i, sev: "medium", quoi: "configuration IIS" },
      { chemin: "/appsettings.json", signature: /"ConnectionStrings"|"Logging"/, sev: "high", quoi: "configuration .NET" },
      { chemin: "/config.json", signature: /"(password|secret|apiKey|token)"/i, sev: "high", quoi: "fichier de configuration" },
      { chemin: "/backup.zip", signature: /^PK/, sev: "critical", quoi: "archive de sauvegarde" },
      { chemin: "/backup.sql", signature: /(CREATE TABLE|INSERT INTO|-- MySQL dump)/i, sev: "critical", quoi: "vidage de base de données" },
      { chemin: "/dump.sql", signature: /(CREATE TABLE|INSERT INTO|-- MySQL dump)/i, sev: "critical", quoi: "vidage de base de données" },
      { chemin: "/phpinfo.php", signature: /phpinfo\(\)|PHP Version/i, sev: "high", quoi: "page phpinfo" },
      { chemin: "/server-status", signature: /Apache Server Status/i, sev: "medium", quoi: "statut serveur Apache" },
      { chemin: "/wp-config.php.bak", signature: /DB_PASSWORD|DB_NAME/, sev: "critical", quoi: "configuration WordPress sauvegardée" },
    ];

    const resultats = await enParallele(cibles, 6, async (t) => {
      try {
        const r = await fetchT(base + t.chemin, { method: "GET", redirect: "manual" }, 8000);
        if (r.status !== 200) return null;
        const corps = (await r.text()).slice(0, 4096);
        // Un SPA renvoie souvent 200 + HTML pour tout : la signature écarte ce faux positif.
        if (/^\s*<!doctype html|^\s*<html/i.test(corps) && !/^\/\.git/.test(t.chemin)) return null;
        if (!t.signature.test(corps)) return null;
        return { ...t, taille: corps.length, extrait: corps.slice(0, 120).replace(/\s+/g, " ") };
      } catch {
        return null;
      }
    });

    const trouves = resultats.filter(Boolean) as Array<
      { chemin: string; sev: Severite; quoi: string; taille: number; extrait: string }
    >;
    if (trouves.length === 0) {
      return [c("fichiers_exposes", "path-probe", "info", "Aucun fichier sensible exposé",
        `Les ${cibles.length} chemins sensibles testés sur ${ctx.hote} ne renvoient aucun contenu exploitable (confirmation par signature de contenu, pas seulement par code HTTP).`,
        ctx.cible, { chemins_testes: cibles.length })];
    }
    return trouves.map((t) =>
      c("fichiers_exposes", "path-probe", t.sev, `Fichier sensible accessible : ${t.chemin}`,
        `${ctx.hote}${t.chemin} répond 200 avec un contenu confirmé de type « ${t.quoi} ». Ce fichier est téléchargeable par n'importe qui et contient typiquement des identifiants ou la structure interne de l'application.`,
        ctx.cible, { chemin: t.chemin, taille: t.taille, extrait: t.extrait }, ["CWE-538", "CWE-200"])
    );
  },
};

const moteurPanneauxAdmin: MoteurCyber = {
  id: "panneaux_admin",
  nom: "Interfaces d'administration",
  categorie: "actif",
  invasivite: "actif-leger",
  besoin: "reseau",
  duree: 20,
  description: "Recherche des consoles d'administration et des points d'API de diagnostic exposés.",
  async executer(ctx) {
    if (!ctx.autoriseActif) return [refusActif("panneaux_admin", ctx)];
    const base = ctx.url.replace(/\/$/, "");
    const cibles: Array<{ chemin: string; signature: RegExp | null; sev: Severite; quoi: string }> = [
      { chemin: "/wp-login.php", signature: /wp-submit|user_login/i, sev: "medium", quoi: "connexion WordPress" },
      { chemin: "/wp-admin/", signature: /wp-admin|wordpress/i, sev: "medium", quoi: "administration WordPress" },
      { chemin: "/phpmyadmin/", signature: /phpmyadmin/i, sev: "high", quoi: "phpMyAdmin" },
      { chemin: "/adminer.php", signature: /adminer/i, sev: "high", quoi: "Adminer" },
      { chemin: "/actuator/health", signature: /"status"\s*:/i, sev: "medium", quoi: "Spring Boot Actuator" },
      { chemin: "/actuator/env", signature: /"propertySources"|"activeProfiles"/i, sev: "critical", quoi: "variables d'environnement Spring" },
      { chemin: "/swagger.json", signature: /"swagger"|"openapi"/i, sev: "low", quoi: "spécification Swagger" },
      { chemin: "/openapi.json", signature: /"openapi"/i, sev: "low", quoi: "spécification OpenAPI" },
      { chemin: "/api-docs", signature: /"swagger"|"openapi"|swagger-ui/i, sev: "low", quoi: "documentation d'API" },
      { chemin: "/graphql", signature: /"data"\s*:|"errors"\s*:|graphql/i, sev: "medium", quoi: "point d'entrée GraphQL" },
      { chemin: "/.well-known/openid-configuration", signature: /"issuer"/i, sev: "info", quoi: "configuration OpenID" },
      { chemin: "/admin", signature: null, sev: "low", quoi: "espace d'administration" },
      { chemin: "/administrator/", signature: /joomla|administrator/i, sev: "medium", quoi: "administration Joomla" },
    ];

    const resultats = await enParallele(cibles, 6, async (t) => {
      try {
        const r = await fetchT(base + t.chemin, { method: "GET", redirect: "manual" }, 8000);
        // 401/403 prouvent l'existence d'un point protégé : information utile, pas un faux positif.
        if (r.status === 401 || r.status === 403) {
          return { ...t, statut: r.status, protege: true, extrait: "" };
        }
        if (r.status !== 200) return null;
        const corps = (await r.text()).slice(0, 4096);
        if (t.signature === null) return null; // sans signature, un 200 seul est ininterprétable (SPA)
        if (!t.signature.test(corps)) return null;
        return { ...t, statut: 200, protege: false, extrait: corps.slice(0, 120).replace(/\s+/g, " ") };
      } catch {
        return null;
      }
    });

    const trouves = resultats.filter(Boolean) as Array<{ chemin: string; sev: Severite; quoi: string; statut: number; protege: boolean; extrait: string }>;
    if (trouves.length === 0) {
      return [c("panneaux_admin", "path-probe", "info", "Aucune interface d'administration exposée",
        `Les ${cibles.length} chemins d'administration testés sur ${ctx.hote} ne répondent pas ou ne correspondent à aucune console connue.`,
        ctx.cible, { chemins_testes: cibles.length })];
    }
    return trouves.map((t) =>
      c("panneaux_admin", "path-probe", t.protege ? "info" : t.sev,
        t.protege ? `Point protégé détecté : ${t.chemin}` : `Interface exposée : ${t.chemin}`,
        t.protege
          ? `${ctx.hote}${t.chemin} répond ${t.statut} : l'endpoint existe et est protégé par authentification. Sa simple présence renseigne un attaquant sur la pile utilisée.`
          : `${ctx.hote}${t.chemin} sert un contenu de type « ${t.quoi} » sans authentification (HTTP 200, signature confirmée). Cette interface doit être restreinte par réseau ou par authentification forte.`,
        ctx.cible, { chemin: t.chemin, statut: t.statut, extrait: t.extrait }, ["CWE-284"])
    );
  },
};

const moteurPortsWeb: MoteurCyber = {
  id: "ports_web",
  nom: "Ports applicatifs HTTP",
  categorie: "actif",
  invasivite: "actif-leger",
  besoin: "reseau",
  duree: 30,
  description: "Sonde les ports HTTP/HTTPS courants hors 80/443 (limite honnête : pas de sockets bruts).",
  async executer(ctx) {
    if (!ctx.autoriseActif) return [refusActif("ports_web", ctx)];
    const ports = [8080, 8443, 8000, 8888, 3000, 5000, 9000, 9090, 7001, 4000, 5601, 15672];
    const resultats = await enParallele(ports, 6, async (p) => {
      for (const schema of ["https", "http"]) {
        try {
          const r = await fetchT(`${schema}://${ctx.hote}:${p}/`, { method: "GET", redirect: "manual" }, 5000);
          const serveur = r.headers.get("server") ?? "";
          return { port: p, schema, statut: r.status, serveur };
        } catch { /* port suivant */ }
      }
      return null;
    });
    const ouverts = resultats.filter(Boolean) as Array<{ port: number; schema: string; statut: number; serveur: string }>;

    const out: Constat[] = [];
    if (ouverts.length === 0) {
      out.push(c("ports_web", "port-probe", "info", "Aucun port applicatif secondaire ouvert",
        `Aucun des ${ports.length} ports HTTP courants testés (${ports.join(", ")}) ne répond sur ${ctx.hote}.`,
        ctx.cible, { ports_testes: ports }));
    } else {
      out.push(c("ports_web", "port-probe", "medium", "Services web sur ports secondaires",
        `${ouverts.length} service(s) HTTP répondent hors 80/443 sur ${ctx.hote} : ${ouverts.map((o) => `${o.port} (${o.statut}${o.serveur ? ", " + o.serveur : ""})`).join(", ")}. Ces services sont souvent des consoles de développement laissées accessibles.`,
        ctx.cible, { ouverts }, ["CWE-668"]));
    }
    out.push(c("ports_web", "scope-note", "info", "Balayage de ports complet non exécuté",
      `Ce moteur ne teste que des ports parlant HTTP : une Edge Function n'a pas accès aux sockets bruts. Un balayage TCP complet (type nmap) exige un moteur externe sur machine virtuelle. Aucun résultat n'a été simulé.`,
      ctx.cible, { ports_testes: ports.length }));
    return out;
  },
};

const moteurServicesDonnees: MoteurCyber = {
  id: "services_donnees",
  nom: "Services de données exposés",
  categorie: "actif",
  invasivite: "actif-leger",
  besoin: "reseau",
  duree: 25,
  description: "Vérifie si Elasticsearch, Kibana, CouchDB, Grafana ou l'API Docker répondent sans authentification.",
  async executer(ctx) {
    if (!ctx.autoriseActif) return [refusActif("services_donnees", ctx)];
    const sondes: Array<{ port: number; chemin: string; signature: RegExp; nom: string; sev: Severite }> = [
      { port: 9200, chemin: "/_cluster/health", signature: /"cluster_name"|"status"\s*:/i, nom: "Elasticsearch", sev: "critical" },
      { port: 9200, chemin: "/_cat/indices", signature: /health\s+status|green|yellow/i, nom: "Elasticsearch (index)", sev: "critical" },
      { port: 5601, chemin: "/api/status", signature: /"version"|"kibana"/i, nom: "Kibana", sev: "high" },
      { port: 5984, chemin: "/_all_dbs", signature: /^\s*\[/, nom: "CouchDB", sev: "critical" },
      { port: 9090, chemin: "/api/v1/status/config", signature: /"status"\s*:\s*"success"/i, nom: "Prometheus", sev: "high" },
      { port: 3000, chemin: "/api/health", signature: /"database"\s*:|"version"/i, nom: "Grafana", sev: "medium" },
      { port: 15672, chemin: "/api/overview", signature: /rabbitmq|management_version/i, nom: "RabbitMQ Management", sev: "high" },
      { port: 2375, chemin: "/version", signature: /"ApiVersion"|"Os"\s*:/i, nom: "API Docker", sev: "critical" },
      { port: 8086, chemin: "/ping", signature: /^$/, nom: "InfluxDB", sev: "high" },
    ];

    const resultats = await enParallele(sondes, 5, async (s) => {
      for (const schema of ["http", "https"]) {
        try {
          const r = await fetchT(`${schema}://${ctx.hote}:${s.port}${s.chemin}`, { method: "GET" }, 5000);
          if (r.status === 401 || r.status === 403) return { ...s, statut: r.status, ouvert: false };
          if (r.status !== 200 && r.status !== 204) continue;
          const corps = (await r.text()).slice(0, 2048);
          if (!s.signature.test(corps)) continue;
          return { ...s, statut: 200, ouvert: true, extrait: corps.slice(0, 140).replace(/\s+/g, " ") };
        } catch { /* schéma suivant */ }
      }
      return null;
    });

    const trouves = resultats.filter(Boolean) as Array<{ nom: string; port: number; sev: Severite; statut: number; ouvert: boolean; extrait?: string }>;
    if (trouves.length === 0) {
      return [c("services_donnees", "port-probe", "info", "Aucun service de données exposé",
        `Aucun des ${sondes.length} services de données testés (Elasticsearch, Kibana, CouchDB, Prometheus, Grafana, RabbitMQ, Docker, InfluxDB) ne répond publiquement sur ${ctx.hote}.`,
        ctx.cible, { services_testes: sondes.length })];
    }
    return trouves.map((t) =>
      t.ouvert
        ? c("services_donnees", "port-probe", t.sev, `${t.nom} accessible sans authentification`,
          `${t.nom} répond publiquement sur ${ctx.hote}:${t.port} sans authentification. Les données indexées ou l'infrastructure sont directement lisibles, et parfois modifiables, par n'importe qui sur Internet.`,
          ctx.cible, { service: t.nom, port: t.port, extrait: t.extrait ?? "" }, ["CWE-306", "CWE-668"])
        : c("services_donnees", "port-probe", "low", `${t.nom} exposé mais authentifié`,
          `${t.nom} répond sur ${ctx.hote}:${t.port} avec un code ${t.statut} (authentification exigée). Le service ne devrait pas être joignable depuis Internet.`,
          ctx.cible, { service: t.nom, port: t.port, statut: t.statut }, ["CWE-668"])
    );
  },
};

const moteurRedirectionOuverte: MoteurCyber = {
  id: "redirection_ouverte",
  nom: "Redirection ouverte",
  categorie: "actif",
  invasivite: "actif-leger",
  besoin: "reseau",
  duree: 20,
  description: "Teste les paramètres de redirection courants avec une destination témoin.",
  async executer(ctx) {
    if (!ctx.autoriseActif) return [refusActif("redirection_ouverte", ctx)];
    const temoin = "https://silex-redirect-probe.example/";
    const parametres = ["url", "next", "redirect", "redirect_uri", "return", "returnUrl", "returnTo", "dest", "destination", "continue", "r", "u"];
    const base = ctx.url.replace(/\/$/, "");

    const resultats = await enParallele(parametres, 5, async (p) => {
      try {
        const r = await fetchT(`${base}/?${p}=${encodeURIComponent(temoin)}`, { method: "GET", redirect: "manual" }, 7000);
        if (r.status < 300 || r.status >= 400) return null;
        const loc = r.headers.get("location") ?? "";
        if (loc.startsWith(temoin) || loc.includes("silex-redirect-probe.example")) {
          return { parametre: p, statut: r.status, location: loc.slice(0, 200) };
        }
        return null;
      } catch {
        return null;
      }
    });

    const vulnerables = resultats.filter(Boolean) as Array<{ parametre: string; statut: number; location: string }>;
    if (vulnerables.length === 0) {
      return [c("redirection_ouverte", "web-probe", "info", "Aucune redirection ouverte détectée",
        `Les ${parametres.length} paramètres de redirection courants testés sur ${ctx.hote} ne renvoient pas vers la destination témoin.`,
        ctx.cible, { parametres_testes: parametres })];
    }
    return vulnerables.map((v) =>
      c("redirection_ouverte", "web-probe", "medium", `Redirection ouverte via « ${v.parametre} »`,
        `${ctx.hote} redirige (${v.statut}) vers une destination externe fournie dans le paramètre « ${v.parametre} ». Un attaquant peut fabriquer un lien portant votre domaine qui aboutit sur un site d'hameçonnage.`,
        ctx.cible, { parametre: v.parametre, statut: v.statut, location: v.location }, ["CWE-601"])
    );
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CATÉGORIE : POSTURE INTERNE (base de données ti-lex)
// ════════════════════════════════════════════════════════════════════════════

function sansBase(moteur: string, ctx: ContexteScan): Constat {
  return c(moteur, "scope-note", "info", "Vérification interne non exécutée",
    `Le moteur « ${moteur} » inspecte la base de données ti-lex; aucun client de service n'était disponible dans ce contexte de scan.`,
    ctx.cible, {});
}

const moteurRLS: MoteurCyber = {
  id: "rls",
  nom: "Row Level Security",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 6,
  description: "Lit le catalogue PostgreSQL pour vérifier que RLS est actif sur chaque table publique.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("rls", ctx)];
    try {
      const { data, error } = await ctx.db.rpc("silex_rls_summary");
      if (error || !Array.isArray(data)) {
        return [c("rls", "supabase-audit", "info", "RLS non vérifié",
          `La RPC silex_rls_summary n'est pas disponible (${error?.message ?? "réponse inattendue"}). Vérification sautée — aucune supposition faite.`,
          ctx.cible, {})];
      }
      const sansRls = data.filter((t: { rls_enabled: boolean }) => !t.rls_enabled);
      if (sansRls.length === 0) {
        return [c("rls", "supabase-audit", "info", "RLS actif partout",
          `RLS vérifié : activé sur les ${data.length} table(s) du schéma public.`,
          ctx.cible, { tables: data.length })];
      }
      return [c("rls", "supabase-audit", "high", "Tables sans RLS",
        `${sansRls.length} table(s) du schéma public n'ont pas RLS : ${sansRls.slice(0, 10).map((t: { table_name: string }) => t.table_name).join(", ")}. Toute personne détenant la clé anon peut les lire via l'API REST.`,
        ctx.cible, { tables: sansRls.slice(0, 20).map((t: { table_name: string }) => t.table_name) }, ["CWE-284"])];
    } catch (e) {
      return [c("rls", "supabase-audit", "info", "RLS non vérifié",
        `Erreur lors de la vérification RLS : ${String(e).slice(0, 160)}`, ctx.cible, {})];
    }
  },
};

const moteurPolitiques: MoteurCyber = {
  id: "politiques_rls",
  nom: "Politiques RLS",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 6,
  description: "Détecte les tables où RLS est actif mais où aucune politique n'est définie.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("politiques_rls", ctx)];
    try {
      const { data, error } = await ctx.db.rpc("silex_rls_summary");
      if (error || !Array.isArray(data)) {
        return [c("politiques_rls", "supabase-audit", "info", "Politiques non vérifiées",
          `RPC silex_rls_summary indisponible (${error?.message ?? "réponse inattendue"}).`, ctx.cible, {})];
      }
      const verrouillees = data.filter((t: { rls_enabled: boolean; nb_policies: number }) => t.rls_enabled && t.nb_policies === 0);
      const permissives = data.filter((t: { nb_policies: number }) => t.nb_policies > 6);
      const out: Constat[] = [];
      if (verrouillees.length > 0) {
        out.push(c("politiques_rls", "supabase-audit", "medium", "Tables RLS sans aucune politique",
          `${verrouillees.length} table(s) ont RLS activé mais zéro politique : ${verrouillees.slice(0, 10).map((t: { table_name: string }) => t.table_name).join(", ")}. Toute lecture ou écriture applicative y échouera silencieusement — souvent le signe d'une migration incomplète.`,
          ctx.cible, { tables: verrouillees.slice(0, 20).map((t: { table_name: string }) => t.table_name) }, ["CWE-284"]));
      }
      if (permissives.length > 0) {
        out.push(c("politiques_rls", "supabase-audit", "low", "Tables à politiques nombreuses",
          `${permissives.length} table(s) portent plus de 6 politiques (${permissives.slice(0, 6).map((t: { table_name: string; nb_policies: number }) => `${t.table_name}:${t.nb_policies}`).join(", ")}). Un empilement de politiques rend l'accès effectif difficile à auditer.`,
          ctx.cible, { tables: permissives.slice(0, 12).map((t: { table_name: string; nb_policies: number }) => ({ table: t.table_name, policies: t.nb_policies })) }));
      }
      if (out.length === 0) {
        out.push(c("politiques_rls", "supabase-audit", "info", "Politiques RLS cohérentes",
          `Les ${data.length} table(s) publiques ont une couverture de politiques cohérente.`, ctx.cible, {}));
      }
      return out;
    } catch (e) {
      return [c("politiques_rls", "supabase-audit", "info", "Politiques non vérifiées",
        `Erreur : ${String(e).slice(0, 160)}`, ctx.cible, {})];
    }
  },
};

const moteurAnonExposition: MoteurCyber = {
  id: "anon_exposition",
  nom: "Test d'exposition anonyme",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 30,
  description: "Tente réellement de lire chaque table publique avec la clé anon : preuve directe de l'efficacité de RLS.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("anon_exposition", ctx)];
    if (!ctx.supabaseUrl || !ctx.anonKey) {
      return [c("anon_exposition", "supabase-audit", "info", "Test anonyme non exécuté",
        `Clé anon ou URL Supabase absente du contexte : aucun test d'exposition n'a été tenté.`, ctx.cible, {})];
    }
    let tables: string[] = [];
    try {
      const { data } = await ctx.db.rpc("silex_rls_summary");
      if (Array.isArray(data)) tables = data.map((t: { table_name: string }) => t.table_name);
    } catch { /* on retombe sur la liste vide */ }
    if (tables.length === 0) {
      return [c("anon_exposition", "supabase-audit", "info", "Test anonyme non exécuté",
        `Impossible d'obtenir la liste des tables (RPC silex_rls_summary indisponible).`, ctx.cible, {})];
    }

    const aTester = tables.slice(0, 80);
    const resultats = await enParallele(aTester, 8, async (t) => {
      try {
        const r = await fetchT(
          `${ctx.supabaseUrl}/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`,
          { headers: { apikey: ctx.anonKey!, Authorization: `Bearer ${ctx.anonKey}` } },
          8000,
        );
        if (!r.ok) return null;
        const j = await r.json();
        return Array.isArray(j) && j.length > 0 ? { table: t, colonnes: Object.keys(j[0]).length } : null;
      } catch {
        return null;
      }
    });

    const lisibles = resultats.filter(Boolean) as Array<{ table: string; colonnes: number }>;
    if (lisibles.length === 0) {
      return [c("anon_exposition", "supabase-audit", "info", "Aucune table lisible anonymement",
        `Test réel effectué sur ${aTester.length} table(s) avec la clé anon : aucune ne retourne de ligne. RLS bloque effectivement la lecture non authentifiée.`,
        ctx.cible, { tables_testees: aTester.length })];
    }
    return [c("anon_exposition", "supabase-audit", "critical", "Tables lisibles sans authentification",
      `${lisibles.length} table(s) retournent des données à une requête portant uniquement la clé anon publique : ${lisibles.slice(0, 8).map((l) => l.table).join(", ")}. Ce n'est pas une hypothèse : les lignes ont réellement été renvoyées. Toute personne connaissant l'URL du projet peut les extraire.`,
      ctx.cible, { tables: lisibles.slice(0, 20), tables_testees: aTester.length }, ["CWE-284", "CWE-200"])];
  },
};

const moteurBuckets: MoteurCyber = {
  id: "buckets",
  nom: "Buckets de stockage",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 5,
  description: "Liste les buckets Supabase Storage et signale ceux marqués publics.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("buckets", ctx)];
    try {
      const { data, error } = await ctx.db.rpc("silex_buckets_stockage");
      if (error || !Array.isArray(data)) {
        return [c("buckets", "supabase-audit", "info", "Buckets non vérifiés",
          `RPC silex_buckets_stockage indisponible (${error?.message ?? "réponse inattendue"}).`, ctx.cible, {})];
      }
      const publics = data.filter((b: { est_public: boolean }) => b.est_public);
      if (publics.length === 0) {
        return [c("buckets", "supabase-audit", "info", "Aucun bucket public",
          `Les ${data.length} bucket(s) de stockage sont privés.`, ctx.cible, { buckets: data.length })];
      }
      return [c("buckets", "supabase-audit", "medium", "Buckets de stockage publics",
        `${publics.length} bucket(s) sur ${data.length} sont publics : ${publics.map((b: { bucket_id: string }) => b.bucket_id).join(", ")}. Tout fichier qui y est déposé est lisible sans authentification par quiconque connaît son URL.`,
        ctx.cible, { buckets: publics.map((b: { bucket_id: string }) => b.bucket_id) }, ["CWE-284"])];
    } catch (e) {
      return [c("buckets", "supabase-audit", "info", "Buckets non vérifiés",
        `Erreur : ${String(e).slice(0, 160)}`, ctx.cible, {})];
    }
  },
};

const moteurFonctionsExposees: MoteurCyber = {
  id: "fonctions_exposees",
  nom: "Fonctions SQL exposées",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 6,
  description: "Repère les fonctions PostgreSQL exécutables par le rôle anon, surtout en SECURITY DEFINER.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("fonctions_exposees", ctx)];
    try {
      const { data, error } = await ctx.db.rpc("silex_fonctions_exposees");
      if (error || !Array.isArray(data)) {
        return [c("fonctions_exposees", "supabase-audit", "info", "Fonctions non vérifiées",
          `RPC silex_fonctions_exposees indisponible (${error?.message ?? "réponse inattendue"}).`, ctx.cible, {})];
      }
      const anonDefiner = data.filter((f: { anon_execute: boolean; est_definer: boolean }) => f.anon_execute && f.est_definer);
      const anonSimple = data.filter((f: { anon_execute: boolean; est_definer: boolean }) => f.anon_execute && !f.est_definer);
      const out: Constat[] = [];
      if (anonDefiner.length > 0) {
        out.push(c("fonctions_exposees", "supabase-audit", "high", "Fonctions SECURITY DEFINER exécutables par anon",
          `${anonDefiner.length} fonction(s) s'exécutent avec les privilèges de leur propriétaire et sont appelables sans authentification : ${anonDefiner.slice(0, 8).map((f: { nom: string }) => f.nom).join(", ")}. Elles contournent RLS par conception.`,
          ctx.cible, { fonctions: anonDefiner.slice(0, 20).map((f: { nom: string }) => f.nom) }, ["CWE-269"]));
      }
      out.push(c("fonctions_exposees", "supabase-audit", anonSimple.length > 0 ? "low" : "info",
        "Surface RPC publique",
        `${anonSimple.length} fonction(s) du schéma public sont exécutables par le rôle anon sans être SECURITY DEFINER, sur ${data.length} fonction(s) au total.`,
        ctx.cible, { total: data.length, anon: anonSimple.length }));
      return out;
    } catch (e) {
      return [c("fonctions_exposees", "supabase-audit", "info", "Fonctions non vérifiées",
        `Erreur : ${String(e).slice(0, 160)}`, ctx.cible, {})];
    }
  },
};

const moteurExtensions: MoteurCyber = {
  id: "extensions",
  nom: "Extensions PostgreSQL",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 4,
  description: "Vérifie qu'aucune extension n'est installée dans le schéma public (recommandation Supabase).",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("extensions", ctx)];
    try {
      const { data, error } = await ctx.db.rpc("silex_extensions_publiques");
      if (error || !Array.isArray(data)) {
        return [c("extensions", "supabase-audit", "info", "Extensions non vérifiées",
          `RPC silex_extensions_publiques indisponible (${error?.message ?? "réponse inattendue"}).`, ctx.cible, {})];
      }
      const dansPublic = data.filter((e: { schema_nom: string }) => e.schema_nom === "public");
      if (dansPublic.length === 0) {
        return [c("extensions", "supabase-audit", "info", "Extensions bien isolées",
          `Les ${data.length} extension(s) installées sont hors du schéma public.`, ctx.cible, { total: data.length })];
      }
      return [c("extensions", "supabase-audit", "low", "Extensions installées dans le schéma public",
        `${dansPublic.length} extension(s) sont dans le schéma public : ${dansPublic.map((e: { nom: string }) => e.nom).join(", ")}. Supabase recommande de les déplacer dans un schéma dédié pour éviter les collisions de noms et les élévations de privilèges.`,
        ctx.cible, { extensions: dansPublic.map((e: { nom: string; version: string }) => `${e.nom} ${e.version}`) }, ["CWE-269"])];
    } catch (e) {
      return [c("extensions", "supabase-audit", "info", "Extensions non vérifiées",
        `Erreur : ${String(e).slice(0, 160)}`, ctx.cible, {})];
    }
  },
};

const moteurComptesAuth: MoteurCyber = {
  id: "comptes_auth",
  nom: "Hygiène des comptes",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 5,
  description: "Agrégats réels sur l'authentification : MFA, courriels non confirmés, comptes dormants.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("comptes_auth", ctx)];
    try {
      const { data, error } = await ctx.db.rpc("silex_comptes_auth");
      const r = Array.isArray(data) ? data[0] : data;
      if (error || !r) {
        return [c("comptes_auth", "supabase-audit", "info", "Comptes non vérifiés",
          `RPC silex_comptes_auth indisponible (${error?.message ?? "réponse inattendue"}).`, ctx.cible, {})];
      }
      const out: Constat[] = [];
      const total = Number(r.total ?? 0);
      const sansMfa = Number(r.sans_mfa ?? 0);
      const dormants = Number(r.dormants_90j ?? 0);
      const nonConfirmes = Number(r.courriels_non_confirmes ?? 0);
      const admins = Number(r.admins ?? 0);

      if (total > 0 && sansMfa === total) {
        out.push(c("comptes_auth", "supabase-audit", "medium", "Aucun compte protégé par MFA",
          `Les ${total} compte(s) du projet n'ont aucun facteur MFA vérifié. Un mot de passe volé suffit à prendre le contrôle, y compris pour les ${admins} compte(s) administrateur.`,
          ctx.cible, { total, sans_mfa: sansMfa, admins }, ["CWE-308"]));
      } else if (sansMfa > 0) {
        out.push(c("comptes_auth", "supabase-audit", "low", "Comptes sans MFA",
          `${sansMfa} compte(s) sur ${total} n'ont pas de facteur MFA vérifié.`,
          ctx.cible, { total, sans_mfa: sansMfa }, ["CWE-308"]));
      }
      if (dormants > 0) {
        out.push(c("comptes_auth", "supabase-audit", "low", "Comptes dormants",
          `${dormants} compte(s) ne se sont pas connectés depuis plus de 90 jours. Les comptes inactifs élargissent inutilement la surface d'attaque.`,
          ctx.cible, { dormants }, ["CWE-1188"]));
      }
      if (nonConfirmes > 0) {
        out.push(c("comptes_auth", "supabase-audit", "info", "Courriels non confirmés",
          `${nonConfirmes} compte(s) ont une adresse courriel non confirmée.`, ctx.cible, { non_confirmes: nonConfirmes }));
      }
      if (out.length === 0) {
        out.push(c("comptes_auth", "supabase-audit", "info", "Hygiène des comptes correcte",
          `${total} compte(s), MFA en place, aucun compte dormant au-delà de 90 jours.`, ctx.cible, { total }));
      }
      return out;
    } catch (e) {
      return [c("comptes_auth", "supabase-audit", "info", "Comptes non vérifiés",
        `Erreur : ${String(e).slice(0, 160)}`, ctx.cible, {})];
    }
  },
};

const moteurJournalisation: MoteurCyber = {
  id: "journalisation",
  nom: "Journalisation d'audit",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 4,
  description: "Vérifie que la table d'audit reçoit réellement des événements récents.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("journalisation", ctx)];
    try {
      const { data, error } = await ctx.db.rpc("silex_journalisation");
      const r = Array.isArray(data) ? data[0] : data;
      if (error || !r) {
        return [c("journalisation", "config-check", "info", "Journalisation non vérifiée",
          `RPC silex_journalisation indisponible (${error?.message ?? "réponse inattendue"}).`, ctx.cible, {})];
      }
      const nb = Number(r.evenements_7j ?? 0);
      if (nb === 0) {
        return [c("journalisation", "config-check", "medium", "Aucun événement d'audit récent",
          `La table d'audit ne contient aucun événement sur les 7 derniers jours (dernier événement : ${r.dernier_evenement ?? "aucun"}). Sans journalisation vivante, une intrusion passerait inaperçue et la Loi 25 exige de pouvoir documenter un incident.`,
          ctx.cible, { evenements_7j: 0, dernier: r.dernier_evenement ?? null }, ["CWE-778"])];
      }
      return [c("journalisation", "config-check", "info", "Journalisation active",
        `${nb} événement(s) d'audit enregistré(s) sur les 7 derniers jours (dernier : ${r.dernier_evenement}).`,
        ctx.cible, { evenements_7j: nb, dernier: r.dernier_evenement })];
    } catch (e) {
      return [c("journalisation", "config-check", "info", "Journalisation non vérifiée",
        `Erreur : ${String(e).slice(0, 160)}`, ctx.cible, {})];
    }
  },
};

const moteurLimitationDebit: MoteurCyber = {
  id: "limitation_debit",
  nom: "Limitation de débit",
  categorie: "posture",
  invasivite: "passif",
  besoin: "base",
  duree: 5,
  description: "Vérifie que l'infrastructure de rate limiting existe et fonctionne réellement.",
  async executer(ctx) {
    if (!ctx.db) return [sansBase("limitation_debit", ctx)];
    let rpcPresente = false;
    try {
      const { data, error } = await ctx.db.rpc("check_rate_limit", {
        p_key: "silex:selftest:ratelimit", p_max: 1_000_000, p_window_seconds: 60,
      });
      rpcPresente = !error && typeof data === "boolean";
    } catch { rpcPresente = false; }

    let recentes = 0;
    try {
      const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { count } = await ctx.db.from("rate_limits").select("*", { count: "exact", head: true }).gte("window_start", depuis);
      recentes = count ?? 0;
    } catch { recentes = 0; }

    if (rpcPresente) {
      return [c("limitation_debit", "config-check", "info", "Limitation de débit présente",
        `La RPC check_rate_limit répond correctement. ${recentes > 0 ? `${recentes} fenêtre(s) de limitation enregistrée(s) sur 7 jours.` : "Aucune activité récente à limiter."}`,
        ctx.cible, { rpc: true, fenetres_7j: recentes })];
    }
    return [c("limitation_debit", "config-check", "high", "Limitation de débit absente",
      `Aucune RPC check_rate_limit fonctionnelle ni activité de limitation détectée. Les points d'entrée coûteux (authentification, IA, scans) peuvent être martelés sans frein.`,
      ctx.cible, { rpc: false }, ["CWE-307"])];
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CATÉGORIE : FUITES DE DONNÉES
// ════════════════════════════════════════════════════════════════════════════

const moteurHIBP: MoteurCyber = {
  id: "hibp",
  nom: "Brèches de données (HIBP)",
  categorie: "fuites",
  invasivite: "passif",
  besoin: "reseau",
  duree: 12,
  description: "Interroge réellement Have I Been Pwned pour le domaine ou l'adresse ciblée.",
  async executer(ctx) {
    const estAdresse = estCourriel(ctx.cible);

    if (estAdresse) {
      if (!ctx.hibpKey) {
        return [c("hibp", "hibp", "info", "Vérification d'adresse impossible",
          `La recherche par adresse courriel exige une clé API HIBP (HIBP_API_KEY), absente de l'environnement. Aucune donnée n'a été inventée.`,
          ctx.cible, { cle_presente: false })];
      }
      try {
        const r = await fetchT(
          `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(ctx.cible)}?truncateResponse=false`,
          { headers: { "hibp-api-key": ctx.hibpKey, "User-Agent": "ti-lex-al-silex/4.0" } },
          12000,
        );
        if (r.status === 404) {
          return [c("hibp", "hibp", "info", "Adresse absente des brèches connues",
            `${ctx.cible} n'apparaît dans aucune brèche répertoriée par Have I Been Pwned.`, ctx.cible, { breches: 0 })];
        }
        if (!r.ok) {
          return [c("hibp", "hibp", "info", "HIBP indisponible",
            `L'API Have I Been Pwned a répondu ${r.status}. Vérification non concluante.`, ctx.cible, { statut: r.status })];
        }
        const breches = await r.json() as Array<{ Name: string; BreachDate: string; DataClasses: string[] }>;
        const donnees = [...new Set(breches.flatMap((b) => b.DataClasses ?? []))];
        const sensible = donnees.some((d) => /password|credit|social security|bank|health/i.test(d));
        return [c("hibp", "hibp", sensible ? "high" : "medium", "Adresse présente dans des brèches",
          `${ctx.cible} apparaît dans ${breches.length} brèche(s) : ${breches.slice(0, 6).map((b) => `${b.Name} (${b.BreachDate})`).join(", ")}. Types de données exposées : ${donnees.slice(0, 10).join(", ")}.`,
          ctx.cible, { breches: breches.slice(0, 15).map((b) => ({ nom: b.Name, date: b.BreachDate })), donnees },
          ["CWE-359"])];
      } catch (e) {
        return [c("hibp", "hibp", "info", "HIBP injoignable",
          `Erreur de connexion à Have I Been Pwned : ${String(e).slice(0, 140)}`, ctx.cible, {})];
      }
    }

    // Recherche par domaine — endpoint public, sans clé.
    const racine = domaineRacine(ctx.hote);
    try {
      const r = await fetchT(
        `https://haveibeenpwned.com/api/v3/breaches?Domain=${encodeURIComponent(racine)}`,
        { headers: { "User-Agent": "ti-lex-al-silex/4.0", accept: "application/json" } },
        12000,
      );
      if (!r.ok) {
        return [c("hibp", "hibp", "info", "HIBP indisponible",
          `L'API Have I Been Pwned a répondu ${r.status} pour le domaine ${racine}. Vérification non concluante.`,
          ctx.cible, { statut: r.status })];
      }
      const breches = await r.json() as Array<{ Name: string; BreachDate: string; PwnCount: number; DataClasses: string[] }>;
      if (!Array.isArray(breches) || breches.length === 0) {
        return [c("hibp", "hibp", "info", "Aucune brèche associée au domaine",
          `Aucune brèche répertoriée par Have I Been Pwned n'est associée à ${racine}.`, ctx.cible, { breches: 0 })];
      }
      const total = breches.reduce((s, b) => s + (b.PwnCount ?? 0), 0);
      const donnees = [...new Set(breches.flatMap((b) => b.DataClasses ?? []))];
      return [c("hibp", "hibp", "high", "Brèches associées au domaine",
        `${racine} est associé à ${breches.length} brèche(s) répertoriée(s) totalisant ${total.toLocaleString("fr-CA")} compte(s) : ${breches.slice(0, 5).map((b) => `${b.Name} (${b.BreachDate})`).join(", ")}. Données exposées : ${donnees.slice(0, 10).join(", ")}.`,
        ctx.cible, { breches: breches.slice(0, 12).map((b) => ({ nom: b.Name, date: b.BreachDate, comptes: b.PwnCount })), donnees },
        ["CWE-359"])];
    } catch (e) {
      return [c("hibp", "hibp", "info", "HIBP injoignable",
        `Erreur de connexion à Have I Been Pwned : ${String(e).slice(0, 140)}`, ctx.cible, {})];
    }
  },
};

const moteurPorteeExterne: MoteurCyber = {
  id: "portee_externe",
  nom: "Limites honnêtes du moteur",
  categorie: "fuites",
  invasivite: "passif",
  besoin: "reseau",
  duree: 1,
  description: "Déclare explicitement ce qu'une Edge Function ne peut pas faire, plutôt que de le simuler.",
  async executer(ctx) {
    return [
      c("portee_externe", "scope-note", "info", "Détection de CVE non exécutée",
        `La corrélation de versions avec les bases CVE (type Nuclei, OpenVAS, Trivy) exige un moteur externe sur machine virtuelle ou conteneur : c'est hors du périmètre d'une Edge Function. Aucun résultat CVE n'a été inventé.`,
        ctx.cible, {}),
      c("portee_externe", "scope-note", "info", "Balayage de ports TCP complet non exécuté",
        `Un balayage TCP exhaustif (type nmap) requiert des sockets bruts, indisponibles ici. Seuls les ports parlant HTTP ont pu être sondés.`,
        ctx.cible, {}),
      c("portee_externe", "scope-note", "info", "Surveillance dark web non exécutée",
        `L'accès aux forums et places de marché en .onion demande un client Tor et des abonnements de renseignement dédiés. Ce moteur ne prétend pas y accéder; seules les brèches publiques (HIBP) et les archives publiques sont interrogées.`,
        ctx.cible, {}),
    ];
  },
};

// ════════════════════════════════════════════════════════════════════════════
// REGISTRE
// ════════════════════════════════════════════════════════════════════════════

export const MOTEURS: MoteurCyber[] = [
  // Reconnaissance
  moteurDNS, moteurDNSSEC, moteurCAA, moteurDNSInverse, moteurSousDomaines,
  moteurCertificats, moteurTakeover, moteurTyposquat, moteurReputation,
  // Courriel
  moteurCourrielAuth, moteurCourrielTransport,
  // Web
  moteurEntetes, moteurTLS, moteurCORS, moteurTemoins, moteurMethodesHTTP,
  moteurRobots, moteurSecurityTxt, moteurTechnologies, moteurContenuMixte,
  moteurSRI, moteurLoi25,
  // Exposition
  moteurSecretsClient, moteurArchives,
  // Actif léger
  moteurFichiersExposes, moteurPanneauxAdmin, moteurPortsWeb,
  moteurServicesDonnees, moteurRedirectionOuverte,
  // Posture interne
  moteurRLS, moteurPolitiques, moteurAnonExposition, moteurBuckets,
  moteurFonctionsExposees, moteurExtensions, moteurComptesAuth,
  moteurJournalisation, moteurLimitationDebit,
  // Fuites
  moteurHIBP, moteurPorteeExterne,
];

export const MOTEURS_PAR_ID: Record<string, MoteurCyber> = Object.fromEntries(
  MOTEURS.map((m) => [m.id, m]),
);

/** Identifiants de moteurs par catégorie. */
export function moteursDeCategorie(cat: CategorieId): string[] {
  return MOTEURS.filter((m) => m.categorie === cat).map((m) => m.id);
}

// ─── PROFILS (types de scan SILEX) ──────────────────────────────────────────
// Les six profils historiques restent valides : ils pointent désormais vers
// l'ensemble complet des moteurs réels correspondants.
export const PROFILS: Record<string, { nom: string; moteurs: string[] }> = {
  passive_recon: {
    nom: "Reconnaissance passive",
    moteurs: ["dns", "dnssec", "caa", "dns_inverse", "tls", "certificats", "technologies", "reputation"],
  },
  web_scan: {
    nom: "Scan web",
    moteurs: ["entetes", "tls", "cors", "temoins", "methodes_http", "robots", "security_txt",
      "technologies", "contenu_mixte", "sri", "secrets_client"],
  },
  config_audit: {
    nom: "Audit de configuration",
    moteurs: ["rls", "politiques_rls", "anon_exposition", "buckets", "fonctions_exposees",
      "extensions", "comptes_auth", "journalisation", "limitation_debit"],
  },
  vuln_scan: {
    nom: "Vulnérabilités",
    moteurs: ["entetes", "cors", "temoins", "methodes_http", "contenu_mixte", "sri",
      "secrets_client", "takeover", "limitation_debit", "portee_externe"],
  },
  courriel_scan: {
    nom: "Sécurité du courriel",
    moteurs: ["courriel_auth", "courriel_transport", "reputation", "typosquat", "dns"],
  },
  surface_scan: {
    nom: "Surface d'attaque",
    moteurs: ["dns", "sous_domaines", "certificats", "takeover", "typosquat", "archives", "technologies"],
  },
  dark_web_monitor: {
    nom: "Fuites et exposition publique",
    moteurs: ["hibp", "secrets_client", "archives", "typosquat", "portee_externe"],
  },
  actif_scan: {
    nom: "Sondage actif léger",
    moteurs: ["fichiers_exposes", "panneaux_admin", "ports_web", "services_donnees", "redirection_ouverte"],
  },
  full_audit: {
    nom: "Audit complet",
    moteurs: MOTEURS.map((m) => m.id),
  },
};

// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATION
// ════════════════════════════════════════════════════════════════════════════

export function creerContexte(cible: string, opts: {
  db?: DB;
  supabaseUrl?: string;
  anonKey?: string;
  hibpKey?: string;
  autoriseActif?: boolean;
} = {}): ContexteScan {
  const brut = estCourriel(cible) ? cible.split("@")[1] : cible;
  return {
    cible,
    hote: hostnameOf(brut),
    url: urlOf(hostnameOf(brut)),
    db: opts.db,
    supabaseUrl: opts.supabaseUrl,
    anonKey: opts.anonKey,
    hibpKey: opts.hibpKey,
    autoriseActif: opts.autoriseActif ?? false,
    cache: new Map(),
  };
}

/** Résout une demande (profil ou liste de moteurs) en identifiants de moteurs valides. */
export function resoudreMoteurs(demande: { scan_type?: string; moteurs?: string[] }): {
  ids: string[];
  inconnus: string[];
} {
  const inconnus: string[] = [];
  const ids: string[] = [];
  const ajouter = (id: string) => {
    if (MOTEURS_PAR_ID[id]) {
      if (!ids.includes(id)) ids.push(id);
    } else {
      inconnus.push(id);
    }
  };

  if (Array.isArray(demande.moteurs) && demande.moteurs.length > 0) {
    for (const m of demande.moteurs) ajouter(String(m));
  } else if (demande.scan_type) {
    const profil = PROFILS[demande.scan_type];
    if (profil) for (const m of profil.moteurs) ajouter(m);
    else inconnus.push(demande.scan_type);
  }

  if (ids.length === 0 && inconnus.length > 0) {
    for (const m of PROFILS.passive_recon.moteurs) ajouter(m);
  }
  return { ids, inconnus };
}

export interface ResultatExecution {
  constats: Constat[];
  journal: Array<{ moteur: string; nom: string; statut: "ok" | "erreur"; constats: number; ms: number; erreur?: string }>;
}

/** Exécute les moteurs demandés avec un plafond de concurrence et un budget de temps. */
export async function executerMoteurs(
  ids: string[],
  ctx: ContexteScan,
  opts: { concurrence?: number; budgetMs?: number } = {},
): Promise<ResultatExecution> {
  const concurrence = opts.concurrence ?? 5;
  const budgetMs = opts.budgetMs ?? 110_000;
  const debutGlobal = Date.now();
  const constats: Constat[] = [];
  const journal: ResultatExecution["journal"] = [];

  // Les moteurs qui partagent un cache (CT logs, HTML) sont regroupés en tête
  // pour que les suivants réutilisent le travail déjà fait.
  const ordonnes = [...ids].sort((a, b) => {
    const poids = (id: string) => (id === "sous_domaines" ? 0 : id === "technologies" ? 1 : 2);
    return poids(a) - poids(b);
  });

  await enParallele(ordonnes, concurrence, async (id) => {
    const moteur = MOTEURS_PAR_ID[id];
    if (!moteur) return;
    if (Date.now() - debutGlobal > budgetMs) {
      journal.push({ moteur: id, nom: moteur.nom, statut: "erreur", constats: 0, ms: 0, erreur: "budget de temps épuisé" });
      constats.push(c(id, "engine", "info", `Moteur « ${moteur.nom} » non exécuté`,
        `Le budget de temps du scan était épuisé avant le lancement de ce moteur. Relancer un scan ciblé pour l'exécuter.`,
        ctx.cible, {}));
      return;
    }
    const debut = Date.now();
    try {
      const r = await moteur.executer(ctx);
      constats.push(...r);
      journal.push({ moteur: id, nom: moteur.nom, statut: "ok", constats: r.length, ms: Date.now() - debut });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      journal.push({ moteur: id, nom: moteur.nom, statut: "erreur", constats: 0, ms: Date.now() - debut, erreur: msg.slice(0, 200) });
      constats.push(c(id, "engine", "info", `Moteur « ${moteur.nom} » en erreur`,
        `Ce moteur a échoué : ${msg.slice(0, 200)}. Aucun résultat n'a été supposé à sa place.`,
        ctx.cible, { erreur: msg.slice(0, 300) }));
    }
  });

  return { constats, journal };
}

/** Catalogue sérialisable — utilisé par l'interface pour construire le sélecteur. */
export function catalogue() {
  return {
    categories: CATEGORIES,
    moteurs: MOTEURS.map((m) => ({
      id: m.id,
      nom: m.nom,
      categorie: m.categorie,
      invasivite: m.invasivite,
      besoin: m.besoin,
      duree: m.duree,
      description: m.description,
    })),
    profils: Object.entries(PROFILS).map(([id, p]) => ({ id, nom: p.nom, moteurs: p.moteurs })),
  };
}
