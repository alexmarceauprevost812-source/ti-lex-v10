// api/lien-apercu.js
// Ti-lex-AL v10 — Aperçu riche d'un lien (Open Graph : titre, description,
// image, nom du site, prix). Le navigateur ne peut pas lire les autres sites
// (CORS) : on va chercher la page côté serveur, on lit ses balises <meta>, pis
// on renvoie un JSON propre pour bâtir une carte avec photo + prix dans le chat.
//
// Sécurité anti-SSRF : protocole http(s) seulement + résolution DNS pis blocage
// des IP privées/réservées (localhost, 10.*, 192.168.*, 169.254.* metadata, …)
// à CHAQUE saut de redirection. Timeout + taille max. Aucune clé exposée.

import dns from 'dns';
import net from 'net';

const TIMEOUT_MS = 7000;
const MAX_BYTES = 600 * 1024;      // on lit au plus ~600 Ko de HTML
const MAX_REDIRECTS = 3;
const UA = 'Mozilla/5.0 (compatible; ti-lex-linkpreview/1.0; +https://ti-lex.app)';

function estIPPrivee(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;            // link-local + metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true;                              // multicast/réservé
    return false;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd')) return true;
    if (s.startsWith('::ffff:')) return estIPPrivee(s.replace('::ffff:', '')); // IPv4-mapped
    return false;
  }
  return true; // inconnu → on bloque
}

// Valide un URL (protocole + hôte non-privé, DNS résolu). Retourne l'URL objet ou null.
async function urlSure(u) {
  let url;
  try { url = new URL(u); } catch (e) { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return null;
  try {
    if (net.isIP(host)) {
      if (estIPPrivee(host)) return null;
    } else {
      const adresses = await dns.promises.lookup(host, { all: true });
      if (!adresses.length) return null;
      for (const a of adresses) if (estIPPrivee(a.address)) return null;
    }
  } catch (e) { return null; }
  return url;
}

// Fetch avec redirections manuelles (chaque saut re-validé anti-SSRF).
async function fetchSur(depart) {
  let courant = depart;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await urlSure(courant);
    if (!url) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let r;
    try {
      r = await fetch(url.href, {
        signal: ctrl.signal, redirect: 'manual',
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      });
    } catch (e) { clearTimeout(t); return null; }
    clearTimeout(t);
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) return null;
      courant = new URL(loc, url.href).href;   // résout relatif → absolu, re-validé au prochain tour
      continue;
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('html') && !ct.includes('xml') && ct !== '') return { finalUrl: url.href, html: '' };
    // Lecture bornée en taille.
    const reader = r.body && r.body.getReader ? r.body.getReader() : null;
    if (!reader) { const txt = await r.text().catch(() => ''); return { finalUrl: url.href, html: txt.slice(0, MAX_BYTES) }; }
    const dec = new TextDecoder('utf-8', { fatal: false });
    let html = '', recu = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      recu += value.length;
      html += dec.decode(value, { stream: true });
      if (recu >= MAX_BYTES) { try { await reader.cancel(); } catch (_) {} break; }
      if (/<\/head>/i.test(html)) break; // le <head> suffit pour les balises OG
    }
    return { finalUrl: url.href, html };
  }
  return null;
}

function decoderEntites(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return ''; } })
    .trim();
}

// Cherche le content d'une balise <meta property|name|itemprop="clé">.
function lireMeta(html, cles) {
  for (const cle of cles) {
    const k = cle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["\']' + k + '["\'][^>]*>', 'i');
    const m = html.match(re);
    if (m) {
      const c = m[0].match(/content\s*=\s*["']([^"']*)["']/i);
      if (c && c[1]) return decoderEntites(c[1]);
    }
  }
  return null;
}

// Prix : balises OG produit, sinon JSON-LD offers.price.
function lirePrix(html) {
  let montant = lireMeta(html, ['product:price:amount', 'og:price:amount', 'price']);
  let devise = lireMeta(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']);
  if (!montant) {
    const blocs = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const b of blocs) {
      const j = b.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
      try {
        const data = JSON.parse(j);
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          const offers = item && (item.offers || (item['@graph'] && item['@graph'].find && item['@graph'].find(x => x.offers)));
          const off = Array.isArray(offers) ? offers[0] : offers;
          if (off && (off.price || off.lowPrice)) { montant = String(off.price || off.lowPrice); devise = off.priceCurrency || devise; break; }
        }
      } catch (e) { /* JSON-LD invalide → on ignore */ }
      if (montant) break;
    }
  }
  if (!montant) return null;
  const n = String(montant).replace(/[^\d.,]/g, '');
  if (!n) return null;
  const sym = { USD: '$', CAD: '$', EUR: '€', GBP: '£' }[(devise || '').toUpperCase()] || '';
  const cad = (devise && /CAD/i.test(devise)) ? ' CAD' : '';
  return (sym ? n + sym : n) + cad;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, erreur: 'GET seulement' });

  const cible = (req.query && (req.query.url || req.query.u)) || '';
  if (!cible || typeof cible !== 'string' || cible.length > 2000) {
    return res.status(400).json({ ok: false, erreur: 'Paramètre url manquant ou trop long.' });
  }

  try {
    const r = await fetchSur(cible);
    if (!r) return res.status(200).json({ ok: false, erreur: 'Aperçu indisponible (site injoignable ou bloqué).' });
    const { finalUrl, html } = r;
    const base = new URL(finalUrl);

    let image = lireMeta(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image']);
    if (image) { try { image = new URL(image, base).href; } catch (e) { image = null; } }
    if (image && !/^https?:\/\//i.test(image)) image = null;

    let titre = lireMeta(html, ['og:title', 'twitter:title']);
    if (!titre) { const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (t) titre = decoderEntites(t[1]); }

    const description = lireMeta(html, ['og:description', 'twitter:description', 'description']);
    const siteName = lireMeta(html, ['og:site_name', 'application-name']) || base.hostname.replace(/^www\./, '');
    const prix = lirePrix(html);

    // Cache CDN : les aperçus changent peu → on soulage la fonction.
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({
      ok: true,
      url: finalUrl,
      titre: titre ? titre.slice(0, 160) : null,
      description: description ? description.slice(0, 300) : null,
      image: image || null,
      siteName: siteName ? siteName.slice(0, 80) : null,
      prix: prix || null,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, erreur: 'Aperçu indisponible.' });
  }
}
