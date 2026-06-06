# Entente de traitement des données (DPA)

**Entre :** ti-lex-AL Inc. (« le Responsable »)
**Et :** Anthropic, PBC (« le Sous-traitant »)

**Date d'entrée en vigueur :** _______________

---

## 1. Objet

La présente Entente de traitement des données (« DPA ») régit le traitement des renseignements personnels (« RP ») effectué par le Sous-traitant pour le compte du Responsable dans le cadre de l'utilisation de l'API Claude, conformément à la Loi 25 du Québec (Loi sur la protection des renseignements personnels dans le secteur privé, RLRQ c P-39.1).

## 2. Définitions

- **Renseignements personnels (RP)** : Tout renseignement qui concerne une personne physique et permet de l'identifier, au sens de l'article 2 de la Loi sur le privé.
- **Traitement** : Toute opération sur des RP, incluant la collecte, l'utilisation, la communication, la conservation et la destruction.
- **Incident de confidentialité** : Accès, utilisation, communication non autorisés, ou perte d'un RP.

## 3. Nature et finalité du traitement

| Élément | Description |
|---|---|
| **Type de données** | Requêtes textuelles anonymisées des utilisateurs |
| **Catégories de personnes** | Utilisateurs de la plateforme ti-lex-AL |
| **Finalité** | Traitement par l'IA (API Claude) pour générer des réponses |
| **Durée** | Durée de la session API uniquement — aucune rétention par Anthropic (Zero Data Retention) |
| **Territoire** | Transfert vers les États-Unis (art. 17, Loi sur le privé) |

## 4. Obligations du Sous-traitant

Le Sous-traitant s'engage à :

### 4.1 Confidentialité
- Traiter les RP uniquement selon les instructions documentées du Responsable.
- Ne pas utiliser les RP à d'autres fins, incluant l'entraînement de modèles d'IA.
- Assurer que les personnes autorisées à traiter les RP sont soumises à une obligation de confidentialité.

### 4.2 Sécurité (art. 10, Loi sur le privé)
- Mettre en œuvre des mesures techniques et organisationnelles appropriées :
  - Chiffrement TLS 1.2+ en transit
  - Chiffrement AES-256 au repos
  - Contrôles d'accès basés sur les rôles
  - Journalisation des accès
  - Tests de pénétration réguliers

### 4.3 Sous-traitance ultérieure
- Ne pas faire appel à un autre sous-traitant sans l'autorisation préalable écrite du Responsable.
- Informer le Responsable de tout changement de sous-traitant.

### 4.4 Incidents de confidentialité (art. 3.5-3.7)
- Aviser le Responsable dans les **24 heures** suivant la découverte d'un incident de confidentialité.
- Fournir toute information nécessaire pour que le Responsable remplisse ses obligations de notification à la CAI et aux personnes concernées.

### 4.5 Droits des personnes concernées
- Assister le Responsable dans le respect des droits d'accès, de rectification, de suppression et de portabilité (art. 27-28, 37-40).

### 4.6 Audit
- Permettre au Responsable ou à un auditeur tiers mandaté de vérifier la conformité aux obligations de la présente DPA.
- Fournir les rapports SOC 2 Type II et certifications pertinentes sur demande.

## 5. Obligations du Responsable

Le Responsable s'engage à :

- **Anonymiser** les données avant transmission à l'API (suppression de noms, adresses, numéros d'identification).
- Obtenir le **consentement** valide des utilisateurs pour le traitement par IA et le transfert hors Québec.
- Maintenir un **registre des traitements** conforme à la Loi 25.
- Réaliser une **EFVP** avant tout nouveau traitement impliquant un transfert hors Québec.

## 6. Transfert hors Québec (art. 17)

Le Responsable confirme avoir réalisé une Évaluation des facteurs relatifs à la vie privée (EFVP) conformément à l'article 17 de la Loi sur le privé et atteste que :

- Le transfert bénéficie d'un niveau de protection **adéquate** compte tenu des mesures contractuelles et techniques en place.
- Les données sont **anonymisées** avant transfert.
- La politique **Zero Data Retention** d'Anthropic élimine le risque de conservation non autorisée.
- Une **entente contractuelle** (la présente DPA) encadre le transfert.

## 7. Durée et résiliation

- La présente DPA entre en vigueur à la date de signature et demeure en vigueur tant que le Sous-traitant traite des RP pour le compte du Responsable.
- À la résiliation, le Sous-traitant doit, au choix du Responsable, détruire ou retourner tous les RP dans un délai de **30 jours**.

## 8. Droit applicable

La présente entente est régie par les lois du Québec et du Canada.

## 9. Signatures

| | Responsable | Sous-traitant |
|---|---|---|
| **Nom** | _______________ | _______________ |
| **Titre** | _______________ | _______________ |
| **Date** | _______________ | _______________ |
| **Signature** | _______________ | _______________ |

---

*Ce document est un modèle et doit être adapté et validé par un conseiller juridique avant utilisation.*
