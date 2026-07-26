# Rapport global joueur

Le rapport `/joueurs/{codeFFE}` assemble l’identité officielle FFE, les participations déjà indexées et l’historique officiel FIDE. L’écran FFE s’affiche immédiatement ; la construction FIDE est lancée à la demande et réutilisée par tous les visiteurs.

## Cycle de vie

1. identité FFE validée (5 %) et lien FIDE validé (15 %) ;
2. profil FIDE (25 %) puis historique Elo (35 %) enregistrés séparément ;
3. calculs (50 %), événements (65 %) et participations FFE (75 %) ;
4. statistiques (85 %), validation du rapport (95 %) et publication (100 %).

Chaque étape réussie possède un checkpoint Blob. L’écriture passe par une clé temporaire validée avant le remplacement de la clé active ; l’ancienne valeur reste donc intacte si l’écriture échoue. La progression est monotone et une reprise commence au premier checkpoint absent.

En production, la route de génération place une seule demande en file et transmet son `attemptId` à la Background Function. Le worker relit toujours l’état persistant dans le store `eloscope-fide`. Un verrou atomique de cinq minutes, acquis avec une écriture conditionnelle, rend la génération idempotente entre onglets et instances.

La machine à états utilise `idle`, `queued`, `building`, `retry_wait`, `partial_ready`, `ready` et `failed`. Les trois premières pannes rapprochées appliquent un backoff borné ; le troisième échec conserve un état partiel sans nouvelle relance immédiate. Le watchdog ne traite que `queued`, `building` avec verrou expiré, ou `retry_wait` dont l’échéance est atteinte.

Le navigateur effectue un seul `POST generate` par action explicite. Le suivi est exclusivement réalisé par `GET`, avec une seule requête en vol, un `AbortController` et un timeout nettoyé au démontage.

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
