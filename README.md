# EloScope

EloScope transforme la fiche officielle d’un tournoi de la Fédération Française des Échecs en rapports visuels pour les joueurs, clubs, entraîneurs et organisateurs. Le MVP fusionne la liste des participants avec la grille américaine et fournit des vues tournoi, joueur, club et rondes, ainsi qu’un moteur Elo configurable.

Le rapport clubs compare les associations à partir de leurs données réelles : score moyen, bilan victoires-nulles-défaites, Elo et performance moyens, écart performance/Elo et variation Elo estimée. Le classement principal est ordonné par score moyen, puis par performance relative.

La page `/tournois` recherche également le catalogue public FFE par nom, ville,
département, région, dates, année, cadence et disponibilité des résultats.
Le catalogue est synchronisé automatiquement côté Netlify : aucune requête FFE
n’est envoyée pendant la saisie d’un utilisateur.

La page `/joueurs` recherche l'annuaire public par nom, prénom ou code FFE et
affiche les participations déjà couvertes par l'index progressif. Un clic sur un
tournoi ouvre automatiquement son rapport : le premier visiteur le prépare,
puis tous les suivants réutilisent la copie partagée.

## Stack

- Next.js App Router, React, TypeScript strict et Tailwind CSS
- Apache ECharts pour les graphiques, Lucide pour les icônes
- Zod pour la validation des imports
- Prisma et SQLite pour le schéma de persistance locale
- Vitest et Playwright
- Vinext/Vite avec sorties dédiées Cloudflare Sites et Netlify/Nitro
- Netlify Functions, Scheduled Functions et Blobs pour le catalogue FFE, les profils et les rapports partagés

## Installation et lancement

Prérequis : Node.js 22.13 ou supérieur.

```bash
npm install
copy .env.example .env
npm run db:generate
npm run dev
```

Ouvrir l’URL locale affichée par le serveur.

## Validation

```bash
npm run test
npm run lint
npm run build
npm run test:e2e
```

Les tests E2E démarrent eux-mêmes l’application. L’installation du navigateur Playwright peut être nécessaire une première fois avec `npx playwright install chromium`.

## Base de données

La seule variable nécessaire est :

```env
DATABASE_URL="file:./dev.db"
```

Le schéma Prisma prépare le stockage de rapports normalisés versionnés. Aucun
tournoi n’est préchargé. Netlify Blobs est la source de vérité partagée des
rapports générés à la demande ; la session de l’onglet reste seulement un cache
secondaire compatible avec les rapports déjà ouverts.

## Tester les imports

- FFE : coller une fiche tournoi HTTPS, par exemple `https://echecs.asso.fr/FicheTournoi.aspx?Ref=70244`.
- EloScope déduit la liste officielle des participants (`Action=Ls`) et la grille américaine (`Action=Ga`), puis rattache les clubs aux joueurs par leur nom normalisé.
- La récupération est exécutée côté serveur avec liste blanche, timeout, contrôle de contenu et limite de taille.

## Catalogue automatisé FFE

- `GET /api/tournaments/search` recherche le catalogue local.
- `GET /api/tournaments/catalog-status` expose la fraîcheur, les dates extrêmes
  et la progression réelle des archives depuis 2000.
- `GET /api/tournaments/:ffeRef` complète et met en cache une fiche à la demande.
- `GET /api/tournaments/:ffeRef/report` lit le rapport partagé et sa progression.
- `POST /api/tournaments/:ffeRef/analyze` prépare à la demande le rapport sous verrou.
- `GET /api/players/search` et `GET /api/players/:ffeCode` exposent la recherche et les participations paginées.
- La tâche planifiée quotidienne met à jour le mois courant et les deux mois
  précédents. Une tâche indépendante met à jour les annonces futures.
- Le rattrapage accéléré vérifie automatiquement chaque mois depuis janvier
  2000 par lots limités à 12 mois, 100 requêtes ou 10 minutes. Les lots
  s’enchaînent automatiquement et un watchdog reprend toute interruption.
- Les mois vides sont conservés comme vérifiés. Après trois échecs, un mois est
  mis en quarantaine puis retenté de manière limitée.
- Les index annuels gardent la recherche rapide sans envoyer le catalogue
  complet au navigateur.
- Après le déploiement, `deploySucceeded` initialise la file et lance le premier
  lot sans configuration manuelle.

Les lots et la progression sont conservés dans le store Netlify Blobs
`eloscope-ffe-catalog`. Le site, le token et l’accès au store sont fournis
automatiquement par le runtime Netlify. Aucune variable d’environnement,
création de table ou intervention dans l’interface Netlify n’est nécessaire.

La documentation technique complète est dans
[`docs/ffe-catalog.md`](docs/ffe-catalog.md),
[`docs/ffe-player-index.md`](docs/ffe-player-index.md) et
[`docs/shared-report-cache.md`](docs/shared-report-cache.md).

## Exports

La vue classement exporte les joueurs et leurs clubs en CSV. Le bouton PDF utilise une vue d’impression dédiée : choisir ensuite « Enregistrer au format PDF » dans la boîte de dialogue du navigateur.

## Déploiement Netlify

EloScope utilise vinext et Vite plutôt que `next build`. Pour Netlify, le
plugin Vite officiel de Nitro génère les fichiers publics dans `dist` et la
fonction serveur Netlify qui assure le rendu App Router, les routes dynamiques
et `/api/import`.

```bash
npm run build:netlify
```

La configuration de production est portée par `netlify.toml` : commande de
build, dossier publié, dossier de fonctions, tâche quotidienne, Background
Function, preset Nitro et version de Node.js. Le runtime Next.js
automatique de Netlify est volontairement désactivé, car il attendrait une
sortie `.next` que vinext ne produit pas.

Le build Cloudflare/Sites existant reste disponible avec `npm run build`.
Aucune base de données externe ni variable secrète n’est nécessaire. Le secret
interne de déclenchement est généré automatiquement et reste dans Netlify Blobs.

## Limites connues

- Le parseur FFE est volontairement prudent et peut signaler les grilles dont le balisage sort des variantes testées.
- La collecte dépend du HTML public de la FFE ; les anciennes données restent servies si la source est lente, indisponible ou change.
- Le backfill historique reste volontairement séquentiel et espacé ; sa durée
  dépend du nombre réel de pages mensuelles et des éventuels ralentissements FFE.
- Chess-Results est préparé comme adaptateur désactivé, sans récupération agressive.
- L’export PDF repose sur l’impression navigateur, sans moteur PDF serveur.
- L'historique récent de navigation reste limité à la session, mais les rapports eux-mêmes sont partagés et retrouvables par leur URL.
- Les variations Elo sont des estimations ; l’homologation et le coefficient K officiel restent à vérifier.
- vinext et Nitro sont encore expérimentaux ; la sortie Netlify doit être revalidée lors d’une mise à niveau majeure de l’un de ces outils.

EloScope n’embarque aucune donnée de tournoi ou de joueur fictive.

La nouvelle architecture décrite ici ne sera active en production qu'après un
futur push et un déploiement explicitement contrôlé.
