# EloScope

EloScope transforme des résultats de tournois d’échecs en rapports visuels pour les joueurs, clubs, entraîneurs et organisateurs. Le MVP est en français et fournit un tournoi fictif complet, quatre vues d’analyse, un moteur Elo configurable, des imports FFE/CSV, des favoris locaux et des exports.

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

Le schéma Prisma stocke des rapports normalisés versionnés. Le MVP fourni fonctionne sans migration, car la démonstration et les préférences sont locales ; la base est prête pour la persistance des imports.

## Tester les imports

- Démonstration : Accueil → **Utiliser les données de démonstration**.
- CSV : Importer → **Fichier CSV**. Les en-têtes reconnus incluent `Joueur`, `Elo`, `Club` et `Score`.
- FFE : Importer → **URL FFE**, puis coller une URL HTTPS du domaine `echecs.asso.fr`. La récupération est exécutée côté serveur avec liste blanche, timeout, contrôle de contenu et limite de taille.

## Exports

Les vues classement, joueur, club et comparaison exportent les tableaux en CSV. Le rapport complet peut être exporté en JSON normalisé (`schemaVersion: 1.0`). Le bouton PDF utilise une vue d’impression dédiée : choisir ensuite « Enregistrer au format PDF » dans la boîte de dialogue du navigateur.

## Déploiement Netlify

Utiliser l’intégration Next.js officielle de Netlify :

```bash
npm run build
```

Définir `DATABASE_URL` dans l’environnement du site si la persistance Prisma est activée. Les rapports de démonstration n’en ont pas besoin.

## Limites connues

- Le parseur FFE est volontairement prudent et peut signaler les grilles dont le balisage sort des variantes testées.
- Chess-Results est préparé comme adaptateur désactivé, sans récupération agressive.
- L’export PDF repose sur l’impression navigateur, sans moteur PDF serveur.
- Les favoris et récents sont locaux tant qu’aucun compte n’existe.
- Les variations Elo sont des estimations ; l’homologation et le coefficient K officiel restent à vérifier.

Les données de `data/demo-tournament.ts` sont entièrement fictives et séparées du code de présentation.
