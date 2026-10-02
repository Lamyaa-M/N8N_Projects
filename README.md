# Projets n8n

Deux workflows n8n independent, ecrits avec le SDK TypeScript `@n8n/workflow-sdk`
et synchronises via
[`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

| | Veille concurrentielle | Livre_Sport Marketing |
| --- | --- | --- |
| Fichier | `Veille concurrentielle - Refrigerateurs Boulanger.workflow.ts` | `Livre_Sport Marketing.workflow.ts` |
| Identifiant | `WOCZUWY8irKeSMPU` | `WBdTgHm5xuhZqWrF` |
| Noeuds | 16 | 18 |
| Declenchement | planification, chaque lundi 06:00 | formulaire de depot + panneau de chat |
| Sortie | rapport par e-mail | reponse dans le chat |
| Store | Data Table n8n | Supabase, Postgres + pgvector |
| Modeles | OpenAI (analyse) | `gemini-embedding-2`, `gemini-3.5-flash-lite` |


Ce qui les distingue : la veille est une chaine lineaire qui collecte et compare,
le projet Livre_Sport a trois entrees et un noeud qui s'appelle lui-meme. Les deux
sont documentes depuis le contenu des fichiers `.workflow.ts`, qui fait foi.

---

# 1. Veille concurrentielle — Réfrigérateurs Boulanger

Automatisation d'une veille hebdomadaire sur les réfrigérateurs en vente chez
Boulanger : collecte des produits et des prix, statistiques par marque,
comparaison avec la semaine précédente, analyse et rapport par e-mail.

## Objectif

Suivre chaque semaine les offres presentes sur le site de l'enseigne, de maniere
automatique et verifiable. Chaque semaine, le systeme :

1. recupere les produits proposes sur le site de l'enseigne ;
2. recupere les prix et les promotions ;
3. enregistre les donnees ;
4. calcule des statistiques par marque ;
5. compare avec la semaine precedente ;
6. produit une courte analyse ;
7. envoie le resultat par e-mail.

### Perimetre

- une seule enseigne (Boulanger) ;
- une seule categorie (refrigerateurs) ;
- une collecte par semaine.

L'ajout d'autres enseignes, d'autres indicateurs ou d'autres categories est
prevu mais pas encore implemente.

### Donnees attendues

Pour chaque produit : marque, nom, reference, prix actuel, ancien prix si
disponible, reduction si affichee, promotion oui/non, URL, date de collecte.

Si une information n'est pas disponible, le champ reste vide.

### Regles du projet

1. **Ne jamais inventer une donnee.**
2. **Ne pas compter deux fois le meme produit** — la reference est la cle.
3. **Conserver les collectes precedentes** pour permettre la comparaison.
4. **Signaler toute collecte incomplete.**
5. **Ne jamais presenter une collecte partielle comme complete.**
6. **L'IA analyse les donnees, elle ne les invente pas.**
7. **Le fonctionnement est automatique**, sans intervention.

La regle 1 est tenue par construction et non par une consigne : aucun modele de
langage n'intervient dans la collecte, chaque valeur est lue dans le balisage
de la page. L'IA n'intervient qu'au moment du commentaire, jamais sur les
donnees.

## Realisation technique

### Collecte

Le flux interroge 8 pages de categories et lit les donnees directement dans le
HTML rendu.

| Information | Source dans le HTML |
| --- | --- |
| Reference | `data-product-id="1221082"` |
| Marque | `data-analytics_product_brand="SAMSUNG"` |
| Prix actuel | `data-analytics_product_unitprice_ati="599.0"` |
| Ancien prix | `aria-label="oldPrice 699,00€"` du `<del class="price__crossed">` |
| Remise | `data-analytics_product_discount_value="14"` |
| Nom du produit | JSON-LD `ItemList` |
| Total du catalogue | `numberOfItems` du JSON-LD `ItemList` |

L'URL du produit est derivee de `data-product-id`, donc independante de la forme
du `href`. La deduplication se fait sur cette reference.

### Flux

```
Chaque lundi 06:00  (ou Declenchement manuel)
  └ Lister les pages a collecter      8 URLs
    └ Collecter les pages            Firecrawl, format rawHtml
      └ Analyser les produits        parseur deterministe
        └ La collecte est-elle exploitable ?
            ├ non → trace en base, aucun e-mail        (regle 4 et 5)
            └ oui → Statistiques par marque
                     → Preparer les lignes
                     → Enregistrer la collecte       Data Table
                     → Lire historique               Data Table
                     → Comparer avec la semaine precedente
                     → Analyse IA                    OpenAI
                     → Construire le mail
                     → Envoyer le rapport            Gmail
```

Deux choix structurants :

- **Un seul chemin nominal.** L'historique est lu **apres** l'ecriture de la
  collecte du jour : la table contient toujours des lignes, donc le noeud de
  lecture renvoie des items et le flux ne peut pas s'interrompre. `Comparer`
  exclut lui-meme la date du jour.
- **L'ecriture precede l'IA.** Si l'analyse IA echoue, les produits sont deja
  enregistres.

Le noeud IF est la seule bifurcation : il separe le cas « aucun produit » du
reste, et c'est lui qui garantit qu'une collecte en echec n'aboutit jamais a un
e-mail.

### Statut de la collecte

Le statut est calcule a partir de faits constates, jamais suppose. C'est ce qui
met en oeuvre les regles 4 et 5 :

| Statut | Condition | E-mail |
| --- | --- | --- |
| `Collecte complete` | produits > 0, aucune page en echec, couverture >= au total annonce | oui |
| `Collecte partielle` | produits > 0, mais pages en echec ou couverture partielle | oui, avec alerte |
| `Echec` | aucun produit | **non** |

Le total annonce est lu dans le JSON-LD de la page : c'est la reference qui
permet de distinguer une collecte complete d'une collecte partielle.

### Statistiques par marque

Regroupement des produits par marque, avec : nombre de produits, produits en
promotion, taux de promotion, reduction moyenne, reduction maximale et prix
moyen. Une statistique dont la donnee source est absente reste nulle, elle
n'est pas estimee.

Le tableau correspondant est repris tel quel dans le rapport.

### Comparaison avec la semaine precedente

Le workflow identifie, par rapport a la collecte la plus recente anterieure :

- les nouveaux produits ;
- les produits disparus ;
- les changements de prix ;
- les nouvelles promotions ;
- les promotions terminees.

Un changement de prix n'est signale que si les deux prix sont connus : jamais
d'estimation.

### Rapport

Le mail contient un resume (date, enseigne, nombre de produits, statut), le
tableau des statistiques par marque, l'analyse generee et les alertes de
collecte.

### Couverture

Boulanger ne rend que 40 fiches par page et n'accepte pas la pagination par URL
(`?page=2` renvoie la meme page). Le flux interroge donc les categories et
sous-categories, dont les listings se recoupent, puis deduplique.

| | |
| --- | --- |
| Produits annonces par Boulanger | 1041 |
| Produits collectes (8 pages) | ~199 |
| Couverture | ~19 % |

Les references restantes exigent un vrai navigateur, hors de portee d'un
`scrape`. Conformement a la regle 5, le ratio est reporte dans le rapport plutot
que de presenter les chiffres comme exhaustifs.

### Credentials

A creer dans l'interface, jamais versionnes :

| Noeud | Type de credential |
| --- | --- |
| `Collecter les pages (Firecrawl rawHtml)` | `firecrawlApi` |
| `Analyse IA` | `openAiApi` |
| `Envoyer le rapport par e-mail` | `gmailOAuth2` |

---

# 2. Livre_Sport Marketing — Questions sur un PDF

Workflow `WBdTgHm5xuhZqWrF`, **publie**. Il pose des questions sur un livre
PDF depose par formulaire et n'y repond qu'a partir du livre. Le magasin de
vecteurs est **Supabase** (Postgres + pgvector), donc le livre survit a un
redemarrage de l'instance.

<https://lamyaamarzouq.app.n8n.cloud/workflow/WBdTgHm5xuhZqWrF>

15 noeuds, dont 2 noeuds Code. Aucun sous-noeud, aucun outil, aucun agent,
aucun Qdrant.

## Les trois entrees

```
1. Depot du PDF
On form submission                  formTrigger, reponse sur le dernier noeud
  -> Extract from File              operation pdf
  -> Chunking                       Code, 800 tokens, recouvrement 150, par page
  -> Limit                          maxItems 10
  -> Call 'Livre_Sport Marketing'   Execute Workflow, workflowId WBdTgHm5xuhZqWrF

2. Indexation, atteinte par l'appel ci-dessus
When Executed by Another Workflow   inputSource passthrough
  -> Embed the chunks               HTTP, embedContent, un appel par passage
  -> Store in Supabase              table livres, une ligne par passage

3. Question
When chat message received
  -> Embed the question             HTTP, embedContent
  -> Find relevant passages         Postgres, cosine via match_livres, alwaysOutputData
  -> Draft the answer               Code, prompt par blocs, filtre les lignes sans texte
  -> Ask Gemini                     googleGemini, gemini-3.5-flash-lite, temperature 0.2
  -> Answer for the chat            Edit Fields, une affectation : output

Isole : Clear previous book         Postgres, delete from livres
```

**Le workflow s'appelle lui-meme.** `Call 'Livre_Sport Marketing'` vise
`WBdTgHm5xuhZqWrF`, c'est-a-dire son propre identifiant : l'appel sert
d'aiguiller l'execution vers l'entree 2 plutot que de dupliquer la chaine
d'indexation dans un second workflow.

Le mode du noeud d'appel est **absent du JSON**, et c'est sans consequence : le
code teste `mode === 'each'` et tout le reste suit la branche « une fois pour
tous les items ». En `each`, le workflow serait relance une fois par passage,
donc autant de sous-executions que de passages, chacune avec son propre appel
Gemini.

## Chainage

### Chunking

Noeud Code, mode *Run Once for All Items*. Le texte vient de `item.json.text`.
Le decoupage se fait **par page**, pas sur le livre entier : le motif
`[Source page N]` emis par `Extract from File` delimite les pages, chacune est
nettoyee puis decoupee, et chaque passage emporte sa metadonnee (`source_page`,
`chunk_index`, `estimated_tokens`, `document`).

```js
CHUNK_SIZE = 800       // tokens, convertis en mots par / 1.3
CHUNK_OVERLAP = 150
```

Le nettoyage recolle les mots coupes en fin de ligne (`/(\w)-\n(\w)/`), ce qui
materiellement change le texte indexe.

### Limit

`maxItems: 10`. Dix passages seulement sont envoyes a l'indexation, quel que
soit le nombre produit par le chunker. La note du noeud mentionne un plafond de
100 passages : ce n'est pas la valeur du parametre.

### Embed the chunks

Un appel `embedContent` **par passage**, pas un appel de lot. Le noeud HTTP
applique par defaut un lot de 50 items (`options.batching.batch.batchSize`) et
renvoie alors **un seul** item contenant tout le tableau de vecteurs, donc une
seule ligne en base. Le parametre est mis a 1.

Consequence : indexer N passages coute N appels Gemini. C'est le prix du choix
« aucun noeud Code pour apparier texte et vecteur ». Le palier gratuit autorise
100 requetes d'embedding par minute et par projet : avec `Limit: 10` la marge est
large, mais remettre `Limit` a 100 renvoie un 429.

L'expression `jsonBody` verifie avant d'appeler que l'item porte un `text` non
vide, et leve une erreur nommant le noeud a lancer. Ce controle existe parce
que ce noeud ne recoit ses items que du noeud d'appel : lance seul depuis le
canvas, il recoit `{}`, et Gemini repondait
`BatchEmbedContentsRequest.requests[0].content.parts[0].data: required oneof field 'data' must have one initialized field`,
qui ne dit rien de la cause reelle.

### Store in Supabase

Insertion via l'API REST, table `livres`, champs `text` et `embedding`. Le noeud
insere tous les items, mesures : 3 items en entree donnent 3 lignes en sortie.

Le noeud HTTP **remplace** l'item par sa reponse, donc le texte du passage
n'est plus porte par l'item. Il est relu par reference au declencheur :

```
text      = {{ $('When Executed by Another Workflow').item.json.text }}
embedding = {{ $json.embedding.values }}
```

Sans ce releve, `embedding` part a `null` et l'insertion echoue sur la
contrainte `NOT NULL`. C'est exactement l'erreur rencontree apres la suppression
du noeud d'appariement.

### La chaine de question

`Find relevant passages` porte l'appel a `match_livres` directement dans son
parametre `query` :

```
{{ "select text, distance from match_livres('" + JSON.stringify($json.embedding.values) + "'::vector, 6);" }}
```

Le champ `query` du noeud Postgres **n'accepte pas les expressions** : le
prefixe `=` y est tolere mais n8n le retire et leve un avertissement, la valeur
reste en `{{ }}`.

Le noeud est en `alwaysOutputData`. Sans cela, une table vide faisait echouer
toute la chaine en silence et le panneau de chat repondait « Failed to receive
response ». Avec le filtre de `Draft the answer`, il repond a la place « le livre
n'est pas encore indexe ».

`Draft the answer` construit le prompt **par blocs**, un en-tete en majuscules
par section, plus un separateur par passage :

```
CONTEXTE
REGLEES
PASSAGES (6)
--- Passage 1 ---
...
QUESTION
FORMAT DE REPONSE
```

Les separateurs evitent que le modele prenne la fin d'un passage pour une
consigne. Les lignes sans `text` sont filtrees : sinon l'item vide produit par
`alwaysOutputData` passerait pour un passage et le modele repondrait sur un
contexte vide.

`Ask Gemini` est le noeud **Google Gemini**
(`@n8n/n8n-nodes-langchain.googleGemini`), ressource `text`, operation
`message`, `models/gemini-3.5-flash-lite`, `temperature: 0.2` dans `options` —
c'est la que ce noeud conserve `generationConfig.temperature`. `simplify` est
desactive volontairement : active, le noeud renvoie un item par candidat, de
forme `{ content: ... }`, et non la reponse complete. `jsonOutput` est ecrit en
toutes lettres a `false`.

`Answer for the chat` est un noeud **Edit Fields** avec une seule affectation.
Il n'est pas decoratif : le panneau de chat rend le champ nomme `output`, et
Gemini nomme ses propres champs sans parametre pour les changer. Le noeud recopie
donc le texte de la reponse dans ce seul champ, verifie en execution :
`candidates`, `usageMetadata` et `modelVersion` ont disparu de la sortie. C'est
declaratif, pas du code.

## Base de donnees

Table `livres` : `id text` (uuid), `embedding vector` **sans dimension fixee**,
`text text`, `metadata jsonb`, `collection_id uuid`.

La colonne est sans dimension pour accepter 768 comme 3072. Le modele utilise est
`models/gemini-embedding-2`, soit 3072 dimensions.

```sql
create extension if not exists vector;

create or replace function match_livres(query_embedding vector, match_count integer default 6)
returns table (id text, text text, metadata jsonb, distance real)
language sql stable as $$
  select id, text, metadata, embedding <=> query_embedding as distance
  from livres order by embedding <=> query_embedding limit match_count;
$$;
```

RLS active : le role `anon` peut inserer dans `livres`, et rien d'autre. La cle
Supabase n'expose donc ni lecture ni vidage par l'API. `Clear previous book` passe
par la connection Postgres pour vider.

**`Clear previous book` n'est relie a rien et ne s'execute donc jamais.** C'est
le defaut connu de ce workflow : la table n'est jamais videe entre deux depots,
donc un nouveau livre s'ajoute au precedent. Le remedy tient en deux edits : le
poser en tete de l'entree 2, et faire lire les passages par
`$('When Executed by Another Workflow')` dans le noeud HTTP, puisque le Postgres
remplace son entree par le resultat de sa requete.

## Credentials

Toutes creees dans l'interface n8n, jamais versionnees :

| Noeuds | Type de credential |
| --- | --- |
| `Clear previous book`, `Find relevant passages` | `postgres` |
| `Store in Supabase` | `supabaseApi` |
| `Embed the chunks`, `Embed the question`, `Ask Gemini` | `googlePalmApi` |

Les deux noeuds HTTP utilisent `predefinedCredentialType` avec `googlePalmApi` :
la cle part dans l'en-tete que n8n construit, il n'y a pas de header a saisir.
Le noeud Google Gemini consomme la meme credential.

## Modeles

| Usage | Modele | Note |
| --- | --- | --- |
| Embedding | `models/gemini-embedding-2` | 3072 dimensions |
| Redaction | `models/gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` repond 503, `gemini-2.5-*` repond 404 |

## Points non evidants, verifies en execution

- **`When Executed by Another Workflow` doit declarer son mode d'entree.** Le
  parametre `workflowInputs` porte `minItems: 1` et `inputSource` vaut par
  defaut `workflowInputs` : sans valeur ecrite, chaque execution du noeud d'appel
  echouait sur `At least 1 field is required`. Il est a `passthrough`
  (« Accept All Data »), le mode qu'attend un appelant qui ne mappe aucun champ.
- **Une sous-execution ne voit pas les noeuds de l'appelant.** `$('Limit')` leve
  `Node 'Limit' hasn't been executed` : c'est un autre espace d'execution. Seul
  l'input du declencheur transporte les donnees.
- **`Execute Sub-workflow` en mode `each` relance le workflow par item.** Avec
  87 passages cela fait 87 sous-executions et 87 appels Gemini, de quoi saturer le
  palier gratuit en une minute.
- **Un noeud Postgres remplace son entree par le resultat de sa requete.** Pose au
  milieu d'une chaine, il detruit les items qu'il recoit. D'ou les noeuds en aval
  qui lisent les passages par nom.
- **Un noeud Postgres ne peut pas etre place apres l'insertion** sans effacer ce
  qu'on vient d'ecrire : la table se doublerait a chaque nouveau livre.
- **Un noeud HTTP Request applique un lot de 50 items par defaut** et renvoie
  alors **un seul** item pour tout le lot. C'est ce qui rendait l'insertion
  impossible sans etape d'appariement.
- **Le panneau de chat rend le champ nomme `output`**, et rien d'autre. Un
  dernier noeud qui ne le produit pas affiche soit rien, soit le JSON brut.
- **Un noeud desactive laisse passer son entree telle quelle.** C'est ainsi qu'un
  JSON Gemini entier s'est affiche dans le chat, `candidates` et `usageMetadata`
  compris : le noeud charge de nommer le texte etait desactive, et le modele
  n'avait rien a voir la-dedans.
- **Les credentials sont retirees quand un noeud est copie** dans un autre
  workflow, y compris par une operation `addNode` qui les contient deja. Elles se
  rattachent ensuite avec `setNodeCredential`.
- **`jsonBody` doit renvoyer du texte JSON**, via `JSON.stringify`. Renvoyer un
  objet litteral produit une requete malformee.
- **`embedding` est NOT NULL sans valeur par defaut.** Une insertion sans
  vecteur echoue.
- **Les limites de la Gemini API sont mesurees par projet, pas par cle**, et par
  minute. Une saturation se resorbe seule en une minute, sans rien changer.
- **L'editeur n8n peut ecraser un travail ecrit par API.** Son autosave reecrit le
  workflow entier depuis l'onglet ouvert : selectionner un noeud et appuyer sur
  `Suppr` le supprime, sur `Espace` le desactive. En une journee cela a efface
  trois noeuds Code, vide deux parametres et desactive `Reply in chat`. Fermer
  l'onglet avant toute ecriture par API.
- **MCP n'expose aucun outil d'ecriture sur les credentials** (`list_credentials`
  existe, pas de create ni update). L'API REST n8n n'accepte pas non plus le
  bearer du MCP.
- **n8n ne renvoie aucune erreur par noeud** via le MCP ou la CLI. Ecrire le
  resultat dans une table est le seul moyen de lire ce qu'un noeud a reellement
  produit.

## Le fichier a televerser

| | |
| --- | --- |
| `Sport_Marketing_compresse.pdf` | 2,05 Mio — **c'est celui-ci** |
| original scanne | 57,5 Mio — refuse |

n8n Cloud plafonne un envoi de formulaire a environ 50 Mio : l'original est
rejette par le formulaire, avant meme le demarrage du workflow. La version
compressee conserve toute la couche de texte.

---

# Installation

```bash
npm install -g @workflows-accelerator/n8n-cli
```

Puis, a la racine du depot :

```bash
n8ncli validate      # controle local, sans reseau
n8ncli pull          # recupere les workflows depuis n8n
n8ncli status        # ecarts entre le local et le distant
```

## Limites connues

- **HTTP direct impossible depuis n8n Cloud.** Boulanger coupe la connexion des
  requetes HTTP directes depuis les IP de datacenter (filtrage anti-bot).
  Firecrawl sert donc uniquement de proxy de recuperation, avec le format
  `rawHtml`. Si `formats` sort de `scrapeOptions.options`, la reponse ne contient
  plus de HTML et l'extraction renvoie zero produit.
- **`push` inutilisable en n8n Cloud.** Le CLI ne construit sa table
  dossier → identifiant qu'avec `N8N_DB_URL`, inaccessible en n8n Cloud. Sans
  elle, un `push` cree des dossiers en double. Confirme dans le code : dans
  `push`, `folderPaths` n'est renseigne que si `dbUrl` est defini, sans repli
  sur `search_folders` comme le fait `live`. Le `push` demande en plus une cle
  REST, que le jeton MCP d'acces ne peut pas remplacer (`/api/v1` repond
  `Unauthorized`). Les modifications se font donc via le serveur MCP natif
  (`https://<instance>/mcp-server/http`, `Authorization: Bearer <jeton>`),
  puis un `pull`.
