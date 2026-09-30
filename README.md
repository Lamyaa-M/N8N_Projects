# Veille concurrentielle — Réfrigérateurs Boulanger

Automatisation n8n d'une veille hebdomadaire sur les réfrigérateurs en vente
chez Boulanger : collecte des produits et des prix, statistiques par marque,
comparaison avec la semaine précédente, analyse et rapport par e-mail.

---

## Objectif du projet

Suivre d'un bout en bout l'offre et la politique tarifaire d'une enseigne
concurente sur une catégorie de produits, de manière automatique et vérifiable.

Chaque semaine, le système :

1. récupère les produits proposés sur le site de l'enseigne ;
2. récupère les prix et les promotions ;
3. enregistre les données ;
4. calcule des statistiques par marque ;
5. compare avec la semaine précédente ;
6. produit une courte analyse ;
7. envoie le résultat par e-mail.

### Périmètre

- une seule enseigne (Boulanger) ;
- une seule catégorie (réfrigérateurs) ;
- une collecte par semaine.

L'ajout d'autres enseignes, d'autres indicateurs ou d'autres catégories est
prévu mais pas encore implémenté.

### Données attendues

Pour chaque produit : marque, nom, référence, prix actuel, ancien prix si
disponible, réduction si affichée, promotion oui/non, URL, date de collecte.

Si une information n'est pas disponible, le champ reste vide.

### Règles du projet

1. **Ne jamais inventer une donnée.**
2. **Ne pas compter deux fois le même produit** — la référence est la clé.
3. **Conserver les collectes précédentes** pour permettre la comparaison.
4. **Signaler toute collecte incomplète.**
5. **Ne jamais présenter une collecte partielle comme complète.**
6. **L'IA analyse les données, elle ne les invente pas.**
7. **Le fonctionnement est automatique**, sans intervention.

La règle 1 est tenue par construction et non par une consigne : aucun modèle de
langage n'intervient dans la collecte, chaque valeur est lue dans le balisage
de la page. L'IA n'intervient qu'au moment du commentaire, jamais sur les
données.

---

## Réalisation technique

Écrit avec le SDK TypeScript `@n8n/workflow-sdk`, synchronisé via
[`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

### Collecte

Le flux interroge 8 pages de catégories et lit les données directement dans le
HTML rendu.

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

### Flux

```
Chaque lundi 06:00  (ou Declenchement manuel)
  └ Lister les pages a collecter      8 URLs
    └ Collecter les pages            Firecrawl, format rawHtml
      └ Analyser les produits        parseur déterministe
        └ La collecte est-elle exploitable ?
            ├ non → trace en base, aucun e-mail        (règle 4 et 5)
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
  lecture renvoie des items et le flux ne peut pas s'interrompre. `Comparer`
  exclut lui-même la date du jour.
- **L'écriture précède l'IA.** Si l'analyse IA échoue, les produits sont déjà
  enregistrés.

Le nœud IF est la seule bifurcation : il sépare le cas « aucun produit » du
reste, et c'est lui qui garantit qu'une collecte en échec n'aboutit jamais à un
e-mail.

### Statut de la collecte

Le statut est calculé à partir de faits constatés, jamais supposé. C'est ce qui
met en œuvre les règles 4 et 5 :

| Statut | Condition | E-mail |
| --- | --- | --- |
| `Collecte complete` | produits > 0, aucune page en échec, couverture ≥ au total annoncé | oui |
| `Collecte partielle` | produits > 0, mais pages en échec ou couverture partielle | oui, avec alerte |
| `Echec` | aucun produit | **non** |

Le total annoncé est lu dans le JSON-LD de la page : c'est la référence qui
permet de distinguer une collecte complète d'une collecte partielle.

### Statistiques par marque

Regroupement des produits par marque, avec : nombre de produits, produits en
promotion, taux de promotion, réduction moyenne, réduction maximale et prix
moyen. Une statistique dont la donnée source est absente reste nulle, elle
n'est pas estimée.

Le tableau correspondant est repris tel quel dans le rapport.

### Comparaison avec la semaine précédente

Le workflow identifie, par rapport à la collecte la plus récente antérieure :

- les nouveaux produits ;
- les produits disparus ;
- les changements de prix ;
- les nouvelles promotions ;
- les promotions terminées.

Un changement de prix n'est signalé que si les deux prix sont connus : jamais
d'estimation.

### Rapport

Le mail contient un résumé (date, enseigne, nombre de produits, statut), le
tableau des statistiques par marque, l'analyse générée et les alertes de
collecte.

### Couverture

Boulanger ne rend que 40 fiches par page et n'accepte pas la pagination par URL
(`?page=2` renvoie la même page). Le flux interroge donc les catégories et
sous-catégories, dont les listings se recoupent, puis déduplique.

| | |
| --- | --- |
| Produits annoncés par Boulanger | 1041 |
| Produits collectés (8 pages) | ~199 |
| Couverture | ~19 % |

Les références restantes exigent un vrai navigateur, hors de portée d'un
`scrape`. Conformément à la règle 5, le ratio est reporté dans le rapport plutôt
que de présenter les chiffres comme exhaustifs.

---

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

## Suite possible

- autres enseignes, avec le même parseur appliqué à un autre balisage ;
- davantage d'indicateurs statistiques ;
- alertes spécifiques sur les variations de prix ;
- analyses plus poussées, à condition de rester ancrées aux données collectées.