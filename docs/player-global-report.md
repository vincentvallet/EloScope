# Rapport global joueur

Le rapport `/joueurs/{codeFFE}` assemble l’identité officielle FFE, les participations déjà indexées et l’historique officiel FIDE. L’écran FFE s’affiche immédiatement ; la construction FIDE est lancée à la demande et réutilisée par tous les visiteurs.

## Cycle de vie

1. résolution du code FFE et du lien FIDE publié ;
2. lecture ou actualisation du profil FIDE ;
3. agrégation des participations FFE ;
4. validation et écriture des cinq années récentes par segment ;
5. écriture atomique du rapport puis de sa métadonnée `ready`.

En production, la route de génération place la demande en file et délègue au worker Netlify. Un verrou atomique de cinq minutes, acquis avec une écriture conditionnelle dans Netlify Blobs, rend la génération idempotente et couvre les délais réseau maximaux du lot. Un rapport frais est renvoyé sans recalcul. En cas de panne, le dernier rapport valide reste disponible avec `partial`; sans cache, l’API expose une erreur générique et un `retryAfter`.

## API

- `GET /api/players/:ffeCode/global-report`
- `GET /api/players/:ffeCode/global-report/status`
- `POST /api/players/:ffeCode/global-report/generate`
- `GET /api/players/:ffeCode/ratings`
- `GET /api/players/:ffeCode/events`
- `GET /api/players/:ffeCode/games`

Les listes sont paginées à 20 lignes par défaut, 50 au maximum. Les paramètres, cadences et codes sont validés ; les routes sont limitées en fréquence.

## Statistiques et limites

Les pics, variations, bilans et scores sont calculés uniquement à partir des lignes disponibles. La synthèse est déterministe et n’infère aucune cause psychologique. Une absence de parties détaillées est affichée comme telle. Les pages joueurs utilisent `noindex,follow`.

Le profil, l’historique ancien et les années segmentées ont des durées de vie différentes. Le profil actif est actualisé au plus une fois par jour ; les années historiques validées ne sont pas téléchargées inutilement.
