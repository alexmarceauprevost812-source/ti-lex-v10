# Registre des activités de traitement des renseignements personnels

**Organisme :** ti-lex-AL Inc.
**Responsable PRP :** _________________
**Date de mise à jour :** _______________
**Référence légale :** Loi sur la protection des renseignements personnels dans le secteur privé (RLRQ c P-39.1), articles 3.2, 12, 13

---

## Traitement n° 1 — Gestion des comptes utilisateurs

| Champ | Description |
|---|---|
| **Finalité** | Création et gestion des comptes utilisateurs |
| **Base légale** | Consentement explicite (art. 14) |
| **Catégories de personnes** | Utilisateurs de la plateforme |
| **Catégories de RP** | Adresse courriel, nom d'affichage, préférences linguistiques |
| **Source** | Collecte directe auprès de l'utilisateur |
| **Destinataires** | Supabase (hébergement auth), ti-lex-AL (administration) |
| **Transfert hors QC** | Oui — Supabase (AWS us-east-1) |
| **Mesures art. 17** | EFVP réalisée, chiffrement, DPA en place |
| **Durée de conservation** | Durée de l'abonnement + 12 mois |
| **Mesures de sécurité** | Chiffrement TLS/AES-256, RLS PostgreSQL, auth JWT |

---

## Traitement n° 2 — Traitement par intelligence artificielle

| Champ | Description |
|---|---|
| **Finalité** | Traitement des requêtes utilisateurs par l'API Claude |
| **Base légale** | Consentement explicite (art. 14), incluant transfert hors QC |
| **Catégories de personnes** | Utilisateurs actifs de la plateforme |
| **Catégories de RP** | Requêtes textuelles (anonymisées avant envoi) |
| **Source** | Saisie directe par l'utilisateur |
| **Destinataires** | Anthropic, PBC (API Claude) |
| **Transfert hors QC** | Oui — États-Unis (Anthropic) |
| **Mesures art. 17** | EFVP réalisée, anonymisation, Zero Data Retention, DPA |
| **Durée de conservation** | Aucune rétention par Anthropic ; localStorage côté client |
| **Mesures de sécurité** | Anonymisation pré-envoi, TLS 1.2+, clé API sécurisée via Edge Function |

---

## Traitement n° 3 — Gestion des abonnements et paiements

| Champ | Description |
|---|---|
| **Finalité** | Traitement des abonnements et facturation |
| **Base légale** | Exécution du contrat de service |
| **Catégories de personnes** | Utilisateurs abonnés (Starter, Pro, Industriel) |
| **Catégories de RP** | Courriel, identifiant client Stripe, historique de paiement |
| **Source** | Collecte directe et Stripe |
| **Destinataires** | Stripe, Inc. (processeur de paiement) |
| **Transfert hors QC** | Oui — Stripe (États-Unis) |
| **Mesures art. 17** | Stripe certifié PCI DSS Level 1, DPA Stripe |
| **Durée de conservation** | Durée de l'abonnement + durée légale fiscale (6 ans) |
| **Mesures de sécurité** | PCI DSS, tokenisation, aucune donnée bancaire stockée par ti-lex-AL |

---

## Traitement n° 4 — Mémoire contextuelle et codex

| Champ | Description |
|---|---|
| **Finalité** | Personnalisation de l'expérience utilisateur |
| **Base légale** | Consentement explicite |
| **Catégories de personnes** | Utilisateurs actifs |
| **Catégories de RP** | Notes personnelles, entrées de codex, préférences |
| **Source** | Saisie directe par l'utilisateur |
| **Destinataires** | Aucun — stockage local uniquement (localStorage) |
| **Transfert hors QC** | Non |
| **Durée de conservation** | Contrôlée par l'utilisateur (suppression à volonté) |
| **Mesures de sécurité** | Stockage local dans le navigateur, aucune transmission serveur |

---

## Traitement n° 5 — Journaux techniques et analytiques

| Champ | Description |
|---|---|
| **Finalité** | Surveillance de la performance, détection d'anomalies, sécurité |
| **Base légale** | Intérêt légitime (sécurité du service) |
| **Catégories de personnes** | Tous les visiteurs et utilisateurs |
| **Catégories de RP** | Adresse IP, user-agent, horodatages, codes d'erreur |
| **Source** | Collecte automatique |
| **Destinataires** | Supabase (logs), infrastructure interne |
| **Transfert hors QC** | Oui — Supabase (AWS) |
| **Mesures art. 17** | Logs purgés après 90 jours, accès restreint |
| **Durée de conservation** | 90 jours |
| **Mesures de sécurité** | Accès restreint (rôle admin), chiffrement au repos |

---

## Traitement n° 6 — Intégrations tierces

| Champ | Description |
|---|---|
| **Finalité** | Connexion aux services externes (Google Calendar, Drive, Gmail) |
| **Base légale** | Consentement explicite par intégration |
| **Catégories de personnes** | Utilisateurs ayant activé une intégration |
| **Catégories de RP** | Jetons OAuth, données du service connecté (événements, fichiers, courriels) |
| **Source** | API tierces via consentement OAuth |
| **Destinataires** | Google LLC (selon intégration activée) |
| **Transfert hors QC** | Oui — selon le fournisseur tiers |
| **Mesures art. 17** | Consentement spécifique, jetons révocables, EFVP |
| **Durée de conservation** | Jetons révoqués à la déconnexion ; données non stockées |
| **Mesures de sécurité** | OAuth 2.0, jetons en localStorage, aucune copie serveur |

---

## Historique des mises à jour

| Date | Modification | Auteur |
|---|---|---|
| _____ | Création initiale du registre | _____ |
| | | |

---

*Ce registre doit être tenu à jour conformément à l'article 3.2 de la Loi sur le privé et être disponible sur demande de la CAI.*
