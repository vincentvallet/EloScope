# EloScope

EloScope transforme la fiche officielle d’un tournoi de la Fédération Française des Échecs en rapports visuels pour les joueurs, clubs, entraîneurs et organisateurs. Le MVP fusionne la liste des participants avec la grille américaine et fournit des vues tournoi, joueur, club et rondes, ainsi qu’un moteur Elo configurable.

Le rapport clubs compare les associations à partir de leurs données réelles : score moyen, bilan victoires-nulles-défaites, Elo et performance moyens, écart performance/Elo et variation Elo estimée. Le classement principal est ordonné par score moyen, puis par performance relative.

## Stack

- Next.js App Router, React, TypeScript strict et Tailwind CSS
- Apache ECharts pour les graphiques, Lucide pour les icônes
- Zod pour la validation des imports
- Prisma et SQLite pour le schéma de persistance locale
- Vitest et Playwright
- Vinext/Vite avec sorties dédiées Cloudflare Sites et Netlify/Nitro

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

Le schéma Prisma prépare le stockage de rapports normalisés versionnés. Dans le MVP, aucun tournoi n’est préchargé. Le rapport courant et l’historique récent restent uniquement dans la session de l’onglet du navigateur.

## Tester les imports

- FFE : coller une fiche tournoi HTTPS, par exemple `https://echecs.asso.fr/FicheTournoi.aspx?Ref=70244`.
- EloScope déduit la liste officielle des participants (`Action=Ls`) et la grille américaine (`Action=Ga`), puis rattache les clubs aux joueurs par leur nom normalisé.
- La récupération est exécutée côté serveur avec liste blanche, timeout, contrôle de contenu et limite de taille.

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
build, dossier publié, preset Nitro et version de Node.js. Le runtime Next.js
automatique de Netlify est volontairement désactivé, car il attendrait une
sortie `.next` que vinext ne produit pas.

Le build Cloudflare/Sites existant reste disponible avec `npm run build`.
Aucune base de données ni variable secrète n’est nécessaire au fonctionnement
actuel : les rapports restent stockés dans la session du navigateur.

## Limites connues

- Le parseur FFE est volontairement prudent et peut signaler les grilles dont le balisage sort des variantes testées.
- Chess-Results est préparé comme adaptateur désactivé, sans récupération agressive.
- L’export PDF repose sur l’impression navigateur, sans moteur PDF serveur.
- L’historique de tournois et de joueurs est limité à la session de l’onglet et disparaît à sa fermeture.
- Les variations Elo sont des estimations ; l’homologation et le coefficient K officiel restent à vérifier.
- vinext et Nitro sont encore expérimentaux ; la sortie Netlify doit être revalidée lors d’une mise à niveau majeure de l’un de ces outils.

EloScope n’embarque aucune donnée de tournoi ou de joueur fictive.
