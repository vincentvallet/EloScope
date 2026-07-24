# EloScope

EloScope transforme une grille américaine officielle de la Fédération Française des Échecs en rapports visuels pour les joueurs, clubs, entraîneurs et organisateurs. Le MVP est en français et fournit des vues tournoi, joueur, rondes et comparaison, ainsi qu’un moteur Elo configurable.

## Stack

- Next.js App Router, React, TypeScript strict et Tailwind CSS
- Apache ECharts pour les graphiques, Lucide pour les icônes
- Zod pour la validation des imports
- Prisma et SQLite pour le schéma de persistance locale
- Vitest et Playwright
- Vinext/Cloudflare pour le déploiement Sites, structure compatible avec un déploiement Netlify Next.js

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

Le schéma Prisma prépare le stockage de rapports normalisés versionnés. Dans le MVP, le dernier tournoi importé est conservé localement dans le navigateur.

## Tester les imports

- FFE : coller une URL HTTPS de résultats du domaine `echecs.asso.fr`.
- Un lien de classement contenant `Action=Cl` est automatiquement converti vers la grille américaine `Action=Ga`.
- La récupération est exécutée côté serveur avec liste blanche, suivi manuel des redirections, timeout, contrôle de contenu et limite de taille.

## Exports

Les vues classement, joueur, club et comparaison exportent les tableaux en CSV. Le rapport complet peut être exporté en JSON normalisé (`schemaVersion: 1.0`). Le bouton PDF utilise une vue d’impression dédiée : choisir ensuite « Enregistrer au format PDF » dans la boîte de dialogue du navigateur.

## Déploiement Netlify

Utiliser l’intégration Next.js officielle de Netlify :

```bash
npm run build
```

Définir `DATABASE_URL` dans l’environnement du site si la persistance Prisma est activée.

## Limites connues

- Le parseur FFE est volontairement prudent et peut signaler les grilles dont le balisage sort des variantes testées.
- Chess-Results est préparé comme adaptateur désactivé, sans récupération agressive.
- L’export PDF repose sur l’impression navigateur, sans moteur PDF serveur.
- Les favoris et récents sont locaux tant qu’aucun compte n’existe.
- Les variations Elo sont des estimations ; l’homologation et le coefficient K officiel restent à vérifier.

EloScope n’embarque aucune donnée de tournoi ou de joueur fictive.
