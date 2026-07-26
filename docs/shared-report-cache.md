# Cache partagé des rapports de tournoi

## Parcours

Un clic sur « Voir le rapport » ouvre `/tournoi/<ref>`. L'écran vérifie
`GET /api/tournaments/<ref>/report`. Si le rapport manque, il appelle une seule
fois `POST /api/tournaments/<ref>/analyze`, affiche les étapes de préparation,
puis ouvre la vue générale ou le joueur demandé. Il n'existe plus d'étape
produit « Analyser ».

La session du navigateur reste un cache secondaire et conserve la compatibilité
avec les rapports déjà ouverts. Elle n'est plus la source de vérité : un lien
`/tournoi/<ref>/…` recharge le rapport partagé sur un autre navigateur.

## Stockage

`TournamentReportStore` fournit :

- `MemoryTournamentReportStore` pour les tests unitaires et le serveur local ;
- `LocalFileTournamentReportStore` pour les tests d'intégration isolés ;
- `NetlifyBlobTournamentReportStore` pour la production, dans
  `eloscope-tournament-reports`.

Chaque référence possède `report.json`, `metadata.json` et un verrou temporaire.
L'écriture d'un Blob est atomique ; l'adaptateur fichier écrit dans un fichier
temporaire puis le renomme. Les métadonnées exposent l'étape, le pourcentage,
les dates, l'erreur temporaire et l'empreinte SHA-256.

## Concurrence et abus

Le premier appel acquiert un verrou par tournoi avec propriétaire et expiration.
Un second visiteur reçoit l'état en cours et poll le statut au lieu de lancer
une seconde collecte. Les références sont numériques, les sources restent sur
la liste blanche FFE, les réponses ont une taille maximale, les appels ont un
timeout, les échecs sont mis en cache une minute et les générations sont
limitées par adresse cliente.

Il n'existe aucune génération massive ni tâche planifiée de préchauffage. Les
rapports complets sont produits uniquement à la première consultation.

## Empreinte et stale-while-revalidate

L'empreinte déterministe inclut la référence, les rondes et la grille
normalisée (joueurs, rangs, Elo, scores et notations). Un rapport est servi
immédiatement tant que sa durée de fraîcheur n'est pas dépassée. Lorsqu'il est
ancien, l'interface l'ouvre puis demande une actualisation en arrière-plan.
L'ancien rapport reste disponible si la FFE échoue ; le nouveau ne remplace le
Blob qu'après parsing et normalisation complets.

La durée initiale est longue (30 jours) afin de limiter les coûts. Une évolution
pourra la calculer plus finement à partir du statut et de la date de fin du
catalogue : courte pour un tournoi en cours, moyenne pour un tournoi récent,
longue pour un tournoi ancien terminé.

## Déploiement futur

Cette architecture reste locale tant que le commit n'est pas poussé et déployé.
Avant activation : relancer lint, tests, E2E, build vinext, build Nitro/Netlify
et `netlify build`, puis vérifier les limites Blobs et Functions. Aucun backfill
joueur ni préchauffage ne doit être activé avec ce changement.
