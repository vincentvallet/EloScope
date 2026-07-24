# Adaptateurs d’import

Tous les adaptateurs suivent `TournamentSourceAdapter` :

1. `canHandle` identifie une entrée ;
2. `fetchSource` obtient la source brute ;
3. `parseSource` extrait une structure tolérante ;
4. `normalize` produit les champs métier sans inventer les absents.

## FFE

`FfeResultsAdapter` accepte uniquement HTTPS sur `echecs.asso.fr` et `www.echecs.asso.fr`. L’entrée recommandée est une fiche `FicheTournoi.aspx?Ref=…`. À partir de cette référence, l’adaptateur récupère en parallèle la liste des participants (`Action=Ls`) et la grille américaine (`Action=Ga`). Les identifiants dans l’URL et les ports personnalisés sont refusés. La récupération impose un timeout, exige du HTML et limite chaque réponse à 2 Mo. Le HTML distant n’est jamais injecté dans l’interface.

Le parseur détecte les en-têtes par leur texte, traite les espaces insécables, le symbole ½ et les accents. Les clubs sont rapprochés avec les joueurs de la grille par un nom normalisé. Un avertissement est remonté si la liste, les clubs, la grille ou la colonne joueur manque.

Lorsque la grille ne publie pas de performance ou de départages, EloScope calcule une performance estimée à partir des Elo adverses ainsi que Buchholz, Sonneborn-Berger et score progressif. Ces valeurs restent explicitement présentées comme calculées ou estimées, et ne remplacent pas un départage officiel publié par l’organisateur.

Le MVP ne propose qu’un import FFE. Les imports CSV et les données de démonstration ont été retirés du produit.

Pour ajouter une source, implémenter l’interface, écrire des fixtures nettoyées et ajouter des tests de colonnes absentes, ronde en cours et encodage.
