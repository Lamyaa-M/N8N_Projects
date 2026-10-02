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
| Publie | non | non |

**https://lamyaamarzouq.app.n8n.cloud/workflow/WBdTgHm5xuhZqWrF**

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

Workflow `WBdTgHm5xuhZqWrF`, **non publie**. Il pose des questions sur un livre
PDF depose par formulaire et n'y repond qu'a partir du livre. Le magasin de
vecteurs est **Supabase** (Postgres + pgvector), donc le livre survit a un
redemarrage de l'instance.

18 noeuds, aucun sous-noeud, aucun outil, aucun agent, aucun Qdrant.

## Les trois entrees

```
1. Depot du PDF
On form submission
  → Extract from File          operation pdf
  → Chunking                   Code, 800 tokens, recouvrement 150
  → Limit                      maxItems 4
  → Call 'Livre_Sport Marketing'   Execute Workflow, workflowId WBdTgHm5xuhZqWrF

2. Indexation, atteinte par l'appel ci-dessus
When Executed by Another Workflow
  → Embed the chunks           HTTP, batchEmbedContents, un seul appel
  → Pair texts and vectors     Code, associe texte et vecteur
  → Store in Supabase          table livres, une ligne par passage

3. Question
When chat message received
  → Read the question          Code, lit question ou chatInput
  → Embed the question         HTTP, embedContent
  → Build the search           Code, construit l'appel a match_livres
  → Find relevant passages     Postgres, cosine via match_livres
  → Draft the answer           Code, prompt limite aux passages
  → Ask Gemini                 gemini-3.5-flash-lite, temperature 0.2
  → Reply in chat              Code, texte brut

Isole : Clear previous book    Postgres, delete from livres
```

**Le workflow s'appelle lui-meme.** `Call 'Livre_Sport Marketing'` vise
`WBdTgHm5xuhZqWrF`, c'est-a-dire son propre identifiant : l'appel sert
d'aiguiller l'execution vers l'entree 2 plutot que de dupliquer la chaine
d'indexation dans un second workflow. Les noeuds de l'entree 2 lisent donc leurs
passages par nom, `$('When Executed by Another Workflow').all()`, et non par
`$input`, puisque `$input` y est la reponse de Gemini.

**`Clear previous book` n'est relie a rien.** Il porte `executeOnce: true` et
n'est ajoute que par `.add()`, sans `.to()`. Il vide la table par la connection
Postgres, ce que la cle Supabase ne peut pas faire.

## Chainage

### Chunking

Noeud Code, mode *Run Once for All Items*. Le texte vient de `item.json.text`.
Le decoupage se fait **par page**, pas sur le livre entier : le motif
`[Source page N]` emis par `Extract from File` delimite les pages, chacune est
nettoyee puis decoupee, et chaque passage emporte sa metadonnee.

```js
CHUNK_SIZE = 800       // tokens, convertis en mots par / 1.3
CHUNK_OVERLAP = 150
```

Le nettoyage recolle les mots coupes en fin de ligne (`/(\w)-\n(\w)/`), ce qui
materiellement change le texte indexe. Metadonnee par passage : `source_page`,
`chunk_index`, `estimated_tokens`, `document`.

### Limit

`maxItems: 4`. Quatre passages seulement sont envoyes a l'indexation, quel que
soit le nombre produit par le chunker. La note du noeud mentionne un plafond de
100 passages : ce n'est pas la valeur du parametre.

### Embed the chunks

Un appel `batchEmbedContents` pour tous les passages, pas un appel par passage.
Mesure a 87 passages et 1,76 million de caracteres en environ 3 secondes, 87
vecteurs de 3072 dimensions renvoyes dans l'ordre d'envoi.

L'expression `jsonBody` verifie avant d'appeler qu'aucun item n'arrive sans
`text` exploitable, et leve une erreur nommant le noeud a lancer. C'est le seul
endroit ou une indexation vide est detectee : n8n traite l'insertion de zero
document comme un succes.

### Pair texts and vectors

Le retour de Gemini est un seul item contenant un tableau `embeddings`. Ce noeud
le zippe sur les passages un par un, pour que `Store in Supabase` reçoive une
ligne par chunk avec son `text` et son `embedding`. Il echoue bruyamment si les
deux comptes different.

### Store in Supabase

Insertion via l'API REST, table `livres`, champs `text` et `embedding`. Le noeud
insere bien tous les items, mesures : 3 items en entrée donnent 3 lignes en
sortie. Aucune boucle n'est necessaire malgre l'absence d'operation `bulk`.

