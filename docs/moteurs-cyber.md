# Moteurs de cybersécurité SILEX — 40 moteurs réels

Bibliothèque : `supabase/functions/_shared/moteurs-cyber.ts`
Catalogue interface : `js/moteurs-cyber.js` (miroir, mêmes identifiants)
Point d'entrée : `supabase/functions/security-agent/index.ts` (SILEX v4)
Interface : onglet **SILEX → LANCER UN SCAN** dans `security.html`

## Principe

**Aucun constat n'est inventé.** Chaque moteur fait une vérification réelle et
joint la donnée brute observée dans le champ `preuve` (visible dans le rapport
sous « PREUVE OBSERVÉE »). Claude n'intervient qu'après coup pour rédiger la
prose — description, impact d'affaires, lien Loi 25, remédiation. Il ne détecte
rien.

Ce qui est impossible depuis une Edge Function est **déclaré**, pas simulé :
le moteur `portee_externe` publie explicitement les trois limites (détection de
CVE, balayage TCP complet, accès dark web .onion).

## Invasivité

| Niveau | Sens | Autorisation |
|---|---|---|
| `passif` | Observation seule : DNS, en-têtes, journaux publics, catalogue PostgreSQL | Mandat de scan standard |
| `actif-leger` | Requêtes HTTP supplémentaires vers la cible (chemins connus, ports applicatifs) | Autorisation de scan actif — sans elle, le moteur ne transmet **aucune** requête et le déclare |

Le contrôle légal reste `verify_scan_authorization` côté base, appelé avant tout
scan. La barrière de mandat côté interface (`window.TilexMandat`) est inchangée.

## Catalogue

### 🛰️ Reconnaissance DNS (9)

| id | Ce qui est réellement vérifié |
|---|---|
| `dns` | A/AAAA/NS/MX/TXT/CNAME/SOA via DNS-over-HTTPS Cloudflare · signale les IP RFC 1918 publiées et le NS unique |
| `dnssec` | Enregistrements DS + drapeau AD du résolveur |
| `caa` | Autorités de certification autorisées pour le domaine |
| `dns_inverse` | Résolution PTR des adresses IPv4 → hébergeur réel |
| `sous_domaines` | Sous-domaines extraits des journaux de transparence (crt.sh) puis **résolus** un par un ; marque les environnements hors production |
| `certificats` | Certificats réellement émis : autorités, jokers, date d'expiration la plus récente |
| `takeover` | CNAME pendants vers 19 services SaaS (GitHub Pages, Heroku, S3, Azure, Netlify, Vercel…) avec confirmation NXDOMAIN |
| `typosquat` | Variantes typographiques (transposition, omission, doublement, homoglyphes, TLD) générées puis résolues ; alerte renforcée si MX présent |
| `reputation` | Spamhaus DBL (domaine) et ZEN (adresse IP) ; dégrade honnêtement si le résolveur est bloqué |

### ✉️ Sécurité du courriel (2)

| id | Ce qui est réellement vérifié |
|---|---|
| `courriel_auth` | SPF (qualificateur `all`, dépassement de la limite RFC 7208 de 10 recherches), 13 sélecteurs DKIM courants, politique DMARC (`p=`, `rua=`, `pct=`) |
| `courriel_transport` | MTA-STS (enregistrement + politique `.well-known` et son mode), TLS-RPT, BIMI |

### 🌐 Surface web (11)

| id | Ce qui est réellement vérifié |
|---|---|
| `entetes` | CSP (dont `unsafe-inline`, `unsafe-eval`, joker), HSTS (`max-age`, `includeSubDomains`), clickjacking, nosniff, Referrer-Policy, Permissions-Policy, divulgation `Server`/`X-Powered-By` |
| `tls` | Handshake TLS réel, redirection HTTP→HTTPS, statut de préchargement HSTS (hstspreload.org) |
| `cors` | Origine piégée envoyée puis reflet observé ; distingue reflet, joker + credentials, joker seul |
| `temoins` | `Set-Cookie` réels : Secure, HttpOnly, SameSite |
| `methodes_http` | OPTIONS → `Allow` ; signale PUT/DELETE/TRACE/CONNECT/PATCH |
| `robots` | `robots.txt` + `sitemap.xml` ; signale les chemins sensibles divulgués par les règles Disallow |
| `security_txt` | RFC 9116 : présence, champ `Contact`, validité du champ `Expires` |
| `technologies` | En-têtes + signatures HTML (WordPress, Next.js, Nuxt, Angular, React, Drupal, Shopify, Wix, Laravel, Supabase, Firebase…) ; signale les versions divulguées |
| `contenu_mixte` | Ressources `http://` sur page HTTPS, formulaires postant en clair, champ mot de passe hors HTTPS |
| `sri` | Scripts et feuilles tiers sans `integrity` + inventaire des origines externes |
| `loi25` | Politique de confidentialité (lien ou 6 chemins testés), bandeau de consentement, 9 familles de traceurs, mention du responsable de la protection des RP |

### 🔦 Exposition publique (2)

