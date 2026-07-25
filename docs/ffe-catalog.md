# Catalogue automatisé des tournois FFE

## Architecture

Le moteur suit un flux volontairement découplé :

`FFE → Netlify Scheduled Function → Background Function → Netlify Blobs → API EloScope → interface`

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
lorsqu’il existe, n’essaie pas de contourner un refus, limite la concurrence à
deux requêtes au plus et espace les requêtes. Contact : `mail@vincentvallet.com`.

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
- `metadata/backfill-cursor.json`
- `metadata/announcement-cursor.json`
- `metadata/internal-secret.json`
- `locks/catalog-sync.json`

Un nouveau lot est entièrement parsé et dédupliqué avant son écriture. En cas
d’échec, l’ancien lot n’est pas supprimé. L’adaptateur mémoire permet les tests
et le développement sans compte ni configuration.

## Synchronisation

La tâche `ffe-catalog-sync` s’exécute chaque jour à `02:17 UTC`. Elle lit un
secret aléatoire privé créé au premier lancement et déclenche rapidement la
Background Function. Celle-ci :

- met à jour le mois courant et les deux mois précédents ;
- met à jour une cadence d’annonces jusqu’à six mois et fait tourner les quatre
  cadences sur quatre exécutions ;
- traite un mois historique supplémentaire ;
- avance le curseur de backfill ;
- ne remplace les métadonnées de succès qu’après validation des lots.

Un verrou avec expiration empêche les synchronisations simultanées et une
limite de fréquence évite les répétitions. Le handler `deploySucceeded` vérifie
le catalogue après un déploiement de production et lance automatiquement les
trois mois récents plus une cadence d’annonces si le store est vide. Les mois
plus anciens sont ensuite ajoutés progressivement par la tâche quotidienne.

## API

`GET /api/tournaments/search` accepte `q`, `from`, `to`, `year`, `month`,
`region`, `department`, `cadence`, `status`, `hasResults`, `page`, `pageSize`
et `sort`. La réponse contient les résultats, la pagination, les facettes et la
fraîcheur du catalogue.

`GET /api/tournaments/:ffeRef` charge une fiche individuelle seulement à la
demande et la met en cache. `POST /api/tournaments/:ffeRef/analyze` réutilise
`FfeResultsAdapter`, comme `/api/import`.

## Diagnostic

1. Vérifier `/api/tournaments/catalog-status`.
2. Consulter les logs `ffe-catalog-sync`, `ffe-catalog-sync-worker` et
   `ffe-catalog-on-deploy`.
3. Chercher les événements JSON `ffe_catalog_sync_failed` et le contact.
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
et la première couverture historique complète nécessite le backfill
progressif.
