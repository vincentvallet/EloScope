# Intégration FIDE

EloScope complète les données FFE avec les publications sportives officielles de `ratings.fide.com`. Cette intégration reste isolée dans `lib/fide/` : le client, les parseurs, le stockage et les synchronisations ne dépendent pas des parseurs FFE.

## Sources

- `/profile/:fideId` : identité sportive, statut et historique mensuel standard, rapide et blitz ;
- `/calculations.phtml` et son sous-endpoint : événements et adversaires d’une période ;
- `/report.phtml?event=…&t=…` : rapport homologué individuel, équipe ou coupe ;
- `/download_lists.phtml` : catalogue des listes mensuelles officielles.

Une partie « classée » désigne une ligne de calcul ou de rapport officiel. Elle ne constitue pas un PGN et EloScope n’invente ni coups, ni couleur, ni résultat absent.

## Client responsable

`FideClient` utilise `EloScope/1.0 (+mail@vincentvallet.com)`, une seule requête active, 800 à 1 500 ms entre requêtes, un timeout de 15 secondes, une limite de 5 Mo, une validation d’hôte et de type MIME, un retry borné et un circuit breaker. Les erreurs 403, 429 et 503 arrêtent immédiatement le lot. Un cache expiré peut être servi en mode dégradé.

Les logs structurés indiquent l’`attemptId`, l’étape, la progression précédente et courante, le verrou, le nombre de tentatives et, lors d’une panne, le code classé (`TIMEOUT`, `NETWORK`, `HTTP_403`, `HTTP_429`, `HTTP_500`, `HTTP_503`, `UNEXPECTED_HTML`, `NOT_FOUND` ou erreur de parseur), l’URL et le statut HTTP. Ils ne contiennent ni HTML brut ni données personnelles inutiles. Aucun CAPTCHA, compte, jeton privé ou contournement n’est utilisé.

## Stockage et synchronisation

Le store Netlify Blobs `eloscope-fide` est additif :

```text
fide/players/{fideId}/profile.json
fide/rating-lists/YYYY-MM/metadata.json
fide/rating-lists/YYYY-MM/players/FRA-XX.json
fide/rating-lists/latest.json
fide/player-reports/{ffeCode}/metadata.json
fide/player-reports/{ffeCode}/report.json
fide/player-reports/{ffeCode}/checkpoints/{stage}.json
fide/player-reports/{ffeCode}/years/YYYY.json
```

Sous Vitest et pendant le smoke réseau, le sélecteur de stockage force une instance mémoire isolée, même si des variables Netlify sont présentes. Le smoke ne peut donc ni lire ni écrire le store de production ; son HTML temporaire disparaît avec le processus de test.

Les listes sont traitées en flux par `syncFideRatingList`, filtrables par fédération et segmentées. Relancer une période remplace uniquement ses segments déterministes. La fonction mensuelle catalogue les fichiers officiels ; elle ne déclenche jamais de scan mondial par joueur.

## Maintenance d’un parseur

Ajouter une fixture fictive minimale, modifier uniquement le parseur concerné, puis exécuter `npm test`. Si la structure essentielle n’est plus reconnue, le parseur doit échouer explicitement : le rapport partagé précédent reste servi, le statut passe en mode dégradé et le watchdog reprend plus tard.
