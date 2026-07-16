# Guide Utilisateur - BudgetBase
## Plateforme de Gestion Budgétaire

### Version 1.0 - Janvier 2025

---

## Table des Matières

1. [Introduction](#introduction)
2. [Première Connexion](#première-connexion)
3. [Interface Générale](#interface-générale)
4. [Modules Fonctionnels](#modules-fonctionnels)
5. [Gestion des Utilisateurs](#gestion-des-utilisateurs)
6. [Rapports et Analyses](#rapports-et-analyses)
7. [Bonnes Pratiques](#bonnes-pratiques)
8. [FAQ](#faq)
9. [Support](#support)

---

## Introduction

BudgetBase est une plateforme de gestion budgétaire conçue pour optimiser le suivi et la gestion des subventions, engagements, paiements et trésorerie. Cette solution permet une gestion centralisée et collaborative des finances de projet avec un contrôle rigoureux des flux financiers.

### Objectifs de la Plateforme

- **Centralisation** : Regrouper toutes les informations budgétaires en un seul endroit
- **Traçabilité** : Assurer un suivi complet de chaque transaction
- **Collaboration** : Permettre le travail en équipe avec des rôles définis
- **Conformité** : Respecter les procédures de validation et d'approbation
- **Transparence** : Offrir une visibilité complète sur l'utilisation des fonds

### Public Cible

- Coordinateurs de projets
- Responsables financiers
- Comptables
- Assistants administratifs
- Auditeurs et contrôleurs

---

## Première Connexion

### Création du Compte Administrateur

Lors de la première utilisation de BudgetBase :

1. **Accès à l'application** : Rendez-vous sur l'URL de votre instance BudgetBase
2. **Création du premier compte** : Cliquez sur "Créer un compte administrateur"
3. **Saisie des informations** :
   - Prénom et nom
   - Adresse email professionnelle
   - Fonction dans l'organisation
   - Matricule employé (optionnel)
   - Mot de passe sécurisé (minimum 6 caractères)

4. **Validation** : Le premier utilisateur obtient automatiquement les privilèges d'administrateur

### Connexion Standard

Pour les connexions suivantes :

1. **Email et mot de passe** : Saisissez vos identifiants
2. **Mot de passe oublié** : Utilisez le lien "Mot de passe oublié ?" pour recevoir un email de réinitialisation
3. **Réinitialisation** : Suivez le lien reçu par email pour définir un nouveau mot de passe

---

## Interface Générale

### Navigation Principale

L'interface est organisée autour d'une barre latérale contenant les modules principaux :

- **Tableau de Bord** : Vue d'ensemble des indicateurs clés
- **Gestion des Subventions** : Administration des financements
- **Planification Budgétaire** : Définition des lignes et sous-lignes budgétaires
- **Suivi Budgétaire** : Monitoring en temps réel de l'exécution
- **Gestion des Engagements** : Création et validation des engagements
- **Gestion des Paiements** : Traitement des paiements
- **État de Trésorerie** : Suivi des comptes bancaires
- **Préfinancements** : Gestion des avances entre comptes
- **Prêts Employés** : Administration des prêts au personnel
- **Rapports** : Génération d'analyses et d'états
- **Gestion des Utilisateurs** : Administration des comptes (admin uniquement)
- **Mon Profil** : Gestion du compte personnel

### Éléments d'Interface

- **Cartes de synthèse** : Affichage des indicateurs clés en haut de chaque module
- **Tableaux interactifs** : Listes avec fonctions de tri et filtrage
- **Formulaires modaux** : Saisie et modification des données
- **Boutons d'action** : Actions principales accessibles rapidement
- **Alertes visuelles** : Notifications pour les dépassements budgétaires

---

## Modules Fonctionnels

### 1. Tableau de Bord

**Objectif** : Vue d'ensemble de la situation budgétaire

**Fonctionnalités** :
- Indicateurs clés de performance (KPI)
- Subventions actives
- Répartition par ligne budgétaire
- Alertes budgétaires
- Engagements récents

**Utilisation** :
1. Consultez les cartes de synthèse pour un aperçu rapide
2. Analysez les graphiques de répartition
3. Vérifiez les alertes pour identifier les dépassements
4. Consultez les dernières activités

### 2. Gestion des Subventions

**Objectif** : Administration centralisée des financements

**Fonctionnalités** :
- Création de nouvelles subventions
- Modification des paramètres existants
- Gestion des comptes bancaires associés
- Suivi des statuts et échéances

**Procédure de création** :
1. Cliquez sur "Nouvelle Subvention"
2. Remplissez les informations obligatoires :
   - Nom du projet
   - Référence unique
   - Organisme financeur
   - Montant total notifié
   - Devise (EUR, USD, XOF)
   - Dates de début et fin
3. Ajoutez les informations bancaires (optionnel) :
   - Nom du compte
   - Numéro de compte
   - Nom de la banque
   - Solde initial
4. Validez la création

**Bonnes pratiques** :
- Utilisez des références uniques et parlantes
- Renseignez systématiquement les dates de projet
- Associez un compte bancaire dédié si possible

### 3. Planification Budgétaire

**Objectif** : Structuration hiérarchique du budget

**Concepts clés** :
- **Ligne budgétaire** : Catégorie principale (Personnel, Équipements, etc.)
- **Sous-ligne budgétaire** : Détail spécifique (Développeur Senior, Ordinateur portable, etc.)

**Procédure de planification** :

**Étape 1 : Création des lignes budgétaires**
1. Sélectionnez "Nouvelle Ligne Budgétaire"
2. Choisissez la subvention
3. Définissez le code et le nom
4. Saisissez le budget planifié
5. Sélectionnez une couleur d'affichage
6. Ajoutez une description

**Étape 2 : Création des sous-lignes budgétaires**
1. Sélectionnez "Nouvelle Sous-ligne"
2. Choisissez la ligne budgétaire parente
3. Définissez le code et le nom spécifiques
4. Répartissez le budget planifié
5. Définissez le budget notifié (si connu)

**Calculs automatiques** :
- Le budget notifié des lignes est calculé à partir des sous-lignes
- Les montants disponibles sont mis à jour en temps réel
- Les taux de notification sont calculés automatiquement

### 4. Suivi Budgétaire

**Objectif** : Monitoring en temps réel de l'exécution budgétaire

**Indicateurs suivis** :
- Budget notifié vs engagé
- Taux d'engagement par ligne
- Soldes disponibles
- Alertes de dépassement

**Utilisation** :
1. Consultez les cartes de synthèse
2. Analysez le tableau détaillé par sous-ligne
3. Identifiez les lignes en alerte (taux > 90%)
4. Cliquez sur "Détails" pour voir les engagements

### 5. Gestion des Engagements

**Objectif** : Création et validation des engagements financiers

**Processus d'engagement** :

**Étape 1 : Création de la fiche d'engagement**
1. Sélectionnez la sous-ligne budgétaire
2. Remplissez les informations :
   - Fournisseur concerné
   - Montant de l'engagement
   - Description détaillée
   - Référence du devis
   - Date d'engagement
3. Vérifiez l'impact sur le solde budgétaire
4. Enregistrez l'engagement

**Étape 2 : Circuit de validation**
1. **Coordinateur de subvention** : Première validation
2. **Comptable** : Vérification comptable
3. **Coordonnateur national** : Validation finale

**États possibles** :
- **En attente** : Engagement créé, en attente de validation
- **Approuvé** : Toutes les signatures obtenues
- **Rejeté** : Engagement refusé

### 6. Gestion des Paiements

**Objectif** : Traitement des paiements basés sur les engagements approuvés

**Prérequis** : Engagement approuvé avec toutes les signatures

**Procédure de paiement** :

**Étape 1 : Création de la fiche de paiement**
1. Sélectionnez un engagement approuvé
2. Remplissez les détails :
   - Numéro de paiement (auto-généré)
   - Montant à payer
   - Mode de paiement (chèque, virement, espèces)
   - Date de paiement
3. Ajoutez les informations de contrôle :
   - Numéro de facture
   - Montant de la facture
   - Référence du devis
   - Bon de livraison
   - Bon de commande
   - Confirmation de service livré

**Étape 2 : Circuit d'approbation**
- Mêmes niveaux de validation que les engagements
- Vérification de la trésorerie disponible
- Contrôle de cohérence des montants

**Étape 3 : Suivi du paiement**
- **En attente** : Fiche créée
- **Approuvé** : Prêt pour émission
- **Payé** : Chèque émis ou virement effectué
- **Encaissé** : Confirmation d'encaissement

### 7. État de Trésorerie

**Objectif** : Suivi des comptes bancaires et de la liquidité

**Fonctionnalités** :
- Visualisation des soldes bancaires
- Suivi des paiements non encaissés
- Transactions bancaires par rapprochement
- Analyse de la trésorerie disponible

**Utilisation** :
1. Consultez les soldes des comptes associés aux subventions
2. Surveillez les chèques non encaissés
3. Enregistrez les mouvements bancaires via "Nouvelle Transaction"
4. Analysez la trésorerie disponible avant validation de paiements

### 8. Préfinancements

**Objectif** : Gestion des avances entre comptes ou subventions

**Types de préfinancement** :
- **Dépenses spécifiques** : Avance pour des dépenses identifiées
- **Autres comptes** : Transfert vers d'autres comptes bancaires
- **Entre subventions** : Avance d'une subvention à une autre

**Procédure** :
1. Définissez le type de préfinancement
2. Sélectionnez la source (subvention/compte)
3. Définissez la destination
4. Listez les dépenses prévues
5. Obtenez les validations nécessaires
6. Suivez les remboursements

### 9. Prêts Employés

**Objectif** : Administration des prêts sur compte bancaire

**Processus** :

**Étape 1 : Demande de prêt**
1. Renseignez les informations employé
2. Définissez le montant et la justification
3. Établissez l'échéancier de remboursement
4. Obtenez les signatures d'approbation

**Étape 2 : Suivi des remboursements**
1. Enregistrez chaque remboursement
2. Suivez la progression
3. Marquez comme "Remboursé" une fois terminé

### 10. Rapports et Analyses

**Objectif** : Génération d'états et d'analyses

**Types de rapports** :
- **Synthèse** : Vue d'ensemble de la performance
- **Détaillé** : Liste exhaustive des engagements
- **Bénéficiaires avances/prêt** : État des prêts employés
- **Fournisseurs payés** : Historique des paiements
- **Fournisseurs en attente** : Factures non payées

**Utilisation** :
1. Sélectionnez le type de rapport
2. Définissez la période d'analyse
3. Filtrez par subvention si nécessaire
4. Générez et imprimez le rapport

---

## Gestion des Utilisateurs

### Rôles Prédéfinis

**Administrateur**
- Accès complet à toutes les fonctionnalités
- Gestion des utilisateurs et des rôles
- Configuration système

**Responsable Financier**
- Gestion complète des budgets
- Validation des engagements et paiements
- Accès aux rapports

**Gestionnaire de Projet**
- Création d'engagements
- Suivi budgétaire
- Consultation des rapports

**Assistant Administratif**
- Saisie des données
- Consultation limitée

**Consultant**
- Accès en lecture seule
- Consultation des rapports

### Gestion des Permissions

Chaque rôle dispose de permissions spécifiques par module :
- **Créer** : Ajouter de nouveaux éléments
- **Lire** : Consulter les informations
- **Modifier** : Éditer les données existantes
- **Supprimer** : Effacer des éléments
- **Approuver** : Valider des demandes
- **Valider** : Signature finale

---

## Rapports et Analyses

### Filtres Disponibles

**Période** :
- Mois en cours
- Mois dernier
- Année en cours
- Année dernière
- 3/6 derniers mois
- Période personnalisée

**Subvention** :
- Toutes les subventions
- Subvention spécifique

### Impression et Export

Tous les rapports peuvent être :
- Imprimés directement (Ctrl+P)
- Exportés en PDF
- Sauvegardés pour archivage

---

## Bonnes Pratiques

### Saisie des Données

1. **Cohérence des codes** : Utilisez une nomenclature standardisée
2. **Descriptions détaillées** : Facilitez la compréhension et l'audit
3. **Validation régulière** : Vérifiez les données saisies
4. **Sauvegarde fréquente** : Les données sont sauvegardées automatiquement

### Workflow Recommandé

1. **Configuration initiale** :
   - Créer les subventions
   - Définir les lignes budgétaires
   - Paramétrer les sous-lignes

2. **Utilisation quotidienne** :
   - Créer les engagements
   - Valider selon les circuits
   - Traiter les paiements
   - Mettre à jour la trésorerie

3. **Suivi périodique** :
   - Consulter le tableau de bord
   - Analyser les rapports
   - Identifier les écarts
   - Prendre les actions correctives

### Sécurité

1. **Mots de passe** : Utilisez des mots de passe forts
2. **Déconnexion** : Fermez votre session après utilisation
3. **Permissions** : Respectez les niveaux d'accès
4. **Audit** : Toutes les actions sont tracées

---

## FAQ

### Questions Générales

**Q : Puis-je modifier un engagement après validation ?**
R : Oui, mais uniquement les signatures d'approbation. Les montants et détails nécessitent une nouvelle fiche.

**Q : Comment gérer plusieurs devises ?**
R : Chaque subvention a sa propre devise. Les calculs sont automatiquement effectués dans la devise de la subvention.

**Q : Que se passe-t-il en cas de dépassement budgétaire ?**
R : Le système affiche des alertes visuelles mais n'empêche pas la saisie. C'est à l'utilisateur de prendre les mesures appropriées.

### Questions Techniques

**Q : Les données sont-elles sauvegardées automatiquement ?**
R : Oui, toutes les modifications sont immédiatement sauvegardées dans la base de données.

**Q : Puis-je accéder à BudgetBase hors ligne ?**
R : Non, une connexion internet est nécessaire pour accéder aux données.

**Q : Comment récupérer des données supprimées ?**
R : Contactez l'administrateur système. Certaines données peuvent être récupérées selon la politique de sauvegarde.

### Résolution de Problèmes

**Problème : Je ne peux pas me connecter**
- Vérifiez votre email et mot de passe
- Utilisez "Mot de passe oublié" si nécessaire
- Contactez l'administrateur si le compte est inactif

**Problème : Je ne vois pas certains modules**
- Vérifiez vos permissions avec l'administrateur
- Votre rôle détermine les modules accessibles

**Problème : Les calculs semblent incorrects**
- Actualisez la page (F5)
- Vérifiez les données saisies
- Contactez le support si le problème persiste

---

## Support

### Contacts

- **Support technique** : support@budgetbase.com
- **Formation** : formation@budgetbase.com
- **Documentation** : docs@budgetbase.com

### Ressources

- Documentation en ligne
- Vidéos de formation
- Webinaires mensuels
- Forum communautaire

### Maintenance

- Mises à jour automatiques
- Maintenance programmée (notifications préalables)
- Sauvegardes quotidiennes
- Monitoring 24/7

---

## Annexes

### Glossaire

**Engagement** : Promesse de paiement envers un fournisseur
**Notification** : Communication officielle du montant de subvention accordé
**Décaissement** : Sortie effective de fonds
**Préfinancement** : Avance de fonds en attente de remboursement
**RLS** : Row Level Security - Sécurité au niveau des lignes de données

### Codes d'Erreur Courants

- **AUTH_001** : Problème d'authentification
- **PERM_002** : Permissions insuffisantes
- **DATA_003** : Erreur de validation des données
- **CONN_004** : Problème de connexion réseau

---

*Ce guide est mis à jour régulièrement. Version actuelle : 1.0 - Janvier 2025*