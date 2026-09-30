---
name: Hostile Review
description: Relecture adversariale de sa propre production, après avoir livré une première solution. À appliquer avant d'annoncer qu'un travail est terminé, ou dès qu'un résultat semble correct. Chercher activement ce qui est faux, les cas limites, les oublis, les erreurs de logique, les régressions ; tenter de casser la solution ; vérifier qu'elle répond réellement à la demande ; puis corriger ce qui a été trouvé.Mots-clés : revue, relecture, critique, vérification, cas limites, bugs, régression, revue adversariale.
---

# Hostile Review

## Attitude

> **Qu'est-ce qui pourrait être faux dans ce que je viens de faire ?**

Une solution qui « marche sur un cas simple » n'est pas une solution correcte :
elle est *non réfutée* sur un seul cas. Cette skill existe pour la réfuter.

Le biais le plus dangereux n'est pas l'ignorance, c'est la satisfaction précoce : dès
qu'un code s'exécute et rend le résultat attendu, la tendance naturelle est de
passer à la suite. C'est exactement l'endroit où l'erreur se loge.

## Position dans le cycle

```
INTERVIEW          → comprendre et cadrer AVANT d'agir
DOUBT-DRIVEN-DEV  → attitude de doute PENDANT le développement
HOSTILE-REVIEW    → remise en cause APRÈS une première solution
```

Différence avec `doubt-driven-dev` : celle-ci doute de ce que l'on **affirme**
pendant qu'on construit. Celle-ci attaque **ce qui a été construit**, une fois
livré, avec l'intention explicite de le détruire.

À la fin, si des défauts sont trouvés et corrigés, **retourner en
`doubt-driven-dev`** : la correction doit elle-même être vérifiée, sinon elle
introduit un nouveau cas non.refuté.

## Quand l'appliquer

 systiquement avant de dire « c'est fait ». Renforcer quand :

- le coût d'un échec est élevé ou difficile à inverser ;
- le code touche de la sécurité, de l'argent, des données personnelles ;
- la solution comporte de la logique métier, des conversions, des seuils ;
- plusieurs alternatives ont été écartées (il faut confirmer le choix) ;
- la tâche semble simple — c'est là que le biais est le plus fort.

## Vecteurs d'attaque

Passer chacun systématiquement. Ne pas s'arrêter au premier qui « va bien ».

### 1. La demande

- Relecture de la demande initiale, mot à mot, hors mémoire.
- La solution répond-elle à **ce qui a été demandé**, ou à ce qui était facile ?
- Les exigences ont-elles été satisfaites **entièrement**, ou seulement là où
  l'exécution était visible ?
- Y avait-il un cadrage écrit ? La solution lui est-elle conforme ? Les écarts
  sont-ils assumés ou subis ?

### 2. Les cas limites

Passer en revue les entrées hostiles :

- vide (`""`, `[]`, `{}`, `null`, `undefined`), et *absence de propriété* contre
  *propriété présente et vide* ;
- à un seul élément, exactement à la limite, juste au-delà ;
- valeurs négatives, zéro, `NaN`, `Infinity`, très grandes, très petites ;
- caractères accentués, emoji, langues orientales, bidirectionnisme, CTL ;
- doublons, ordre inverse, entrées simultanées ;
- longue durée, horloge décalée, fuseau, heure d'été ;
- réseau lent ou coupé, réponse partielle, réponse qui change entre deux appels.

Pour chacun : que fait réellement le code, et non que fait le code au cas nominal ?

### 3. La logique

- Les conditions aux bornes (`>`, `>=`, `<`, `<=`) sont-elles aux bons endroits ?
- Les inversions de sens de comparaison sont-elles un accident classique ?
- Les valeurs par défaut sont-elles sûres, ou est-ce qu'elles propagent le silence ?
- Les erreurs sont-elles réellement rattrapées, ou simplement masquées ?
- Un `null` qui traverse une couche finit-il par provoquer une erreur loin de sa
  cause ?
- Les effets de bord (écriture, envoi, suppression) ont-ils lieu quand on le
  croit, et **seulement** quand on le croit ?

### 4. Les oublis

- Le traitement d'erreur est-il présent **partout** où il le faut ?
- Nettoyage : fichiers temporaires, verrous, transactions, ressources ouvertes.
- Annulation : que se passe-t-il en cas d'échec au milieu ?
- Idempotence : que se passe-t-il si le code est exécuté deux fois ?
- Journalisation : assez pour diagnostiquer, pas assez pour fuiter un secret.
- Documentation et commentaires : décrivent-ils ce que le code fait
  *réellement*, ou ce qu'il faisait avant la dernière modification ?

### 5. Les choix techniques