- **`update_workflow` n'atteint ni les notes ni la description.** Ses operations
  `setNodeParameter` et `updateNodeParameters` sont enracinees dans
  `parameters` : un chemin `/notes` cree une cle `notes` **dans** les parametres
  du noeud, ce qui casse le noeud, au lieu de renseigner la note. Seul l'editeur
  n8n permet de modifier les notes. La description du workflow est accessible
  (`setWorkflowMetadata`), mais plafonnee a 255 caracteres par le serveur MCP, et
  le generateur TypeScript ne la reecrit jamais dans le fichier.
- **Bug d'analyse du CLI.** `n8ncli validate` et `n8ncli push` refusent un
  fichier contenant un nombre **pair** de `"` nus dans une chaine a guillemets
  simples — y compris dans un commentaire — avec
  `Syntax error: Unterminated string constant`, alors que `node --check`
  accepte le meme fichier. Le remede est de passer la chaine en litteral de
  gabarit ou d'eliminer les guillemets. Ne pas conclure a un cache : la lecture
  est fraiche et l'echec est deterministe.
- **`n8ncli validate` ne verifie pas le contenu des noeuds Code.** Un code
  syntaxiquement invalide passe la validation. Verifier avec `new Function()` ou
  en executant le workflow.
- **Pas de pagination** au-dela des 40 fiches par page, voir la couverture de la
  veille.
