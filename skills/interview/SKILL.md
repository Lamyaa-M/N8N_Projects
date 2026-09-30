---
name: Interview
description: Phase d'interview approfondie avant d'écrire du code. À utiliser avant toute implémentation dont les contraintes conditionnent le résultat, ou dès qu'une demande est ambiguë, semble reposer sur une hypothèse non vérifiée, ou pourrait déjà être couverte par l'existant. Interviewer l'utilisateur, explorer le dépôt, lister les informations manquantes, contester les demandes fragiles, et produire un cadrage écrit. Ne jamais commencer à coder avec une information importante manquante.Mots-clés : interview, questions, cadrage, spécification, exploration, avant de coder, requirements.
---

# Interview

## Position dans le cycle

```
INTERVIEW          → comprendre, questionner, explorer AVANT d'agir
DOUBT-DRIVEN-DEV  → attitude de doute PENDANT le développement
HOSTILE-REVIEW    → remise en cause APRÈS une première solution
```

Cette skill ne décrit pas le développement : elle décide **de quoi** développer.
Une interview bâclée rend les deux autres inutiles, tout le reste du travail
reposant sur une base fausse.

## Quand l'appliquer

Déclencheurs — si l'un est vrai, l'interview est requise :

- la demande contient un adjectif ou un superlatif sans critère
  (« rapide », « propre », « robuste », « comme avant ») ;
- plusieurs interpretations plausibles donnent des résultats différents ;
- la demande touche du code existant dont l'historique n'est pas connu ;
- la demande repose sur un état du monde qu'il faut vérifier (API, schéma,
  version, convention, disponibilité d'un outil) ;
- le coût d'une erreur est élevé ou difficile à défaire ;
- l'utilisateur dit « fais comme X » sans que X soit accessible.

Non requise : correction ponctuelle et évidente, ou demande portant sur un détail
déjà entièrement spécifié dans le contexte fourni.

## Procédure

### 1. Formuler l'objectif réel

Reformuler en une phrase ce qui doit être vrai **après** l'intervention, en
termes observables. Distinguer l'objectif du moyen demandé : l'utilisateur
décrit souvent une solution qu'il connaît, pas le problème qu'il rencontre.

Si l'objectif ne peut pas s'écrire ainsi, c'est le premier signal qu'il manque
de l'information.

### 2. Explorer l'existant — avant de proposer quoi que ce soit

Ne jamais proposer une solution sans avoir cherché si elle existe déjà.

- `grep` / `glob` sur les termes du domaine, les noms de fichiers, les
  symboles, les messages d'erreur ;
- lecture du README, des docs, des ADR, des commentaires, des TODOs ;
- historique git : `git log`, `git log -S`, pour trouver une implémentation
  précédente supprimée ou une tentative abandonnée ;
- configuration, dépendances, variables d'environnement ;
- tests existants : ils documentent le comportement attendu.

Déléguer cette exploration à un sous-agent quand elle est large et que son
résultat conditionne la suite. Le sous-agent rapporte des faits et des
emplacements, pas des conclusions.

### 3. Mesurer l'écart

Confronter l'existant à la demande, ligne par ligne :

| Élément | Déjà présent ? | Réutilisable tel quel ? | Lieu exact |
| --- | --- | --- | --- |
| … | oui / non / partiel | oui / à adapter / à réécrire | `chemin:ligne` |

Un écart « non » est un fait à signaler, pas un travail à créer
automatiquement. « Déjà fait ailleurs » est le résultat le plus fréquent et le
plus rentable à obtenir.

### 4. Lister les informations manquantes

Recenser explicitement ce qui manque pour décider, et pour chacune, dire **comment
l'obtenir** : question à poser, fichier à lire, commande à exécuter, documentation
à consulter.

Formuler la distinction :

- **bloquant** — impossible de commencer correctement sans la réponse ;
- **structurant** — la solution change selon la réponse ;
- **déterminant à la marge** — l'implémentation varie, l'architecture non.

Ne pas confondre « bloquant » et « intéressant ». Sur une liste de dix
questions, il est normal qu'une seule bloque réellement.

### 5. Contester la demande

Point non négociable : **challenger l'utilisateur quand la demande semble
incorrecte, incomplète ou fondée sur une hypothèse non vérifiée.**

Signaler, avec le motif et non par principe :

- l'hypothèse sous-jacente n'a pas été vérifiée (« ça marche en local » — vérifié
  sur une version de Node différente ?) ;
- la solution proposée est plus risquée qu'une alternative (« on peut le faire
  en SQL » — alors que la base est en lecture seule ?) ;
- la demande contredit une contrainte déjà identifiée ;
- la demande dépasse le périmètre et il vaut mieux le dire maintenant ;
- la demande est impossible telle quelle, et reformuler ce qui est faisable.

Formuler comme une question, jamais comme un refus : « X semble contredire Y,
comment wants-on procéder ? »

### 6. Établir les contraintes

- **Environnement** : versions, plateformes, réseaux, permissions, cuota ;
- **Non fonctionnelles** : performance attendue, durée, taille, sécurité,
  confidentialité ;
- **Maintenance** : qui lisent cela dans six mois, dépendances évitables,
  ce qui doit rester maintenable ;
- **Réversibilité** : ce qui est difficile à défaire, ce qui doit l'être.

### 7. Décider et enregistrer

Formuler chaque décision en une phrase, avec sa justification et son
alternative écartée. Séparer nettement :

- ce qui est **décidé** ;
- ce qui est **hypothèse** (et sera à revérifier) ;
- ce qui reste **ouvert** et n'a pas besoin d'être tranché maintenant.

## Condition de sortie

Ne pas écrire de code de production tant qu'un seul point bloquant est ouvert.

Produire alors un cadrage court, en quelques lignes :

```
Objectif      : <observable>
Contraintes   : <les déterminantes>
Décisions     : <choix + justification>
Hypothèses    : <à revérifier, avec le moyen de vérification>
Hors périmètre: <ce qui n'est pas traité>
```

Un cadrage écrit sert de point de comparaison : le `hostile-review` pourra
vérifier la solution **contre** ce document plutôt que contre une intention
vague.

## Erreurs à éviter

- Coder tout de suite parce que la demande paraît évidente. « Évidente » est le
  moment où l'on reconstruit un système existant.
- Poser des questions rhétoriques dont la réponse est déjà dans le dépôt.
- Poser vingt questions et bloquer : la plupart n'ont pas d'impact sur la
  décision. Hiérarchiser par criticité.
- Contester par principe, sur tout. Le scepticisme sans argument décrédibilise.
- Conclure à « rien à dire » faute d'avoir cherché dans l'existant.
- Accepter une hypothèse non vérifiée parce qu'elle est plausible et que la
  vérifier coûte cher. Le coût de vérification se paie une fois, celui de
  l'erreur se paie à chaque exécution.
- Consigner une décision sans sa raison : la prochaine itération ne saura pas
  pourquoi, et la rouvrira inutilement.

## Réaction à l'incertitude

Quand une information manque et ne peut pas être obtenue immédiatement :

1. le dire explicitement, sans le masquer derrière une formulation affirmative ;
2. distinguer ce qui bloque de ce qui n'est pas critique ;
3. si un choix est forcé, préférer **la décision réversible** et **isolable** —
   une décision réversible puis mal informée coûte une retouche, une décision
   irréversible peut exiger une reprise complète ;
4. formuler la question à poser, pour la reprendre dès que possible.

Ne jamais combler un trou de contexte par une supposition présentée comme un
fait. Une supposition étiquetée comme telle est exploitable ; une supposition
déclarée est une source de vérité qui n'en est pas une.