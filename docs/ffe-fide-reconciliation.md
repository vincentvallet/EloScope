# Réconciliation FFE / FIDE

L’identifiant pivot reste le code FFE pour l’URL publique. L’identifiant FIDE est normalisé sans zéros de tête : deux formes qui ne diffèrent que par ces zéros représentent la même identité.

Ordre de confiance :

1. identifiant FIDE explicitement publié sur la fiche FFE ;
2. lien officiel FFE vers le profil FIDE ;
3. identifiant publié dans une grille officielle ;
4. concordance officielle code FFE / identifiant FIDE ;
5. nom, club, fédération et Elo concordants ;
6. nom seul, classé ambigu et masqué.

La construction du rapport exige actuellement un lien officiel de profil. Elle ne tente pas une recherche FIDE par nom. Les identifiants normalisés sont propagés aux participations futures sans fusionner deux codes FFE.

Les champs privés ou excessifs — année de naissance, genre, photo, adresse, téléphone et courriel personnel — ne sont ni exposés par l’API EloScope ni conservés dans le rapport.
