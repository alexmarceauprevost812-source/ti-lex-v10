# ti-lex Security Agent — Guide de déploiement

Agent de cybersécurité défensive intégré à la plateforme ti-lex. **100 % légal au Québec**, conforme Loi 25, avec guardrails cryptographiques.

## 🚨 Pourquoi tu voyais "Modèle ou ressource introuvable"

Le code précédent utilisait probablement un vieux nom de modèle Claude (genre `claude-3-opus-20240229` ou `claude-3-5-sonnet-20240620`). Ces modèles n'existent plus depuis longtemps. Ce code utilise les **modèles 2026** :

- `claude-opus-4-7` ⭐ (par défaut — le plus capable)
- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-haiku-4-5-20251001` (plus rapide / moins cher)

Le code valide le nom du modèle au démarrage et renvoie un message clair si tu en mets un mauvais.

## 📁 Structure des fichiers

```
ti-lex-security-agent/
├── supabase/
│   ├── functions/security-agent/
│   │   ├── index.ts                 # Edge function principale
│   │   └── deno.json                # Config Deno
│   └── migrations/
│       └── 20260521000000_security_agent.sql  # Schéma BD
├── app/
│   ├── agents/security/page.tsx     # UI Next.js
│   └── api/security-agent/route.ts  # Route API alternative
└── lib/
    └── security-agent.ts            # Client TypeScript
```

## 🚀 Déploiement (étape par étape)

### 1. Variables d'environnement

Dans **`.env.local`** (Next.js) :
```bash
NEXT_PUBLIC_SUPABASE_URL=https://rnuripmfozlxenryxhdc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ta_clé_anon
SUPABASE_SERVICE_ROLE_KEY=ta_clé_service_role
ANTHROPIC_API_KEY=sk-ant-...
SECURITY_AGENT_MODEL=claude-opus-4-7
```

Dans les **secrets de l'edge function Supabase** :
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set SECURITY_AGENT_MODEL=claude-opus-4-7
```

### 2. Appliquer la migration SQL

```bash
# Via Supabase CLI lié au projet rnuripmfozlxenryxhdc
supabase db push

# OU coller directement dans le SQL Editor du dashboard Supabase
```

### 3. Déployer l'edge function

```bash
supabase functions deploy security-agent --project-ref rnuripmfozlxenryxhdc
```

### 4. Installer les dépendances Next.js

```bash
pnpm add @anthropic-ai/sdk @supabase/supabase-js
```

### 5. Tester

Crée d'abord une autorisation de test (SQL Editor Supabase) :
```sql
INSERT INTO security_authorizations (
  user_id, client_name, client_email, client_signatory_name,
  client_signatory_title, allowed_targets, allowed_techniques,
  valid_from, valid_until, sow_hash
) VALUES (
  auth.uid(),
  'Test Client ti-lex',
  'test@ti-lex.com',
  'Alex Marceau Prevost',
  'CEO',
  '["scanme.nmap.org", "testphp.vulnweb.com"]'::jsonb,
  '["passive_recon", "web_scan", "vuln_scan"]'::jsonb,
  NOW(),
  NOW() + INTERVAL '30 days',
  'test_hash_initial'
);
```

Puis va sur `/agents/security` et lance un scan.

## 🛡️ Guardrails en place

1. **Allowlist de cibles** : la fonction SQL `verify_scan_authorization` refuse tout scan hors-scope.
2. **Fenêtre temporelle** : un SOW expire automatiquement.
3. **Kill switch** : `killAuthorization()` révoque immédiatement.
4. **Audit log immutable** : hash chain SHA-256, triggers BD qui bloquent UPDATE/DELETE.
5. **Techniques destructives bloquées par défaut** : DoS, social engineering, exfiltration.

## 🇨🇦 Conformité légale

- ✅ Aucun scan sans SOW signé (art. 342.1 C.cr.)
- ✅ Audit log conservé > 5 ans (Loi 25)
- ✅ Données client en région ca-central-1 / Beauharnois
- ✅ Anonymisation avant envoi à Claude API
- ⚠️ Anthropic est aux États-Unis : à documenter dans ton EFVP Loi 25

## 🔧 Si tu revois encore "Modèle introuvable"

Vérifie dans cet ordre :
1. `SECURITY_AGENT_MODEL` est bien défini dans Supabase secrets ET `.env.local`
2. Le nom du modèle est exactement un de ceux de la liste `VALID_MODELS`
3. `ANTHROPIC_API_KEY` est valide et a accès au modèle
4. Redéploie l'edge function après changement : `supabase functions deploy security-agent`

## 📞 Prochaines étapes

- Brancher Nuclei + Subfinder réels (remplacer `simulateScanModules`)
- Ajouter export PDF du rapport (via le skill `pdf`)
- Connecter au programme YesWeHack du gouvernement du Québec pour le bug bounty
- Souscrire l'assurance E&O cyber (2-5 M$, ~5 k$/an)

— Produit du Québec 🌊
