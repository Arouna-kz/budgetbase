# Guide d'installation — Budget Base sur une base Supabase vierge

Ce guide décrit **toutes les étapes et toutes les requêtes SQL** pour mettre en place la
plateforme **Budget Base** sur une base de données **Supabase totalement vierge**, jusqu'à
l'enregistrement du **premier utilisateur** et au **fonctionnement complet**.

> 📌 Toutes les requêtes SQL sont regroupées dans le fichier **`INSTALLATION_SUPABASE.sql`**
> (à côté de ce guide). Il suffit de le copier **en entier** dans le SQL Editor de Supabase.

---

## 0. Prérequis

- Un compte **Supabase** (https://supabase.com).
- Le **code de l'application** Budget Base (ce projet).
- **Node.js 18+** et **npm** installés (pour lancer/déployer l'app).

---

## 1. Créer le projet Supabase

1. Connectez-vous sur https://supabase.com → **New project**.
2. Choisissez une **organisation**, un **nom** de projet et un **mot de passe** de base de données (notez-le).
3. Sélectionnez une **région** proche de vos utilisateurs.
4. Cliquez **Create new project** et attendez la fin de la création (~2 min).

## 2. Récupérer l'URL et la clé publique (anon)

Dans le projet Supabase : **Project Settings → API**. Notez :

- **Project URL** → ex. `https://xxxxxxxx.supabase.co`
- **anon public key** (clé `anon`) → longue chaîne `eyJ...`

## 3. Configurer les variables d'environnement de l'application

À la racine du projet, créez (ou modifiez) le fichier **`.env`** :

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi... (votre clé anon)
```

> ⚠️ Utilisez bien la clé **anon public** (jamais la clé *service_role* côté frontend).

## 4. Désactiver la confirmation d'e-mail (indispensable au démarrage)

Pour que la **première inscription** fonctionne immédiatement (sans lien de confirmation) :

1. Supabase → **Authentication → Providers → Email**.
2. **Désactivez** l'option **« Confirm email »** (Enregistrer).

> Vous pourrez la réactiver plus tard si vous mettez en place l'envoi d'e-mails.

## 5. Créer le schéma + les rôles (exécuter le SQL)

1. Supabase → **SQL Editor → New query**.
2. **Copiez tout le contenu** du fichier **`INSTALLATION_SUPABASE.sql`** et collez-le.
3. Cliquez **Run**.

Ce script (idempotent, ré-exécutable) réalise **tout** :

| Ce qu'il crée | Détail |
|---|---|
| **12 tables** | `user_roles`, `users`, `grants`, `budget_lines`, `sub_budget_lines`, `engagements`, `payments`, `bank_transactions`, `prefinancings`, `employee_loans`, `app_settings` |
| **Accès API** | Désactive le RLS et accorde les privilèges à `anon`/`authenticated` (l'app écrit directement) |
| **Rôles par défaut** | **ADMIN** (obligatoire), **Comptable**, **Coordinateur de la Subvention**, **Coordonnateur National** — ces 3 derniers sont des professions **signataires** |

**Vérification rapide** (dans le SQL Editor) :

```sql
-- Doit renvoyer 4 rôles, dont un de code 'ADMIN'
select code, name from public.user_roles order by code;

-- Doit lister vos 12 tables
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

## 6. Lancer l'application

En local :

```bash
npm install
npm run dev
```

Puis ouvrez l'URL affichée (ex. `http://localhost:5173/budgetbase/`).

> En production, buildez (`npm run build`) et déployez le dossier `dist/` sur votre hébergeur,
> en configurant les mêmes variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## 7. Créer le PREMIER utilisateur (administrateur)

Sur une base vierge, la table `users` est vide : la page de connexion affiche alors le lien
**« Créer un compte administrateur »**.

1. Sur l'écran de connexion, cliquez **« Créer un compte administrateur »**.
2. Renseignez **prénom, nom, e-mail, mot de passe** (et éventuellement profession/identifiant).
3. Validez.

➡️ En coulisses, l'application :
- crée le compte d'authentification (Supabase Auth),
- retrouve le rôle **ADMIN** (créé à l'étape 5),
- insère la fiche dans `public.users` en la rattachant au rôle **ADMIN**,
- vous connecte automatiquement en **Administrateur**.

> Le lien d'inscription **disparaît** dès qu'un utilisateur existe : les comptes suivants se créent
> depuis le menu **Utilisateurs** (voir étape 9).

## 8. Mettre la plateforme en service

Une fois connecté en administrateur :

1. **Créer une subvention** — menu **Gestion des Subventions → Nouvelle Subvention**.
2. **Planifier le budget** — menu **Planification** : ajoutez des **lignes** puis des **sous-lignes**.
3. **Notifier un montant** — sur la carte de la subvention, bouton **« Notifier un montant »**
   (répartit le budget sur les lignes/sous-lignes ; le 1er montant **active** la subvention).
4. **Définir la subvention en cours** — menu **Configuration** : elle sera utilisée par toute l'équipe
   (stockée dans la table `app_settings`).

La plateforme est alors **pleinement fonctionnelle** (engagements, paiements, trésorerie,
rapprochement, préfinancements, prêts, rapports).

## 9. Créer les autres utilisateurs et rôles

Depuis le menu **Utilisateurs** (réservé à l'ADMIN) :

- **Nouvel Utilisateur** : identité, e-mail, **rôle** et **profession**.
  Pour que les **signatures** fonctionnent, la **profession** doit être l'une de :
  `Comptable`, `Coordinateur de la Subvention`, `Coordonnateur National`.
- **Nouveau Rôle** / édition : cochez finement les **permissions par module**
  (voir, créer, modifier, supprimer, signer, exporter…).
  Ex. pour donner accès au **Rapprochement** : cochez `Rapprochement` → voir / modifier / exporter.

---

## 10. Sécurité (à faire avant une mise en production réelle)

⚠️ Ce script **désactive le RLS** : avec la clé anon, toutes les tables sont lisibles/modifiables.
C'est acceptable pour un usage **interne/contrôlé**, mais **pas** pour une exposition publique.

Pour sécuriser, activez le RLS et ajoutez des policies, par exemple « réservé aux utilisateurs
authentifiés » :

```sql
-- Exemple à adapter, table par table
alter table public.grants enable row level security;

create policy "authenticated_all_grants" on public.grants
  for all to authenticated using (true) with check (true);
```

> Répétez pour chaque table. Pour un contrôle plus fin (par rôle/subvention), les policies
> doivent s'appuyer sur `auth.uid()` et une jointure vers `public.users` / `public.user_roles`.

## 11. Sauvegardes & maintenance

- Supabase effectue des **sauvegardes automatiques** (selon votre offre) — vérifiez la rétention.
- Le fichier **`MIGRATIONS_A_EXECUTER.sql`** liste les **colonnes ajoutées après coup**
  (mission, échelonné, rapprochement) : elles sont **déjà incluses** dans
  `INSTALLATION_SUPABASE.sql`, mais gardez ce fichier pour les mises à jour d'une base existante.

---

## Annexe A — Résumé des tables

| Table | Rôle |
|---|---|
| `user_roles` | Rôles et **permissions** (JSON `[{module, actions}]`) |
| `users` | Comptes (liés à `auth.users` et à un rôle) |
| `grants` | Subventions (budget notifié, compte bancaire, statut) |
| `budget_lines` | Lignes budgétaires |
| `sub_budget_lines` | Sous-lignes budgétaires |
| `engagements` | Engagements (dont indicateur `is_mission`) |
| `payments` | Paiements (échelonné, rapprochement, versements partiels JSON) |
| `bank_transactions` | Mouvements du compte bancaire de la subvention |
| `prefinancings` | Préfinancements et remboursements |
| `employee_loans` | Prêts employés et échéanciers |
| `app_settings` | Paramètres partagés (ex. subvention en cours) |

## Annexe B — Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Le rôle administrateur (ADMIN) est introuvable » à l'inscription | SQL non exécuté / rôle ADMIN absent | Ré-exécutez `INSTALLATION_SUPABASE.sql` |
| Le lien « Créer un compte administrateur » n'apparaît pas | Un utilisateur existe déjà, ou la table `users` est inaccessible | Vérifiez `select count(*) from public.users;` |
| Impossible de se connecter juste après l'inscription | Confirmation d'e-mail encore active | Désactivez « Confirm email » (étape 4) |
| Erreurs « permission denied » / « row-level security » | Privilèges/RLS mal configurés | Ré-exécutez la section « Accès API » du script |
| « column ... does not exist » lors d'une action | Colonne récente manquante (base ancienne) | Exécutez `MIGRATIONS_A_EXECUTER.sql` |
| Écran de connexion mais rien ne charge | `.env` manquant/incorrect | Vérifiez `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` puis relancez |

---

*Document généré pour la plateforme Budget Base.*
