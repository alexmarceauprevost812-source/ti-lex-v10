# ti-lex Security Agent — Guide de deploiement

Agent de cybersecurite defensive integre a la plateforme ti-lex. **100 % legal au Quebec**, conforme Loi 25, avec guardrails cryptographiques.

## Modeles Claude 2026 supportes

- `claude-opus-4-8` (par defaut — le plus capable)
- `claude-opus-4-7`
- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-haiku-4-5-20251001` (plus rapide / moins cher)

Le code valide le nom du modele au demarrage et utilise le defaut si la variable est absente ou invalide.

## Structure des fichiers

```
ti-lex-security-agent/
├── supabase/
│   ├── functions/security-agent/
│   │   └── index.ts                 # Edge Function (recon passive reelle)
│   └── migrations/
│       └── 20260521000000_security_agent.sql  # Schema BD initial
├── app/
│   ├── layout.tsx                   # Layout Next.js
│   ├── page.tsx                     # Page d'accueil (redirige vers l'agent)
│   └── agents/security/page.tsx     # UI de l'agent de securite
├── lib/
│   └── security-agent.ts           # Client TypeScript
└── combat/
    └── components/CombatUI.tsx
```

Migrations consolidees (dossier racine `supabase/migrations/`) :
- `0001_rate_limit.sql` — table ai_usage pour le rate limiting
- `0002_security_fixes_and_is_admin.sql` — correctifs securite + is_admin()
- `0003_security_schema_corrected.sql` — schema SOW corrige (normalisation cibles, immutabilite, scellage hash)

## Deploiement

### 1. Variables d'environnement

Dans les **secrets de l'Edge Function Supabase** :
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set SECURITY_AGENT_MODEL=claude-opus-4-8
```

Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectees automatiquement par Supabase dans les Edge Functions.

### 2. Appliquer les migrations SQL

```bash
# Via Supabase CLI lie au projet rnuripmfozlxenryxhdc
supabase db push

# OU coller directement dans le SQL Editor du dashboard Supabase
```

### 3. Deployer l'Edge Function

```bash
supabase functions deploy security-agent --project-ref rnuripmfozlxenryxhdc
```

### 4. Tester

Creer une autorisation de test (SQL Editor Supabase) :
```sql
INSERT INTO security_authorizations (
  client_name, client_email, client_signatory_name,
  client_signatory_title, allowed_targets, allowed_techniques,
  valid_from, valid_until, sow_hash
) VALUES (
  'Test Client ti-lex',
  'test@ti-lex.com',
  'Alex Marceau Prevost',
  'CEO',
  '["scanme.nmap.org"]'::jsonb,
  '["web_scan", "passive_recon"]'::jsonb,
  NOW(),
  NOW() + INTERVAL '30 days',
  'initial_client_side_hash_test'
);
```

Note : le `sow_hash` doit commencer par `initial_client_side_hash_` (placeholder). L'Edge Function le remplacera par le SHA-256 final apres le scan. Une fois scelle, il ne peut plus etre modifie.

Puis va sur `/agents/security` et lance un scan.

## Reconnaissance passive reelle

L'Edge Function collecte des donnees publiques en parallele :

| Module | Source | Methode |
|--------|--------|---------|
| DNS | Google DNS-over-HTTPS | A, AAAA, MX, TXT, NS |
| HTTP | GET direct (redirect: manual) | Headers de securite, serveur |
| robots.txt | GET public | Contenu tronque a 4000 chars |

Aucun scan de ports actif, aucune tentative d'exploitation. Le modele Claude analyse uniquement les preuves collectees et produit un rapport defensif en JSON.

## Guardrails en place

1. **Allowlist de cibles** : `verify_scan_authorization()` normalise la cible (schema, port, chemin, casse) et refuse tout scan hors-scope.
2. **Fenetre temporelle** : un SOW expire automatiquement (`valid_from` / `valid_until`).
3. **Immutabilite du SOW** : trigger `enforce_sow_immutability` gele tous les termes du mandat apres creation. Le hash est scellable une seule fois (placeholder -> SHA-256 64 hex).
4. **Suppression bloquee** : trigger `prevent_sealed_sow_delete` empeche la suppression d'un mandat scelle.
5. **Audit log immutable** : hash chain SHA-256, triggers BD qui bloquent UPDATE/DELETE.
6. **RLS** : chaque utilisateur voit uniquement ses propres mandats (`insert_own_sow`, `select_own_sow`).
7. **Hash du rapport** : SHA-256 couvrant mandat + preuves + rapport + horodatage.

## Conformite legale

- Aucun scan sans SOW signe (art. 342.1 C.cr.)
- Audit log conserve > 5 ans (Loi 25)
- Donnees client en region ca-central-1 / Beauharnois
- Anonymisation avant envoi a Claude API
- Anthropic est aux Etats-Unis : a documenter dans l'EFVP Loi 25

## Depannage

Si l'Edge Function retourne une erreur :

1. Verifier que `ANTHROPIC_API_KEY` est defini dans les secrets Supabase
2. Verifier que `SECURITY_AGENT_MODEL` est un modele valide de la liste ci-dessus
3. Verifier que la migration `0003_security_schema_corrected.sql` a ete appliquee
4. Redeployer l'Edge Function : `supabase functions deploy security-agent`
5. Consulter les logs : `supabase functions logs security-agent`

## Prochaines etapes

- Ajouter export PDF du rapport
- Connecter au programme bug bounty du gouvernement du Quebec
- Souscrire l'assurance E&O cyber (2-5 M$)

---

**Alex Marceau Prevost** — 17 juin 1994 — Quebec, Canada
Fait au Quebec
