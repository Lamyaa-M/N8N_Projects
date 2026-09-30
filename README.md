# Veille concurrentielle — Réfrigérateurs Boulanger

Automatisation n8n qui collecte chaque semaine les prix et promotions des
réfrigérateurs en vente sur Boulanger, calcule des statistiques par marque, les
compare à la semaine précédente et envoie le résultat par e-mail.

## Principe

Le flux interroge 8 pages de catégories Boulanger, lit les données
directement dans le HTML rendu et les enregistre. **Aucun modèle de langage
n'intervient dans la collecte** : la règle « ne jamais inventer une donnée » est
garantie par construction, pas par une consigne.

Chaque donnée est lue dans le balisage de la page :

| Information | Source dans le HTML |
| --- | --- |
| Référence | `data-product-id="1221082"` |
| Marque | `data-analytics_product_brand="SAMSUNG"` |
| Prix actuel | `data-analytics_product_unitprice_ati="599.0"` |
| Ancien prix | `aria-label="oldPrice 699,00€"` du `<del class="price__crossed">` |
| Remise | `data-analytics_product_discount_value="14"` |
| Nom du produit | JSON-LD `ItemList` |
| Total du catalogue | `numberOfItems` du JSON-LD `ItemList` |

## Flux

```
Chaque lundi 06:00  (ou Declenchement manuel)
  └ Lister les pages a collecter      8 URLs
    └ Collecter les pages            Firecrawl, format rawHtml
      └ Analyser les produits        parseur déterministe
        └ La collecte est-elle exploitable ?
            ├ non → trace en base, aucun e-mail      (spec §8)
            └ oui → Statistiques par marque
                     → Préparer les lignes
                     → Enregistrer la collecte       Data Table
                     → Lire historique               Data Table
                     → Comparer avec la semaine précédente
                     → Analyse IA                    OpenAI
                     → Construire le mail
                     → Envoyer le rapport            Gmail
```

Deux choix structurants :

- **Un seul chemin nominal.** L'historique est lu **après** l'écriture de la
  collecte du jour : la table contient toujours des lignes, donc le nœud de
  lecture renvoie des items et le flux ne peut pas s'interrompre.
- **L'écriture précède l'IA.** Si l'analyse IA échoue, les produits sont déjà
  enregistrés.

## Statut de la collecte

Le statut n'est jamais supposé (spec §7) :

| Statut | Condition |
| --- | --- |
| `Collecte complete` | produits > 0, aucune page en échec, et couverture ≥ au total annoncé |
| `Collecte partielle` | produits > 0 mais pages en échec ou couverture partielle |
| `Echec` | aucun produit — aucun e-mail n'est envoyé |

La couverture est comparée au total que Boulanger annonce lui-même. Une collecte
partielle n'est jamais présentée comme complète.

## Couverture

Boulanger ne rend que **40 fiches par page** et n'accepte pas la pagination par
URL (`?page=2` renvoie la même page). Le flux interroge donc les catégories et
sous-catégories, dont les listings se recoupent, puis déduplique par référence.

| | |
| --- | --- |
| Produits annoncés par Boulanger | 1041 |
| Produits collectés (8 pages) | ~199 |
| Couverture | ~19 % |

Les références restantes exigent un vrai navigateur, hors de portée d'un
`scrape`. Ce chiffre est assumé et signalé dans chaque e-mail.

## Installation

Workflows gérés avec [`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

```bash
npm install -g @workflows-accelerator/n8n-cli
```

Puis, à la racine du dépôt :

```bash
n8ncli validate                                   # contrôle local, sans réseau
n8ncli pull                                       # récupère les workflows
n8ncli status                                     # écarts local / distant
```

### Sur l'instance n8n

Deux credentials sont à créer dans l'interface, ils ne sont volontairement pas
versionnés :

| Nœud | Type de credential |
| --- | --- |
| `Collecter les pages (Firecrawl rawHtml)` | `firecrawlApi` |
| `Analyse IA` | `openAiApi` |

Gmail est déjà rattaché via le credential `Gmail account`.

## Limites connues

- **HTTP direct impossible depuis n8n Cloud.** Boulanger coupe la connexion des
  requêtes HTTP directes depuis les IP de datacenter (filtrage anti-bot).
  Firecrawl sert donc uniquement de proxy de récupération, avec le format
  `rawHtml`. Si `formats` sort de `scrapeOptions.options`, la réponse ne contient
  plus de HTML et l'extraction renvoie zéro produit.
- **`push` inutilisable en n8n Cloud.** Le CLI ne construit sa table
  dossier → identifiant qu'avec `N8N_DB_URL`, inaccessible en n8n Cloud. Sans
  elle, un `push` crée des dossiers en double. Les modifications se font donc via
  les outils MCP (`create_workflow_from_code`, `update_workflow`) puis un `pull`.
- **`n8ncli validate` ne vérifie pas le contenu des nœuds Code.** Un code
      syntaxiquement invalide passe la validation. Vérifier avec `new Function()`
      ou en exécutant le flux.
- **Pas de pagination possible** au-delà des 40 fiches par page, voir ci-dessus.

## Arborescence

```
n8n/
  config/
    n8n-cli.json          configuration de synchronisation
    n8n-layout.json       position des nœuds sur le canvas
    n8n-standards.json    conventions de nommage
  workflows/
    Sandbox/
      Veille concurrentielle - Refrigerateurs Boulanger.workflow.ts
      Exercice 1.workflow.ts
      Exercice2.workflow.ts
      WorkflowTest.workflow.ts
.agents/skills/n8n/       règles du SDK n8n utilisées pour écrire ces workflows
```

Non versionnés : `.env`, `n8n/config/sync-state.json`, `n8n/config/cache/`,
`n8n/references/`. Aucun secret ne figure dans le dépôt.