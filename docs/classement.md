# Classement en ligne — mise en service

Le code du classement est déjà en place mais **inerte** : tant que les deux
constantes de `js/leaderboard.js` sont vides, aucune interface de classement ne
s'affiche et le jeu fonctionne exactement comme avant. Voici les cinq minutes
de manipulation à faire une fois.

## 1. Créer le projet Supabase

1. Compte gratuit sur [supabase.com](https://supabase.com) (connexion GitHub
   possible, pas de carte bancaire).
2. « New project » : un nom, une région proche (Frankfurt / Paris), et le mot de
   passe de la base — **à garder**, il ne sert pas au jeu mais à toi.
3. Options de sécurité du formulaire de création :
   - **Enable Data API** : coché — c'est par là que le jeu parle à la base.
   - **Automatically expose new tables** : décoché — une table créée plus tard
     ne sera pas exposée par mégarde (le script ci-dessous ouvre explicitement
     la seule table qui doit l'être).
   - **Enable automatic RLS** : coché — toute nouvelle table naît protégée.
   - **Postgres Type** : laisser `Postgres`. OrioleDB est en alpha, et ce
     choix-là est définitif.
4. Attendre ~2 minutes que le projet démarre.

## 2. Créer la table et ses règles

Dans le menu **SQL Editor**, coller ce script et l'exécuter :

```sql
create table scores (
  id           bigint generated always as identity primary key,
  player_id    text        not null,
  pseudo       text        not null,
  mode         text        not null,
  continent    text        not null,
  nb_questions text        not null,
  score        int         not null,
  time_ms      int         not null,
  scoring_ver  int         not null default 1,
  created_at   timestamptz not null default now()
);

-- Lecture du classement : rapide même avec beaucoup de lignes.
create index scores_board_idx
  on scores (mode, continent, nb_questions, scoring_ver, score desc, time_ms asc);

-- Ouvre cette table précise au rôle public. Indispensable si l'option
-- « Automatically expose new tables » a été décochée à la création du projet ;
-- sans effet si elle était cochée.
grant select, insert on table scores to anon;

alter table scores enable row level security;

-- Tout le monde peut lire le classement.
create policy "lecture publique"
  on scores for select
  using (true);

-- Tout le monde peut ajouter un score, mais borné : rien d'aberrant ne rentre.
create policy "envoi de score"
  on scores for insert
  with check (
    length(pseudo) between 1 and 12
    and length(player_id) between 8 and 64
    and score >= 0 and score <= 20000
    and time_ms > 0 and time_ms <= 7200000
    and mode in ('complet','carte','drapeau','saisie','drapeau-carte',
                 'forme','capitale','chrono')
  );
```

Aucune règle `update` ni `delete` n'est créée : **personne ne peut modifier ou
effacer le score d'un autre**. Toi si, depuis le Table Editor du tableau de
bord — c'est le moyen de modération.

## 3. Brancher le jeu

Dans **Project Settings → API**, copier :

- l'**URL du projet** (`https://xxxxxxxx.supabase.co`)
- la clé **anon / publishable**

Les coller en haut de `js/leaderboard.js` :

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOi…";
```

Puis incrémenter `CACHE` dans `sw.js` (convention du dépôt) et pousser.

> Cette clé est publique et visible dans le code source du site : c'est prévu
> ainsi. Ce sont les règles ci-dessus, appliquées côté serveur, qui protègent
> la table — pas le secret de la clé. Ne jamais mettre la clé `service_role`
> dans le dépôt, elle, contourne toutes les règles.

## 4. Mise en veille : déjà traitée

Sur le plan gratuit, un projet **sans le moindre appel pendant 7 jours est mis
en pause** : le classement devient injoignable jusqu'à réactivation manuelle
(les données, elles, ne sont pas perdues).

C'est réglé par [`.github/workflows/ping-supabase.yml`](../.github/workflows/ping-supabase.yml),
qui interroge le classement tous les lundis. Rien à configurer : la clé y est
en clair puisqu'elle est déjà publique. Le job **échoue volontairement** si la
base ne répond pas — GitHub envoie alors un e-mail, ce qui sert d'alerte.

Deux points à connaître :

- Il se déclenche aussi à la main : onglet **Actions → ping supabase → Run
  workflow**.
- GitHub **désactive les tâches planifiées d'un dépôt public après 60 jours
  sans aucune activité**. Un commit de temps en temps suffit à les garder
  vivantes ; sinon GitHub prévient par e-mail avant de les couper.

## Ce qui a été prévu dans le code

- **Un classement par configuration** — mode + région + nombre de questions,
  exactement le découpage des records locaux. Comparer un « Europe / 10
  questions » à un « Monde / tout » n'aurait aucun sens.
- **`scoring_ver`** — si le barème change un jour, incrémenter la constante
  dans `js/leaderboard.js` : les anciens scores restent en base mais ne sont
  plus mélangés aux nouveaux.
- **Un joueur = une ligne au classement** — chaque partie envoie une ligne
  (l'historique est conservé), mais seul le meilleur score de chaque joueur
  apparaît.
- **`player_id`** — identifiant anonyme tiré au sort et gardé dans le
  navigateur. Il sert à reconnaître ses propres lignes, pas à authentifier :
  effacer les données du site fait repartir de zéro côté identité, mais les
  scores déjà envoyés restent au classement.
- **Aucune donnée personnelle** — un pseudo choisi librement, rien d'autre.
- **Panne réseau** — un classement injoignable n'interrompt jamais une partie :
  l'écran de fin s'affiche normalement, le record local est gardé.
