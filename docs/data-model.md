# Modèle de données

`TournamentReport` décrit la source, les dates, la cadence, l’état, les rondes et les avertissements d’import. Son slug est public et non ambigu.

`Player` porte l’identité normalisée indépendante d’un tournoi. `Club` est optionnel : aucune association n’est inventée lorsque la source n’en contient pas.

`TournamentEntry` relie un joueur au tournoi. Il conserve l’Elo et le rang de départ, le rang final, le score, les départages, la performance fournie ou estimée et les rondes.

`RoundResult` sépare explicitement le résultat sportif (`tournamentPoints`) du statut de cotation. Une ronde peut être jouée, cotée, exemptée, gagnée/perdue par forfait ou incomplète.

`RatingScenario` est une projection calculée avec un Elo initial, un coefficient K et un ruleset versionné. Le delta brut de chaque ronde est conservé ; seul le total final est arrondi.

Les chaînes destinées aux rapprochements disposent d’une forme normalisée sans accents et en minuscules. Les valeurs inconnues restent absentes ou `null`, jamais remplacées par une valeur fictive.
