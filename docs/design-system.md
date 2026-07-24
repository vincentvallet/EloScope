# Design system

EloScope utilise une interface claire et calme, sans effets décoratifs inutiles.

## Palette

- Fond `#F6F7F4`, surface `#FFFFFF`, bordure `#E4E8E3`
- Texte `#17211B`, secondaire `#667085`
- Marque `#244A5A`, sélection `#356B82`
- Positif `#23855B`, négatif `#C2413A`, avertissement `#D97706`, neutre `#64748B`

Chaque couleur sémantique est accompagnée d’un texte, signe ou symbole : V/1, N/½, D/0, ▲ gain, ▼ perte et ● stabilité.

## Typographie et densité

La pile système de type Inter maximise la lisibilité. Les titres de page font 28–32 px sur desktop, les KPI 21–25 px et les données tabulaires utilisent des chiffres tabulaires. Les cartes ont un rayon de 11 px, une bordure fine et une ombre minimale.

## Responsive

- Desktop : barre latérale, graphiques côte à côte, tableaux complets.
- Tablette : barre repliable, KPI en deux ou trois colonnes.
- Mobile : navigation inférieure, KPI en deux colonnes et rondes en cartes compactes.

La feuille d’impression supprime navigation et contrôles. Les animations sont retirées avec `prefers-reduced-motion`.