| id | Ce qui est réellement vérifié |
|---|---|
| `secrets_client` | Téléchargement du HTML + jusqu'à 8 paquets JS de même origine, puis recherche de 12 familles de clés (AWS, Stripe live, Anthropic, OpenAI, GitHub, Slack, SendGrid, Google, Mailgun, Twilio, clé privée) et de JWT `service_role`. **Les valeurs sont masquées dans la preuve** ; la clé anon Supabase, publique par conception, n'est pas signalée à tort. |
| `archives` | Wayback Machine (API CDX) : empreinte historique + URL sensibles archivées (`.env`, `.sql`, sauvegardes, `wp-config`…) |

### ⚡ Sondage actif léger (5) — autorisation requise

| id | Ce qui est réellement vérifié |
|---|---|
| `fichiers_exposes` | 23 chemins (`.env`, `.git/config`, `.npmrc`, `.aws/credentials`, `id_rsa`, `backup.zip`, `dump.sql`, `phpinfo.php`…) **confirmés par signature de contenu**, ce qui écarte les faux positifs des SPA renvoyant 200 pour tout |
| `panneaux_admin` | 13 consoles et points de diagnostic ; un 401/403 est rapporté comme preuve d'existence, un 200 exige une signature |
| `ports_web` | 12 ports HTTP/HTTPS hors 80/443 ; déclare explicitement qu'un balayage TCP complet est hors périmètre |
| `services_donnees` | Elasticsearch, Kibana, CouchDB, Prometheus, Grafana, RabbitMQ, API Docker, InfluxDB — ouverts ou authentifiés |
| `redirection_ouverte` | 12 paramètres de redirection testés avec une destination témoin ; confirmé par l'en-tête `Location` |

### 🗄️ Posture interne (9) — base ti-lex

| id | Ce qui est réellement vérifié |
|---|---|
| `rls` | RLS par table du schéma public (RPC `silex_rls_summary`) |
| `politiques_rls` | Tables avec RLS mais **zéro** politique, et tables à empilement de politiques |
| `anon_exposition` | **Tente réellement** de lire chaque table avec la clé anon publique. Une table qui renvoie des lignes est une exposition prouvée, pas une hypothèse. |
| `buckets` | Buckets Supabase Storage marqués publics |
| `fonctions_exposees` | Fonctions exécutables par `anon`, en distinguant les `SECURITY DEFINER` qui contournent RLS |
| `extensions` | Extensions installées dans le schéma `public` |
| `comptes_auth` | Agrégats : comptes sans MFA vérifié, courriels non confirmés, dormants > 90 jours |
| `journalisation` | Fraîcheur réelle de `audit_events` sur 7 jours |
| `limitation_debit` | RPC `check_rate_limit` fonctionnelle + fenêtres enregistrées |

### 🌑 Fuites de données (2)

| id | Ce qui est réellement vérifié |
|---|---|
| `hibp` | Have I Been Pwned : recherche par **adresse** (clé API requise) ou par **domaine** (endpoint public). Sans clé, le moteur le dit — il n'invente rien. |
| `portee_externe` | Déclaration explicite des trois limites : CVE, nmap, dark web |

## Profils

Le profil est un ensemble de moteurs. Décocher un moteur bascule la sélection en
mode « personnalisé » et le scan envoie alors la liste exacte.

| Profil | Moteurs |
|---|---|
| 🔍 Reconnaissance passive | 8 |
| 🌐 Scan web | 11 |
| ✉️ Sécurité du courriel | 5 |
| 🛰️ Surface d'attaque | 7 |
| ⚙️ Audit de configuration | 9 |
| 🛡️ Vulnérabilités | 10 |
| ⚡ Sondage actif léger | 5 |
| 🌑 Fuites et exposition publique | 5 |
| 🔰 Audit complet | 40 |

## API

```jsonc
// POST /functions/v1/security-agent
{
  "target": "exemple.com",
  "scan_type": "web_scan",              // profil, ou "personnalise"
  "moteurs": ["entetes", "cors", "tls"], // prioritaire sur scan_type
  "authorization_id": "…"                // mandat / SOW
}

// Catalogue (pour construire un sélecteur)
{ "action": "catalogue" }
```

Réponse : `findings[]` (chacun avec `moteur`, `preuve`, `cwe_ids`),
`moteurs_journal[]` (statut, nombre de constats et durée par moteur),
`severity_counts`, `executive_summary`.

Un moteur qui échoue n'interrompt pas le scan : il est journalisé et un constat
`info` le signale. Le budget global est de 110 s, 5 moteurs en parallèle.

## Base de données

Migration `0063_moteurs_cyber_reels.sql` :

- colonnes de traçabilité sur `cyber_scans`, `cyber_findings`, `security_findings`
  (`moteur`, `preuve`, `mode`, `moteurs`, `engine_version`) ;
- RPC de posture, toutes `security definer` et réservées à `service_role` :
  `silex_rls_summary`, `silex_buckets_stockage`, `silex_fonctions_exposees`,
  `silex_comptes_auth`, `silex_extensions_publiques`, `silex_journalisation`.

## Cohérence des deux catalogues

```bash
npm run verifier:moteurs
```

Vérifie que `js/moteurs-cyber.js` et `_shared/moteurs-cyber.ts` déclarent les
mêmes moteurs, les mêmes profils, et qu'aucun moteur défini n'a été oublié dans
le registre.
