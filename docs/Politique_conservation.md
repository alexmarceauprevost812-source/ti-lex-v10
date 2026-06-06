# Politique de conservation et de destruction des renseignements personnels

**Organisme :** ti-lex-AL Inc.
**Version :** 1.0
**Date d'entrée en vigueur :** _______________
**Référence légale :** Loi sur le privé (RLRQ c P-39.1), art. 12, 13, 23, 27, 28

---

## 1. Objet

La présente politique définit les règles de conservation et de destruction des renseignements personnels (RP) collectés et traités par ti-lex-AL, conformément à la Loi 25 du Québec.

## 2. Principes directeurs

1. **Minimisation** : Ne conserver que les RP nécessaires aux finalités identifiées.
2. **Limitation de la durée** : Détruire les RP dès que la finalité est atteinte.
3. **Sécurité** : Assurer la protection des RP durant toute la période de conservation.
4. **Traçabilité** : Documenter les opérations de destruction.

## 3. Calendrier de conservation

| Catégorie de RP | Support | Durée de conservation | Justification | Mode de destruction |
|---|---|---|---|---|
| **Données de compte** (courriel, nom) | Supabase (cloud) | Durée abonnement + 12 mois | Service client post-résiliation | Suppression logique puis physique |
| **Conversations IA** | localStorage (navigateur) | Contrôlé par l'utilisateur | Autonomie de l'utilisateur | Suppression via interface ou navigateur |
| **Mémoire / Codex** | localStorage (navigateur) | Contrôlé par l'utilisateur | Personnalisation | Suppression via interface ou navigateur |
| **Données de paiement** | Stripe | Durée abonnement + 6 ans | Obligations fiscales (Loi sur les impôts) | Destruction automatique par Stripe |
| **Historique de facturation** | Supabase | 6 ans après la transaction | Obligations comptables | Suppression automatisée |
| **Journaux techniques** | Supabase | 90 jours | Sécurité et débogage | Purge automatisée |
| **Requêtes IA (Anthropic)** | API Anthropic | 0 jour (Zero Data Retention) | Aucune conservation | Non applicable |
| **Jetons OAuth** | localStorage | Jusqu'à révocation | Intégrations actives | Suppression à la déconnexion |
| **Données d'EFVP** | Stockage interne | 2 ans après la fin du traitement | Démonstration de conformité | Destruction sécurisée |
| **Registre des incidents** | Stockage interne | 5 ans après l'incident | Obligation légale (art. 3.8) | Destruction sécurisée |

## 4. Procédures de destruction

### 4.1 Données numériques (cloud/serveur)
- **Suppression logique** : marquage comme supprimé, exclusion des requêtes
- **Suppression physique** : effacement définitif après la période tampon (30 jours)
- **Vérification** : confirmation par journal d'audit

### 4.2 Données côté client (localStorage)
- L'utilisateur peut supprimer ses données à tout moment via :
  - Bouton « Supprimer toutes mes données » dans les paramètres
  - Exportation préalable disponible (format JSON)
  - Retrait du consentement (suppression automatique + redirection)

### 4.3 Données chez les sous-traitants
- **Anthropic** : Zero Data Retention — aucune donnée conservée
- **Stripe** : Conformité PCI DSS, destruction selon leur politique de rétention
- **Supabase** : Suppression sur demande via API admin

## 5. Demandes de suppression

### 5.1 Processus
1. L'utilisateur soumet une demande via l'interface (bouton dédié) ou par courriel à privacy@ti-lex.ca
2. Vérification de l'identité du demandeur
3. Suppression dans un délai maximal de **30 jours**
4. Confirmation écrite envoyée à l'utilisateur

### 5.2 Exceptions à la suppression
Les RP suivants peuvent être conservés malgré une demande de suppression :
- Données requises par une obligation légale (ex. : données fiscales — 6 ans)
- Données nécessaires à la défense de droits dans le cadre d'un litige
- Données anonymisées (qui ne constituent plus des RP)

## 6. Anonymisation

Lorsque les données sont conservées à des fins statistiques au-delà de la durée de conservation :
- Suppression irréversible de tout identifiant direct ou indirect
- Agrégation des données (minimum 10 individus par groupe)
- Impossibilité de ré-identification confirmée par test

## 7. Responsabilités

| Rôle | Responsabilité |
|---|---|
| **Responsable PRP** | Supervise l'application de la politique |
| **Équipe technique** | Implémente les mécanismes de suppression automatisée |
| **Sous-traitants** | Respectent les durées contractuelles (DPA) |

## 8. Révision

La présente politique est révisée **annuellement** ou lors de tout changement significatif aux traitements.

---

*Ce document est un modèle et doit être adapté et validé par un conseiller juridique avant utilisation.*
