# Guide de formation des employés — Protection des renseignements personnels

**Organisme :** ti-lex-AL Inc.
**Version :** 1.0
**Date :** _______________
**Public cible :** Tous les employés, contractuels et collaborateurs

---

## 1. Introduction

La protection des renseignements personnels (RP) est une obligation légale au Québec en vertu de la **Loi 25** (Loi modernisant des dispositions législatives en matière de protection des renseignements personnels). Ce guide présente vos obligations et les bonnes pratiques à adopter.

## 2. Qu'est-ce qu'un renseignement personnel ?

Un RP est **tout renseignement qui concerne une personne physique et permet de l'identifier**, directement ou indirectement.

### Exemples de RP :
- Nom, prénom
- Adresse courriel
- Adresse IP
- Numéro de téléphone
- Données de localisation
- Contenu des conversations avec l'IA
- Informations de paiement
- Identifiants de compte

### Ce qui n'est PAS un RP :
- Données anonymisées (impossible de relier à une personne)
- Données agrégées/statistiques
- Informations sur une entreprise (personne morale)

## 3. Vos obligations en tant qu'employé

### 3.1 Confidentialité
- **Ne jamais** accéder aux RP d'un utilisateur sans justification professionnelle légitime.
- **Ne jamais** partager les RP avec des personnes non autorisées (internes ou externes).
- **Ne jamais** copier des RP sur des supports non sécurisés (clé USB, courriel personnel, etc.).

### 3.2 Minimisation
- Ne collecter que les RP **strictement nécessaires** à la tâche.
- Ne pas conserver de copies locales de RP au-delà du besoin immédiat.

### 3.3 Sécurité
- Utiliser des **mots de passe forts** et uniques pour chaque système.
- Activer l'**authentification à deux facteurs (2FA)** sur tous les comptes professionnels.
- **Verrouiller** votre poste de travail lorsque vous vous absentez.
- Ne jamais accéder aux systèmes depuis un réseau Wi-Fi public non sécurisé.

## 4. Traitement par IA — Règles spécifiques

### 4.1 Anonymisation obligatoire
Avant toute transmission de données à l'API Claude :
- ✅ Supprimer les noms et prénoms
- ✅ Supprimer les adresses courriel
- ✅ Supprimer les numéros de téléphone
- ✅ Supprimer les numéros d'identification (NAS, permis, etc.)
- ✅ Remplacer par des identifiants génériques (« Utilisateur A », « Client 123 »)

### 4.2 Ce qu'il ne faut JAMAIS envoyer à l'API
- ❌ Noms réels d'utilisateurs
- ❌ Adresses courriel
- ❌ Données bancaires ou de carte de crédit
- ❌ Numéros d'assurance sociale
- ❌ Informations médicales
- ❌ Données judiciaires

### 4.3 Clés API et secrets
- **Jamais** de clé API dans le code frontend (visible par les utilisateurs)
- Toutes les clés transitent par les **Edge Functions Supabase**
- Signaler immédiatement toute exposition accidentelle de clé

## 5. Incidents de confidentialité

### 5.1 Qu'est-ce qu'un incident ?
- Accès non autorisé à des RP
- Perte ou vol d'un appareil contenant des RP
- Envoi de RP au mauvais destinataire
- Faille de sécurité exploitée
- Exposition accidentelle de données (ex. : clé API compromise)

### 5.2 Que faire ?

**Immédiatement :**
1. **Ne pas tenter** de corriger seul — cela peut aggraver la situation
2. **Aviser** le Responsable PRP dans les **plus brefs délais**
3. **Documenter** ce qui s'est passé : quoi, quand, comment, données touchées
4. **Préserver** les preuves (captures d'écran, journaux)

**Le Responsable PRP se charge ensuite de :**
- Évaluer la gravité de l'incident
- Notifier la CAI si un préjudice sérieux est possible
- Aviser les personnes concernées
- Consigner l'incident au registre (conservation 5 ans)

## 6. Droits des utilisateurs

Les utilisateurs de ti-lex-AL ont les droits suivants sous la Loi 25 :

| Droit | Description | Délai de réponse |
|---|---|---|
| **Accès** | Consulter leurs RP | 30 jours |
| **Rectification** | Corriger des RP inexacts | 30 jours |
| **Suppression** | Demander l'effacement de leurs RP | 30 jours |
| **Portabilité** | Recevoir leurs données dans un format structuré | 30 jours |
| **Retrait du consentement** | Cesser le traitement de leurs RP | Immédiat |

### Que faire si un utilisateur exerce un droit ?
1. Transmettre la demande au Responsable PRP
2. Ne pas traiter la demande vous-même
3. Ne pas ignorer ou retarder la demande

## 7. Bonnes pratiques quotidiennes

### ✅ À faire
- Vérifier que les accès sont à jour (principe du moindre privilège)
- Supprimer les données temporaires après utilisation
- Signaler toute situation suspecte
- Suivre la formation de mise à jour annuelle
- Utiliser les canaux sécurisés pour communiquer des RP

### ❌ À éviter
- Discuter de RP dans des canaux publics (Slack ouvert, etc.)
- Stocker des RP dans des fichiers non chiffrés
- Partager vos accès ou mots de passe
- Utiliser des outils non approuvés pour traiter des RP
- Ignorer les mises à jour de sécurité

## 8. Sanctions

Le non-respect des obligations en matière de protection des RP peut entraîner :
- Des mesures disciplinaires internes
- Des amendes administratives imposées par la CAI (jusqu'à **25 M$** ou **4 % du chiffre d'affaires mondial**)
- Des poursuites pénales dans les cas les plus graves

## 9. Attestation de formation

Je, soussigné(e), confirme avoir lu et compris le présent guide de formation sur la protection des renseignements personnels.

**Nom :** _______________
**Fonction :** _______________
**Date :** _______________
**Signature :** _______________

---

*Ce guide doit être relu et mis à jour annuellement. Toute question peut être adressée au Responsable de la protection des renseignements personnels.*
