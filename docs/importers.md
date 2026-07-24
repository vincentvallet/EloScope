# Adaptateurs d’import

Tous les adaptateurs suivent `TournamentSourceAdapter` :

1. `canHandle` identifie une entrée ;
2. `fetchSource` obtient la source brute ;
3. `parseSource` extrait une structure tolérante ;
4. `normalize` produit les champs métier sans inventer les absents.

## FFE

`FfeResultsAdapter` accepte uniquement HTTPS sur `echecs.asso.fr` et `www.echecs.asso.fr`. Les identifiants dans l’URL et les ports personnalisés sont refusés. La récupération limite les redirections, impose un timeout de 8 secondes, exige du HTML et limite la réponse à 2 Mo. Le HTML distant n’est jamais injecté dans l’interface.

Le parseur détecte les en-têtes par leur texte, traite les espaces insécables, le symbole ½ et les accents, et remonte des avertissements si la grille ou la colonne joueur manque.

## CSV

`ManualCsvAdapter` reconnaît les séparateurs virgule et point-virgule, les cellules citées et plusieurs alias français/anglais. Le CSV complémentaire joueur–club utilise notamment `playerName,clubName`.

## Démonstration et Chess-Results

`DemoTournamentAdapter` expose la fixture structurée. `ChessResultsAdapterPlaceholder` réserve l’extension, mais reste désactivé pour éviter une récupération non fiable.

Pour ajouter une source, implémenter l’interface, écrire des fixtures nettoyées et ajouter des tests de colonnes absentes, ronde en cours et encodage.
