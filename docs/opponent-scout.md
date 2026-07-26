# Scout adversaire

L’onglet Adversaire recherche exclusivement dans l’annuaire public FFE déjà utilisé par EloScope. La comparaison requiert deux rapports globaux présents dans le cache, ce qui empêche d’utiliser l’API comme scanner arbitraire.

Le face-à-face est relié par identifiant FIDE exact. Les homonymes ne sont jamais fusionnés sur le seul nom. Le score théorique suit la formule Elo :

```text
1 / (1 + 10 ^ ((Elo adverse - Elo joueur) / 400))
```

La réponse de comparaison expose les classements officiels disponibles, le score théorique, le face-à-face et les identifiants des adversaires communs. Elle ne prédit pas un résultat réel et ne produit aucune analyse psychologique.

Routes :

- `GET /api/players/:ffeCode/head-to-head?opponentFideId=…`
- `GET /api/players/:ffeCode/compare/:opponentCode`

Les deux routes sont limitées en fréquence et refusent les codes invalides, identiques ou les rapports absents.
