---
name: Doubt-Driven Dev
description: Méthode de développement continue fondée sur le doute et la vérification. À appliquer en permanence pendant l'implémentation, pas seulement à la fin. Distinguer les faits vérifiés des suppositions, nommer ce que l'on ne sait pas, chercher des preuves avant de construire dessus, et ne jamais traiter son propre raisonnement comme une source de vérité. S'applique dès qu'une affirmation non vérifiée pourrait fonder une décision.Mots-clés : hypothèse, supposition, vérification, preuve, source de vérité, doute, vérification.
---

# Doubt-Driven Dev

## Idée fondatrice

> « Je pense que X est vrai, mais je ne l'ai pas vérifié. »

Puis : **comment vérifier X**, avant d'y construire quoi que ce soit.

Un modèle de langage produit des énoncés plausibles, pas des faits. Le texte produit est cohérent avec ce qu'il sait, ce qui n'est pas la même chose que vrai.
Un raisonnement peut être („logique“) tout en reposant sur une prémisse fausse.

## Position dans le cycle

```
INTERVIEW          → comprendre et cadrer AVANT d'agir
DOUBT-DRIVEN-DEV  → attitude de doute PENDANT tout le développement
HOSTILE-REVIEW    → remise en cause APRÈS une première solution
```

Différence avec `interview` : celle-ci questionne **le monde** (l'utilisateur, le
dépôt). Celle-ci questionne **ses propres paroles**.
Différence avec `hostile-review` : celle-ci attaque **le livrable** une fois
produit. Celle-ci empêche que le livrable repose sur du non-vérifié.

## Quand l’appliquer

En permanence, à chaque décision. Relancer le doute plus spécifiquement quand :

| Situation | Ce qu’il faut verifier |
| --- | --- |
| Choix d’une API, d’un schema, d’un format | La source officielle, à la version utilisee |
| Règle de nommage, style du code | Au moins deux ou trois fichiers voisins |
| Ajout d’une dependance | Le besoin est-il deja couvert ? Le surcout est-il justifie ? |
| Performance, capacité, coût | Une mesure, jamais une estimation |
| Migration, conversion, reecriture | Le resultat est-il verifie sur des donnees reelles ? |
| Affirmation reprise d’une source | La source est-elle encore celle que l’on croit ? |
| Correction d’un bug | La cause est-elle comprise, pas seulement le symptome ? |

Inutile d’un doute artificiel sur ce qui est evident et reversible. Le doute a
un coût : il ralentit. Il se justifie quand l’enjeu le justifie.

## Étiquetage : le geste central

Toute affirmation porte une étiquette. Trois catégories, jamais mélangées :

| Étiquette | Sens | Effet sur la décision |
| --- | --- | --- |
| **Fait** | observé, exécuté, lu dans une source | peut fonder une décision |
| **Hypothèse** | plausible, non testée | à vérifier avant d'en dépendre |
| **Inconnu** | non savoir, signale comme tel |

Formuler sans ambiguïté :

> Le champ `quantity` est un entier (fait : lu dans le schéma ligne 42).
> L'API limite à 1000 appels par minute (**hypothèse**, non vérifiée : la
> documentation ne précise pas de quota).
> Je ne sais pas si le comportement diffère en production (**inconnu**).

Une phrase non étiquetée qui n sera lue plus tard comme un fait. C'est
précisément le mode de défaillance que cette skill combat.

## Échelle de vérification

Du plus faible au plus fort. Chercher **le plus haut niveau atteignable**, jamais
le premier qui semble suffisant.

| Niveau | Moyen | Coût | Force |
| --- | --- | --- | --- |
| 1 | se souvenir | nul | faible |
| 2 | déduire du contexte | nul | faible |
| 3 | chercher la documentation | faible | bonne |
| 4 | lire le code source / le schéma | faible | forte |
| 5 | exécuter un test qui échoue | moyen | forte |
| 6 | observer le comportement réel | moyen | très forte |
| 7 | faire confirmer par l'utilisateur | faible | définitive |

Une affirmation importante qui n'est étayée qu'aux niveaux 1–2 est une
hypothèse, quelle que soit la confiance avec laquelle elle est exprimée.

**Exigence minimale par type de décision :**

- structure de données, schéma, format d'échange → niveau 4 minimum ;
- comportement d'une dépendance, d'une API tierce → niveau 5 ou 6 ;
- performance, capacité, coût → niveau 6, jamais l'estimation ;
- convention de nommage, style du dépôt → niveau 4, en regardant au moins deux
  fichiers voisins ;
- hypothèse structurante (architecture, choix de dépendance) → niveau 5 ou 7.

## Ce que l'IA n'est pas