### La chaine de question

`Read the question` lit `question` ou `chatInput` selon l'origine. C'est ce qui
permet d'utiliser le workflow depuis le chat et depuis un appel externe sans le
dupliquer.

`Build the search` transforme le vecteur en appel SQL. Le litteral est construit
dans ce noeud plutot qu'inline dans le noeud Postgres, pour que les 3072 nombres
soient cites une seule fois. Le noeud HTTP renvoie le corps Gemini brut, donc
le vecteur est a `embedding.values`, avec un repli si le noeud vient a renvoyer
un tableau nu.

`Draft the answer` construit le prompt a partir des seuls passages renvoyes. Le
cas « aucun passage » passe par le **meme** noeud de reponse plutot que d'appeler
le modele avec un prompt vide : il n'y a donc qu'un chemin pour toutes les
reponses affichees dans le panneau.

`Ask Gemini` : `models/gemini-3.5-flash-lite`, `temperature: 0.2`.
`gemini-3.1-flash-lite` repondait 503 sur ce compte.
`simplify` est desactive volontairement : active, le noeud renvoie un item par
candidat, forme `{ content: ... }`, alors que `Reply in chat` lit
`j.candidates[0].content.parts[0].text`. La temperature se trouve dans
`options`, c'est la que ce noeud conserve `generationConfig.temperature`.

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

`Clear previous book` execute trois instructions :

```sql
delete from livres;
delete from n8n_vector_collections;
select 1 as cleared;
```

Le `select 1` final est necessaire : un `DELETE` ne renvoie aucune ligne, et le
noeud doit produire un item.

## Credentials

Toutes trois creees dans l'interface n8n, jamais versionnees :

| Noeuds | Type de credential |
| --- | --- |
| `Clear previous book`, `Find relevant passages` | `postgres` |
| `Store in Supabase` | `supabaseApi` |
| `Embed the chunks`, `Embed the question`, `Ask Gemini` | `googlePalmApi` |

Les deux noeuds HTTP utilisent `predefinedCredentialType` avec `googlePalmApi` :
la cle part dans l'en-tete que n8n construit, il n'y a pas de header a saisir.

## Modeles

| Usage | Modele | Note |
| --- | --- | --- |
| Embedding | `models/gemini-embedding-2` | 3072 dimensions |
| Redaction | `models/gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` repond 503, `gemini-2.5-*` repond 404 |

## Points non evidants, verifies en execution

- **Un noeud Postgres remplace son entree par le resultat de sa requete.** Pose
  au milieu d'une chaine, il detruit les items qu'il recoit. D'ou les noeuds en
  aval qui lisent les passages par nom.
- **Un noeud Postgres ne peut pas etre place apres l'insertion** sans effacer ce
  qu'on vient d'ecrire : la table se doublerait a chaque nouveau livre. Il
  nettoie donc avant.
- **Les credentials sont retirees quand un noeud est copie** dans un autre
  workflow, y compris par une operation `addNode` qui les contient deja. Elles se
  rattachent ensuite avec `setNodeCredential`. Les noeuds HTTP sont les plus
  discrets : ils s'executent quand meme, ils n'envoient seulement aucune cle.
- **Un groupe de noeuds ne peut pas contenir un declencheur**, et doit former un
  sous-graphe connexe avec une seule entree et une seule sortie. Les trois
  entrees de ce workflow ne convergent nulle part : c'est deliberement evite.
- **`jsonBody` doit renvoyer du texte JSON**, via `JSON.stringify`. Renvoyer un
  objet litteral produit une requete malformee.
- **`embedding` est NOT NULL sans valeur par defaut.** Une insertion sans
  vecteur echoue.
- **`Limit` n'a qu'une seule entree** : c'est un noeud `limit`, pas un Merge. Il
  ne peut pas attendre une seconde branche.
- **`gemini-embedding-001` et `gemini-embedding-2` ont des espaces
  incompatibles** entre eux. Les deux noeuds d'embeddings doivent porter le meme
  modele, sinon les vecteurs ne sont pas comparables.
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
  `Clear previous book` n'est connecte a aucune entree (c'est voulu, voir la
  section 2) et le parametre `query` de `Find relevant passages` contient
  `{{ $json.sql }}` sans prefixe `=`. Les expressions n8n doivent normalement
  s'ecrire `={{ $json.sql }}`. Ce point n'a pas ete verifie en execution.

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
- Livre_Sport : pages multiples, historique de livres plutot qu'une collection
  videe a chaque depot.