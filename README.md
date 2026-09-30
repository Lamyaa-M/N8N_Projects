# Workflow `Veille concurrentielle - Refrigerateurs Boulanger`

Workflow n8n de collecte de fiches produits sur Boulanger, avec statistiques,
comparaison entre deux exécutions et envoi d'un rapport par e-mail.

Écrit avec le SDK TypeScript `@n8n/workflow-sdk`, synchronisé via
[`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

## Collecte

Le flux interroge 8 pages de catégories et lit les données directement dans le
HTML rendu. **Aucun modèle de langage n'intervient dans l'extraction** : chaque
valeur est lue dans le balisage, ce qui rend impossible toute valeur estimée.

| Information | Source dans le HTML |
| --- | --- |
| Référence | `data-product-id="1221082"` |
| Marque | `data-analytics_product_brand="SAMSUNG"` |
| Prix actuel | `data-analytics_product_unitprice_ati="599.0"` |
| Ancien prix | `aria-label="oldPrice 699,00€"` du `<del class="price__crossed">` |
| Remise | `data-analytics_product_discount_value="14"` |
| Nom du produit | JSON-LD `ItemList` |
| Total du catalogue | `numberOfItems` du JSON-LD `ItemList` |

L'URL du produit est dérivée de `data-product-id`, donc indépendante de la forme
du `href`. La déduplication se fait sur cette référence.

## Flux

```
Chaque lundi 06:00  (ou Declenchement manuel)
  └ Lister les pages a collecter      8 URLs
    └ Collecter les pages            Firecrawl, format rawHtml
      └ Analyser les produits        parseur déterministe
        └ La collecte est-elle exploitable ?
            ├ non → trace en base, aucun e-mail
            └ oui → Statistiques par marque
                     → Préparer les lignes
                     → Enregistrer la collecte       Data Table
                     → Lire historique               Data Table
                     → Comparer avec l'exécution précédente
                     → Analyse IA                    OpenAI
                     → Construire le mail
                     → Envoyer le rapport            Gmail
```

Deux choix structurants :

- **Un seul chemin nominal.** L'historique est lu **après** l'écriture de la
  collecte du jour : la table contient toujours des lignes, donc le nœud de
  lecture renvoie des items et le flux ne peut pas s'interrompre. `Comparer`
  exclut lui-même la date du jour.
- **L'écriture précède l'IA.** Si l'analyse IA échoue, les produits sont déjà
  enregistrés.

Le nœud IF est la seule bifurcation : il sépare le cas « aucun produit » du
reste. La branche false écrit une trace et ne poursuit pas vers l'e-mail.

## Statut

Le statut est calculé à partir de faits constatés, jamais supposé :

| Statut | Condition |
| --- | --- |
| `Collecte complete` | produits > 0, aucune page en échec, et couverture ≥ au total annoncé par le site |
| `Collecte partielle` | produits > 0, mais pages en échec ou couverture partielle |
| `Echec` | aucun produit — aucun e-mail n'est envoyé |

Le total annoncé est lu dans le JSON-LD de la page. Il sert de référence pour
qualifier la collecte.

## Couverture

Boulanger ne rend que 40 fiches par page et n'accepte pas la pagination par
URL (`?page=2` renvoie la même page). Le flux interroge les catégories et
sous-catégories, dont les listings se recoupent, puis déduplique.

| | |
| --- | --- |
| Produits annoncés par Boulanger | 1041 |
| Produits collectés (8 pages) | ~199 |
| Couverture | ~19 % |

Les références restantes exigent un vrai navigateur, hors de portée d'un
`scrape`. Le ratio est reporté dans le rapport.

## Installation

```bash
npm install -g @workflows-accelerator/n8n-cli
```

Puis, à la racine du dépôt :

```bash
n8ncli validate      # contrôle local, sans réseau
n8ncli pull          # récupère le workflow depuis n8n
n8ncli status        # écarts entre le local et le distant
```

### Credentials sur l'instance

À créer dans l'interface, jamais versionnés :

| Nœud | Type de credential |
| --- | --- |
| `Collecter les pages (Firecrawl rawHtml)` | `firecrawlApi` |
| `Analyse IA` | `openAiApi` |

Gmail est rattaché via le credential `Gmail account`.

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
  syntaxiquement invalide passe la validation. Vérifier avec `new Function()` ou
  en exécutant le workflow.
- **Pas de pagination** au-delà des 40 fiches par page, voir ci-dessus.

## Arborescence

```
n8n/
  config/
    n8n-cli.json          configuration de synchronisation avec n8n
    n8n-layout.json       position des nœuds sur le canvas
  workflows/
    Sandbox/
      Veille concurrentielle - Refrigerateurs Boulanger.workflow.ts
README.md
```

Non versionnés : `.env`, `n8n/config/sync-state.json`, `n8n/config/cache/`,
`n8n/references/`. Aucun secret ne figure dans le dépôt : les credentials
n8n vivent dans `~/.n8ncli-global.json` et dans l'instance.