L'IA **n'est pas** la source de vérité, même sur ses propresitérations.
Elle est une source d'hypothèses, rapide et bien documentée.

Sources de vérité, par ordre d'autorité :

1. ce qui a été exécuté et dont la sortie a été lue ;
2. la documentation officielle de la dépendance ;
3. le code existant du dépôt ;
4. les données réelles produites par le système ;
5. les tests, verts ou rouges ;
6. l'opinion de l'IA, même argumentée.

Un point 6 qui contredit un point 1 à 5 est un point 6 faux.

## Boucle de vérification

À appliquer à chaque affirmation qui pourrait fonder une décision :

```
1. Formuler l'affirmation précisément        (une seule phrase, testable)
2. La classer : fait / hypothèse / inconnu ?
3. Si fait      → l'utiliser, citer le moyen de vérification
4. Si hypothèse → quel niveau de vérification est atteignable ici ?
                  le mettre en œuvre avant d'en dépendre
5. Si inconnu   → peut-on l'isoler ?
                  choisir la décision réversible, ou demander
6. Si la vérification contredit l'affirmation → corriger, et remonter
   la correction dans le code déjà écrit
```

L'étape 6 n'est pas optionnelle : une hypothèse invalidée en cours de route a
des conséquences propagées dans le code déjà produit. Il faut chercher
explicitement ce qui doit être refait.

## Continuité

Cette attitude n'est pas une phase. Elle s'applique :

- **au choix d'un nom** — le dépôt utilise-t-il `snake_case` ou `kebab-case` ?
  Regarder trois fichiers voisins avant d'écrire le quatrième ;
- **à l'ajout d'une dépendance** — le problème est-il déjà résolu par une
  dépendance existante ? Une lib de 20 lignes remplace-t-elle une dépendance de
  4 Mo ?
- **à l'écriture d'un test** — le test peut-il échouer pour une mauvaise raison
  attendue ? Un test qui passe toujours ne vérifie rien ;
- **à l'usage d'une API** — le comportement est-il documenté, ou deviné à partir
  d'un cas observé ?
- **à la conclusion** — « ça marche » est une affirmation : laquelle a été
  vérifiée, et laquelle a été supposée ?

## Erreurs à éviter

- **Construire sur une hypothèse non vérifiée.** Trois cents lignes posées sur
  une prémisse fausse ne se corrigent pas, elles se réécrivent.
- **Confondre fluidité et justesse.** Une réponse qui s'enchaîne bien est
  précisément le résultat d'un modèle de langage ; la fluidité n'est pas une
  preuve.
- **Rapporter une hypothèse comme un fait**, par lapse ou pour gagner du temps.
  C'est l'erreur la plus coûteuse, parce qu'elle est invisible pour le lecteur.
- **Utiliser ses propres souvenirs de documentation** sans ouvrir la
  documentation. Les versions changent, et les souvenirs non.
- **Vérifier une fois puis relâcher.** Une vérification vaut pour l'affirmation
  qu'elle porte, pas pour les affirmations voisines qu'on n'a pas regardées.
- **Se tromper d'une correction.** « J'avais dit que X, finalement Y » sans
  revenir sur les conséquences de X dans le code.
- **Chercher des preuves uniquement pour confirmer.** Si la première
  vérification est défavorable, la vraie question est de chercher la preuve
  contraire, pas d'abandonner discrètement l'hypothèse.
- **Confondre absence de contre-preuve et preuve d'absence.** « Je n'ai trouvé
  aucune erreur » ne veut pas dire « il n'y a pas d'erreur ».

## Réaction à l'incertitude

Trois issues, dans cet ordre de préférence.

**1. Vérifier.** Coût faible, gain élevé. C'est le réflexe par défaut.

**2. Rendre l'incertitude visible.** Écrire l'hypothèse là où elle sera lue
par quelqu'un d'autre. Une incertitude écrite se traite ; une incertitude
absente se propage.

**3. Isoler le risque.** Quand l'incertitude est irréductible et qu'il faut
décider malgré tout :

- choisir l'option **réversible** (retractable sans coût disproportionné) ;
- **isoler** le point incertain (une fonction, un module, un parametre unique) ;
- écrire dans le code ce qui devrait être vrai pour que l'hypothèse tienne ;
- dire explicitement que la décision est provisoire et ce qui la confirmerait
  ou l'infirmerait.

```ts
// Hypothèse non vérifiée : le service renvoie toujours un tableau.
// Si elle est fausse, ce comportement est le seul à changer.
const items = Array.isArray(response) ? response : [response];
```

Si l'incertitude porte sur une décision **structurante** et irréversible,
préférer poser la question à l'utilisateur plutôt que d'abandonner en silence :
le coût d'une question est d'un message, celui d'une reprise complète est
le projet.