- **Les credentials sont retirees a la copie d'un noeud**, y compris entre
  workflows du meme depot. Compter un travail de re-rattachement apres toute
  operation de ce type.
- **`n8ncli validate` signale deux points sur Livre_Sport**, sans les corriger :
  `Clear previous book` n'est connecte a aucune entree, ce qui est un defaut et non
  un choix, et le parametre `query` de `Find relevant passages` porte une
  expression sans prefixe `=`. Les deux sont repris dans la section 2 ; le second
  est le comportement attendu, le champ n'acceptant pas les expressions.
- **`n8ncli validate` refuse une version de noeud hors de l'instance.** creer un
  noeud sur une version ancienne, par exemple `n8n-nodes-base.set` en 3.4 quand
  l'instance ne porte que 3.5, produit `is using version 3.4, but the latest
  version is 3.5`. Aucune operation ne change la version d'un noeud en place : il
  faut le remplacer par un noeud du meme nom et recabler.
- **`publish_workflow` echoue si l'onglet est ouvert dans l'editeur** :
  `Cannot modify workflow while it is being edited by a user in the editor.` Le
  brouillon et la version publiee divergent alors, et le test manuel utilise le
  brouillon pendant que l'URL de production utilise la version publiee.

## Arborescence

```
n8n/
  config/
    n8n-cli.json          configuration de synchronisation avec n8n
    n8n-layout.json       position des noeuds sur le canvas
  workflows/
    Sandbox/
      Veille concurrentielle - Refrigerateurs Boulanger.workflow.ts
      Livre_Sport Marketing.workflow.ts
skills/
  doubt-driven-dev/SKILL.md
  hostile-review/SKILL.md
  interview/SKILL.md
README.md
```

Non versionnes : `.env`, `n8n/config/sync-state.json`, `n8n/config/cache/`,
`n8n/references/`. Aucun secret ne figure dans le depot : les credentials n8n
vivent dans `~/.n8ncli-global.json` et dans l'instance. La chaine de connexion
Supabase n'est pas versionnee non plus : elle va dans la credential `postgres` de
l'instance. Les fichiers de workflow ne contiennent que des **identifiants** de
credential, pas les cles.

## Suite possible

- veille : autres enseignes, avec le meme parseur applique a un autre balisage ;
- veille : davantage d'indicateurs statistiques, alertes sur les variations de
  prix, analyses plus poussees, a condition de rester ancrees aux donnees
  collectees ;
- Livre_Sport : cabler `Clear previous book`, seul obstacle a un index propre,
  puis elargir `Limit` au-dela de 10 passages en gardant le cout sous le plafond
  de 100 requetes d'embedding par minute ;
