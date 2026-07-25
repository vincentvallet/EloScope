# Catalogue automatisé des tournois FFE

## Architecture

Le moteur suit un flux volontairement découplé :

`FFE → Netlify Scheduled Functions → Background Functions → Netlify Blobs → API EloScope → interface`

La saisie d’un utilisateur n’interroge jamais le site de la FFE. La recherche
lit uniquement des lots persistants du store `eloscope-ffe-catalog`.

## Sources publiques

- `ListeTournois.aspx?Action=RES&Annee=…&Mois=…` : résultats mensuels.
- `Tournois.aspx` : formulaire des annonces par cadence.
- `ListeTournois.aspx?Action=TOURNOICOMITE&ComiteRef=…` : source de
  vérification par comité.
- `Calendrier.aspx` : source étudiée pour la navigation mensuelle.
- `FicheTournoi.aspx?Ref=…` : dates complètes, cadence, rondes, organisateur,
  arbitre, adresse et présence des liens de résultats.

Les adaptateurs résident dans `lib/ffe-catalog`. Le User-Agent envoyé est
`EloScope/1.0 (+mail@vincentvallet.com)`. La collecte vérifie `robots.txt`
lorsqu’il existe, n’essaie pas de contourner un refus et n’effectue qu’une
requête à la fois pendant le rattrapage. Chaque requête est espacée de 700 à
1 000 ms, avec timeout et backoff exponentiel. Contact :
`mail@vincentvallet.com`.

## Pagination ASP.NET

`aspnet-postback.ts` récupère la première page, conserve les cookies, extrait
tous les champs cachés du formulaire (`__VIEWSTATE`,
`__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, etc.), détecte les appels
`__doPostBack`, puis reproduit les POST de pagination.

Les signatures de postback et les références FFE déjà observées arrêtent les
boucles. Les parseurs ne supposent jamais l’existence d’un paramètre `page=2`.

## Normalisation et fusion

La référence de `FicheTournoi.aspx?Ref=…` est la clé primaire. La priorité est :

1. fiche individuelle ;
2. liste de résultats ;
3. annonces/calendrier ;
4. liste de comité.

Les données absentes restent absentes. La fusion conserve `firstSeenAt`, avance
`lastSeenAt` et transforme l’annonce existante en tournoi avec résultats sans
créer de doublon.

Les textes sont mis en minuscules, désaccentués, et leurs apostrophes, tirets,
ponctuation et espaces sont homogénéisés. Les mois français abrégés, la Corse
(`2A`, `2B`), les codes avec zéro initial et l’outre-mer sont couverts par les
tests. La table département-région versionnée est générée depuis
`geo.api.gouv.fr` avec :

```bash
npm run ffe:update-geography
```

## Stockage Blobs

Les clés principales sont :

- `months/YYYY-MM.json`
- `upcoming/<cadence>.json`
- `details/<ffeRef>.json`
- `metadata/sync-status.json`
- `metadata/announcement-cursor.json`
- `metadata/announcement-status.json`
- `metadata/internal-secret.json`
- `locks/catalog-sync.json`
- `backfill/history-state.json`
- `locks/history-backfill.json`
- `indexes/by-year/YYYY.json`
- `indexes/metadata.json`

Un nouveau lot est entièrement parsé et dédupliqué avant son écriture. En cas
d’échec, l’ancien lot n’est pas supprimé. L’adaptateur mémoire permet les tests
et le développement sans compte ni configuration.

## Synchronisation

La tâche `ffe-catalog-sync` s’exécute chaque jour à `02:17 UTC`. Elle lit un
secret aléatoire privé créé au premier lancement et déclenche rapidement la
Background Function. Celle-ci :

- met à jour le mois courant et les deux mois précédents ;
- ne remplace les métadonnées de succès qu’après validation des lots.

Un verrou avec expiration empêche les synchronisations simultanées et une
limite de fréquence évite les répétitions. Le handler `deploySucceeded` vérifie
le catalogue après un déploiement de production et lance automatiquement les
trois mois récents si le store est vide.

## Rattrapage historique depuis 2000

`ffe-history-backfill` maintient une file persistante des 319 mois compris entre
janvier 2000 et juillet 2026, étendue automatiquement lorsque le calendrier
avance. Les lots mensuels déjà présents sont conservés et exclus de la file.

Chaque invocation de la Background Function traite au plus 12 mois, 100
requêtes FFE ou 10 minutes. Le premier seuil atteint arrête proprement le lot.
Chaque mois validé, y compris un mois vide, est écrit immédiatement puis retiré
de la file. Le worker déclenche le lot suivant automatiquement. Un watchdog
planifié toutes les dix minutes reprend une chaîne interrompue sans intervention
humaine.

Après trois échecs, un mois est placé en quarantaine avec le détail de la
dernière erreur. La tâche planifiée retente au plus un mois en quarantaine par
jour. Les erreurs 429, 503 et timeouts interrompent temporairement le lot sans
perdre les mois déjà validés.

Les lots `months/YYYY-MM.json` restent la source de vérité. Après chaque mois,
`indexes/by-year/YYYY.json` est reconstruit atomiquement. La recherche lit les
index annuels en parallèle et pagine uniquement la réponse serveur ; elle
n’envoie jamais l’ensemble du catalogue au navigateur.

Une seconde tâche, `ffe-catalog-announcements`, s’exécute à `03:47 UTC`. Elle
met à jour une cadence d’annonces jusqu’à six mois et fait tourner les quatre
cadences sur quatre exécutions. Son verrou et son statut sont indépendants :
une réponse lente du formulaire d’annonces FFE ne peut pas bloquer le catalogue
mensuel.

## API

`GET /api/tournaments/search` accepte `q`, `from`, `to`, `year`, `month`,
`region`, `department`, `cadence`, `status`, `hasResults`, `page`, `pageSize`
et `sort`. La réponse contient les résultats, la pagination, les facettes et la
fraîcheur du catalogue.

`GET /api/tournaments/catalog-status` expose le nombre réel de tournois, les
dates extrêmes indexées et la progression du rattrapage : mois terminés, vides,
en attente, en échec, dernier mois traité et état de la chaîne.

`GET /api/tournaments/:ffeRef` charge une fiche individuelle seulement à la
demande et la met en cache. `POST /api/tournaments/:ffeRef/analyze` réutilise
`FfeResultsAdapter`, comme `/api/import`.

## Diagnostic

1. Vérifier `/api/tournaments/catalog-status`.
2. Consulter les logs `ffe-catalog-sync`, `ffe-history-backfill-worker` et
   `ffe-catalog-on-deploy`.
3. Chercher les événements JSON `ffe_history_backfill_batch_complete`,
   `ffe_history_backfill_next_dispatched` et `ffe_catalog_sync_failed`.
4. Reproduire le parsing avec les fixtures de `tests/fixtures`.
5. Mettre à jour seulement le parseur correspondant si une structure FFE
   change, puis exécuter `npm test`, `npm run lint` et le build Netlify.

Si la FFE est indisponible ou renvoie une erreur, le catalogue précédemment
enregistré continue d’être servi. Le bouton « Actualiser la recherche » relit
le catalogue ; il ne déclenche pas une collecte complète.

## Attribution et limites

L’interface affiche la source et un lien vers chaque fiche. EloScope est un
service indépendant et n’utilise pas le logo de la FFE.

Le site FFE ne fournit pas d’API publique documentée. Les structures HTML
peuvent changer, certaines annonces peuvent manquer de lieu, cadence ou dates,
et la couverture signifie uniquement « données publiquement disponibles » :
un mois vérifié sans archive reste explicitement marqué vide.
