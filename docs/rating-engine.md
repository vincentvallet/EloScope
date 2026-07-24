# Moteur Elo

Le moteur dans `lib/rating/engine.ts` est composé de fonctions pures.

## Score attendu

Le ruleset `fide-standard-2024@2024.1` utilise une table FIDE versionnée. La valeur du joueur moins bien classé est le complément à 1 de celle du joueur mieux classé. L’écart est plafonné à 400 points pour ce ruleset. Un second ruleset sans plafond démontre que la règle n’est pas une constante globale.

## Variation

Pour une partie jouée et cotée :

```text
delta = K × (score réalisé − score attendu)
```

Le score vaut 1, ½ ou 0. K accepte 10, 20, 40 ou une valeur personnalisée de 1 à 100.

Les exempts, forfaits sans partie, adversaires non classés, résultats incomplets et parties non cotées sont exclus. Ils peuvent apporter un point de tournoi, mais toujours zéro point Elo.

Les deltas bruts sont additionnés sans arrondi intermédiaire. Le total est arrondi une fois avec `Math.round`.

## Performance

La performance fournie par la source est conservée. À défaut, une estimation logistique bornée est calculée sur les parties réellement jouées contre des adversaires classés. Les scores de 0 % et 100 % sont bornés pour éviter `Infinity` ou `NaN`.

L’interface rappelle que le classement publié peut différer selon l’homologation, les autres compétitions de la période et les règles applicables.