- Existe-t-il une façon standard, plus simple, ou déjà présente dans le dépôt ?
- A-t-on réinventé ce que le langage, la bibliothèque ou la plateforme
  fournissent déjà ?
- Le niveau d'abstraction est-il au bon endroit — ni trop haut pour être testable,
  ni trop bas pour être lisible ?
- La solution est-elle plus complexe que le problème ne l'exige ? Toute
  complication doit se justifier.
- Les dépendances ajoutées : nécessaires ?ables ? déjà couverte par l'existant ?

### 6. Les hypothèses

Reprendre la liste issue de `doubt-driven-dev` et de `interview` :

- lesquelles ont été **vérifiées** depuis ?
- lesquelles reposent encore sur une supposition ?
- une hypothèse invalide a-t-elle des conséquences **déjà matérialisées** dans le
  code ? Lesquelles ? Il faut aller les chercher, pas supposer qu'elles sont
  circonscrites.

### 7. Les régressions

- Que casse ce changement ? Fonctions appelantes, API publique, comportement
  attendu par d'autres, formats de données déjà en base.
- Les tests existants passent-ils **vraiment** ? Un test supprimé, sauté, ou
  devenu obsolète est un test supprimé.
- La mise à jour reste-t-elle rétrocompatible pour les données existantes ?

### 8. Le résultat lui-même

L'attaque la plus honnête : **est-ce que ça fait vraiment ce qu'on veut ?**

- Lancer le vrai cas, pas une version qui ressemble au vrai cas.
- Comparer la sortie réelle à l'attendu, caractère par caractère quand le format
  le permet.
- Demander à un pair, ou à un sous-agent, de tenter d'utiliser la solution sans
  connaître l'implémentation.

## Ce qu'il faut tester

Tester ce qui **peut** l'être, et dire ce qui ne l'a pas été :

- exécuter les tests existants avant de conclure ;
- écrire un test qui reproduit le cas limite qui inquiète le plus ;
- tenter de faire échouer la solution : entrée malformée, permission retirée,
  dépendance cassée, disque plein, horloge décalée ;
- vérifier l'erreur : le message est-il utile à quelqu'un qui n'a pas écrit le
  code ?

Un test qui n'a jamais échoué ne prouve rien : s'assurer qu'il **échouerait** si
la logique était fausse.

## Réaction à l’incertitude

Une revue qui ne trouve rien de vérifiable ne vaut pas mieux qu’aucune revue :
elle donne une assurance fausse. Quand une vérification est impossible,
l’énoncer précisément plutôt que de laisser croire à une couverture.

| Situation | Réaction |
| --- | --- |
| Un défaut trouvé et corrige | Re-tester : la correction est une nouvelle production |
| Un défaut trouvé, non corrigeable | Le signaler explicitement, avec sa portée |
| Un test impossible à écrire ici | Le dire, et décrire à la main ce qui le vérifierait |
| Un environnement inaccessible | Le nommer, et indiquer ce que cela laisse non vérifié |
| Un doute qui subsiste | Le formuler comme un doute, pas comme une réserve polie |
| Un défaut profond, hors perimetre | Ne pas le corriger en douce : le remonter |

Trois états de sortie acceptables : **rien à signaler**, **corrigé**, ou **signalé
avec le détail de ce qui n’a pas pu être vérifié**. Le quatrième —
*« c’est bon » sans preuve — n’en est pas un.

## Corriger

1. Lister les défauts trouvés, du plus grave au moins grave.
2. Corriger ce qui est corrigeable.
3. Re-tester après correction — la correction est une nouvelle production, et
   donc soumise à la même critique.
4. **Rendre compte** de ce qui n'a pas pu être vérifié, et de ce qui reste
   incertain. Une revue qui rapporte « tout est bon » alors que la moitié n'a pas
   été testée est pire que pas de revue : elle donne une assurance fausse.

## Erreurs à éviter

- **Revue superficielle** : relire en diagonale, ne rien trouver de concluant,
  conclure que c'est bon. C'est le cas le plus fréquent, et le moins utile.
- **Confondre « ça marche » et « c'est correct »** — surtout quand « ça marche »
  a été observé sur le cas que l'on avait sous les yeux.
- **Se protéger** : justifies plutôt que de corriger. Un choix se justifie avant
  d'être critiqué, pas après.
- **Reformuler pour ne pas corriger** : changer le vocabulaire du défaut jusqu'à
  ce qu'il disparaisse du rapport.
- **S'arrêter au premier défaut trouvé.** Les suivants sont souvent plus graves.
- **Corriger le symptôme** : l'erreur visible plutôt que la cause, qui reste dans
  le code et se reproduira ailleurs.
- **Ne pas dire ce qui n'a pas été vérifié**, en laissant croire que tout a été
  couvert. C'est l'erreur la plus coûteuse de cette skill.
