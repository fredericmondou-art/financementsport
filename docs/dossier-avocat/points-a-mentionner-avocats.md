# Points à mentionner aux avocats — rencontre de fin août 2026

> Complément à `points-a-verifier-juridique.md` (qui liste les *questions* à
> poser). Ce document liste plutôt ce qu'il faut *leur dire* en premier, pour
> qu'ils aient le contexte complet avant de répondre — pour éviter un avis
> donné sur une compréhension partielle du modèle d'affaires.

## 1. Ce qu'est la plateforme, en une phrase

Une boutique en ligne où chaque vente (produits, packs, abonnements) attribue
automatiquement un crédit en argent réel à un athlète, une équipe ou un club
sportif choisi par l'acheteur — pas un organisme de bienfaisance, pas un don
avec reçu fiscal : une entreprise commerciale privée établie au Québec.

## 2. Comment l'argent circule (le point le plus important à clarifier)

- Le client paie la plateforme (Stripe) pour un produit.
- La plateforme calcule un crédit et l'attribue au bénéficiaire choisi.
- **Le versement du crédit au bénéficiaire est manuel** : un administrateur
  valide et paie « à la main ». Aucun versement automatique, aucun Stripe
  Connect en V1.
- Un bénéficiaire peut être un athlète individuel, une équipe ou un club —
  au même niveau (pas de hiérarchie obligatoire).
- Mentionner explicitement : la plateforme détient donc, entre la vente et le
  versement, des sommes dues à des tiers. C'est ce point précis qui motive la
  question sur le statut d'« entreprise de services monétaires » (checklist,
  section 5).

## 3. Le rôle des mineurs dans le produit

- Une part significative des bénéficiaires (athlètes) sont susceptibles
  d'être mineurs.
- Comportement actuel par défaut : profil **public et complet** (« Standard »)
  — nom, impact affiché, etc. Des champs de masquage existent (`hide_*`)
  mais ne sont pas activés par défaut.
- Un consentement parental est prévu avant publication d'un profil, mais le
  mécanisme concret (qui consent, comment c'est prouvé, où c'est stocké)
  n'a pas encore été validé juridiquement.
- Préciser que le produit n'a **pas encore de client réel ni de mineur
  inscrit** : tout est en phase de test interne, ce qui donne une fenêtre pour
  ajuster avant le premier profil public réel.

## 4. Ce qui est déjà en place vs ce qui reste des gabarits

- Les pages légales existantes (confidentialité, conditions, remboursement)
  sont des **gabarits rédigés sans révision juridique**, explicitement
  marqués comme non définitifs dans le produit lui-même.
- La fonctionnalité principale (boutique, moteur de crédit, portails,
  back-office) est développée et testée depuis le 13 juillet 2026.
- Un module de tirage/billets est **développé mais désactivé** par un
  interrupteur logiciel (`RAFFLE_ENABLED=false`) — voir point 6.

## 5. Fiscalité et statut du crédit — à clarifier ensemble

- Aucune position n'a encore été prise sur la nature fiscale du crédit versé
  à un bénéficiaire (don, commission, autre) ni sur qui en assume la
  déclaration (l'entreprise, le bénéficiaire, les deux).
- Les taxes de vente (TPS 5 % + TVQ 9,975 %) sont déjà gérées sur le prix des
  produits via une table de taux — la question porte spécifiquement sur le
  traitement du **crédit**, pas sur la taxation du produit vendu.

## 6. Le module tirage/billets — dossier déjà préparé

- Un règlement de tirage modèle existe déjà
  (`docs/dossier-avocat/reglement-tirage-modele.md`), avec les points de
  validation juridique identifiés en marge (art. 206 Code criminel, art.
  74.06 Loi sur la concurrence, art. 248-249 LPC sur la publicité aux moins
  de 13 ans, Loi 25).
- Ce module reste désactivé tant qu'un feu vert écrit n'est pas reçu — aucune
  urgence à le traiter en premier si le temps manque à la rencontre.

## 7. Aucune date de lancement commercial fixée

- Le lancement dépend justement des conclusions de cette rencontre : pas de
  pression de date en sens inverse (on ne cherche pas à faire valider des
  choix déjà pris, la porte reste ouverte à des changements de modèle si
  nécessaire — ex. versements, structure du crédit, données de mineurs).

## 8. Documents à leur remettre avant ou pendant la rencontre

- `docs/dossier-avocat/points-a-verifier-juridique.md` (liste des questions)
- `docs/dossier-avocat/reglement-tirage-modele.md` (modèle de règlement de
  tirage, avec notes ⚖️ déjà identifiées)
- `docs/charte.md` (vue d'ensemble du projet : §1 contexte, §5 portée, §8.2
  contraintes légales)
- Si un dossier juridique « C.1–C.9 » externe existe déjà avec cet avocat ou
  un autre (mentionné dans une tâche antérieure sans qu'on en retrouve la
  trace dans le dépôt), l'apporter également — le préciser en début de
  rencontre pour éviter un travail en double.
