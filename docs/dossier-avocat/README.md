# Dossier avocat — pièces en attente de révision juridique

Ce dossier regroupe, côté dépôt de code, les pièces qui doivent être remises à
l'avocat avant toute activation d'une fonctionnalité soumise à gate juridique
(voir `CLAUDE.md` et les fichiers `PHASE_C.*` dans `docs/prompts/` ou
`docs/archive/prompts/`).

## Contenu actuel

| Pièce | Provient de | Statut |
|---|---|---|
| `reglement-tirage-modele.md` | Tâche `C.10` (module tirage/billets, `docs/prompts/phase-c10-tirage.md`) | Modèle de travail — champs `[CROCHETS]` et notes `⚖️ AVOCAT :` à trancher. Bloque uniquement `RAFFLE_ENABLED=true`, pas le développement. |

## Note sur le « dossier C.1–C.9 »

Le fichier `phase-c10-tirage.md` (section C.10.10) indique que ce règlement
doit rejoindre un dossier existant « C.1–C.9 » avant remise à l'avocat.
**Aucune trace de ce dossier (fichiers, dossier, ou mentions) n'a été trouvée
dans ce dépôt** — il s'agit vraisemblablement d'un dossier tenu hors dépôt
(support papier, courriel, ou espace de travail externe avec l'avocat).

`docs/dossier-avocat/` sert donc de point d'atterrissage **local** pour les
pièces produites par le code ; à combiner manuellement avec le dossier C.1–C.9
externe avant l'envoi effectif à l'avocat. Si ce dossier existe en fait
quelque part dans un outil connecté (Drive, Notion, etc.), il vaut la peine de
le signaler pour qu'on le lie correctement la prochaine fois.

## Gate d'activation

Aucune pièce de ce dossier ne doit être publiée ni aucun flag associé
(`RAFFLE_ENABLED`, etc.) activé avant un feu vert écrit de l'avocat. Voir la
section « Gate juridique » du fichier de tâche correspondant pour la liste
exacte des points à valider.
