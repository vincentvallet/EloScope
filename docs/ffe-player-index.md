# Index des joueurs et participations FFE

## Liaison avec les rapports globaux

Le code FFE reste la clé principale. Lorsqu’une fiche FFE publie un lien FIDE, l’identifiant est normalisé et utilisé par le rapport global sans recherche par nom. Le backfill des participations conserve sa priorité actuelle et continue indépendamment des fonctions FIDE ; aucune migration ne réinitialise les Blobs existants.

Voir [ffe-fide-reconciliation.md](ffe-fide-reconciliation.md) pour les niveaux de confiance.

## Sources et recherche

La page `/joueurs` appelle uniquement `GET /api/players/search`; le navigateur
ne contacte jamais la FFE. Le serveur interroge
`ListeJoueurs.aspx?Action=FFE` avec le formulaire `JoueurNom` et, lorsque
nécessaire, `JoueurPrenom`. Une recherche par code FFE complet est immédiate ;
une recherche textuelle demande trois caractères, est temporisée 400 ms et
annule la requête précédente.

Les lignes publiques fournissent le code FFE, le nom, l'affiliation, les Elo
standard/rapide/blitz, la catégorie, le club et un lien
`FicheJoueur.aspx?Id=…`. La fiche liée peut ajouter l'identifiant FIDE et le
titre. Les appels ont un User-Agent explicite, un timeout de 10 secondes, une
limite de 1,5 Mo, une liste blanche HTTPS, une limite de débit et au plus vingt
résultats par page.

## Identité et homonymes

Le code FFE est la clé principale. Deux codes distincts ne sont jamais
fusionnés. L'ordre de confiance est : code FFE, identifiant interne FFE,
identifiant FIDE, puis nom normalisé accompagné d'un club ou d'un Elo
concordant. Un nom seul reste ambigu et n'est pas relié à un profil.

La normalisation désaccentue sans perdre les apostrophes ni les tirets. Un
changement de club ne crée pas de nouveau joueur. Les pages individuelles
portent `noindex,follow` et proposent un courriel de correction prérempli.

## Stockage

`PlayerStorage` possède trois implémentations : mémoire, fichiers temporaires et
Netlify Blobs (`eloscope-ffe-players`). Les clés sont segmentées :

- `players/profiles/<code>.json`
- `players/by-code/<code>/participations/<ref>.json`
- `participations/by-tournament/<ref>.json`
- `indexes/player-prefix/<préfixe>/<code>.json`
- `metadata/player-backfill-status.json`
- `locks/player-backfill.json`

Aucun fichier global de tous les joueurs ou de toutes les participations n'est
envoyé au navigateur. Les API paginent à vingt éléments maximum.

## Participations et couverture

Lorsqu'un rapport de tournoi est généré, sa liste légère de joueurs alimente
l'index. Une participation est reliée à un profil uniquement avec une identité
suffisamment forte. Elle conserve séparément score, classement, club, Elo,
catégorie et nombre de parties jouées. Par défaut, les inscriptions sans partie
et les identités ambiguës sont masquées.

Le backfill progressif est préparé dans `lib/ffe-players/backfill.ts`, mais
aucune Scheduled Function ne l'active. Il donne la priorité au backfill du
catalogue, possède un verrou expirant, un curseur, des budgets de temps et de
requêtes, une reprise et une quarantaine. L'ordre futur sera l'année courante,
les quatre précédentes, puis les années décroissantes jusqu'à janvier 2000.

La couverture affichée reste explicitement incomplète jusqu'à la fin de ce
traitement.

## Confidentialité

Les seules données conservées sont les identifiants sportifs, nom, prénom,
club, catégorie, fédération, Elo et résultats nécessaires. Adresse, téléphone,
courriel personnel et date de naissance complète sont exclus. La page
`/donnees-confidentialite` documente la finalité, les homonymes et le contact
`mail@vincentvallet.com`.
