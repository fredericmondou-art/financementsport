# Prompts d'exécution — Phase 1.4b (Confiance et finitions visuelles)

Améliorations ciblées sur le site DÉJÀ construit et déployé
(financementsport.vercel.app), pour qu'il passe de « prototype fonctionnel » à
« site de confiance, propre et clair, dédié aux gens ».

Diagnostic de départ (revue de captures, juin 2026) : base saine et lisible, mais
trop vide, peu de réassurance, pas d'images, formulations parfois techniques, et
un bug bloquant sur la création de campagne.

À exécuter après la Phase 1.4 (design de base). Réutilise OBLIGATOIREMENT le
système de design existant (tokens, `components/ui/*`) — cf. CLAUDE.md. Mêmes
règles : une tâche à la fois, tests verts, rapport après chacune, français,
montants CAD, confidentialité mineurs respectée.

PRINCIPE TRANSVERSAL — « confiance » : pour un parent qui confie de l'argent
destiné au sport d'enfants, la confiance vient d'éléments concrets : savoir qui est
derrière, comment ses données et celles de son enfant sont protégées, voir des
preuves (témoignages, exemples chiffrés), des visuels chaleureux, et des montants
clairs avant de payer. Chaque tâche ci-dessous sert cet objectif.

---

## TÂCHE 1.4b.1 — Corriger le bug de création de campagne (PRIORITÉ)

**Contexte.** La page `/campagnes/nouvelle` affiche « Une erreur est survenue »
(page d'erreur générique). C'est la fuite de confiance la plus grave : un
responsable qui veut lancer une campagne tombe sur une erreur et abandonne.

**Objectif.** Identifier la cause de l'erreur sur `/campagnes/nouvelle`, la
corriger, et garantir que la page de création de campagne se charge et fonctionne
pour un utilisateur autorisé (responsable / club_admin).

**Fichiers concernés.**
- La route/page `app/(portal)/campagnes/nouvelle/*` et ses dépendances
- Logs serveur / console pour diagnostiquer (data fetching, permissions, données
  manquantes)

**Règles.**
- D'abord DIAGNOSTIQUER (lire les logs, reproduire), ne pas patcher à l'aveugle.
- Vérifier que les permissions (club_admin / team_manager) n'empêchent pas le
  chargement légitime.
- Si l'erreur vient de données manquantes (aucun club/équipe), afficher un état
  guidé (« crée d'abord ton équipe ») plutôt qu'une erreur technique.
- Respecter la limite de débogage (2-3 tentatives puis QUESTIONS.md).

**Critères d'acceptation.**
- Un utilisateur autorisé ouvre `/campagnes/nouvelle` sans erreur.
- Le cas « pas encore d'équipe » affiche un message clair et une action, pas une
  page d'erreur.

**Tests attendus.**
- e2e : un club_admin accède à la création de campagne sans erreur.
- e2e : cas sans données préalables → message guidé, pas d'erreur générique.

---

## TÂCHE 1.4b.2 — Page d'accueil : sections de confiance et portes d'entrée

**Contexte.** Section 3 du cahier. L'accueil actuel est squelettique : héros nu,
liste « Comment ça fonctionne » plate, et il manque tous les signaux de confiance.

**Objectif.** Enrichir l'accueil avec : un héros chaleureux (visuel + 3 boutons
d'entrée), un exemple chiffré concret, un « Comment ça fonctionne » en cartes, des
témoignages, les sports desservis, une courte FAQ, et l'accès aux pages de
confiance (À propos, Confidentialité, Conditions).

**Fichiers concernés.**
- `app/page.tsx` (accueil) et composants de section
- Liens de pied de page vers les pages de contenu (cf. tâche 1.4b.5)

**Règles.**
- Trois portes d'entrée (cahier section 3) : « Trouver un athlète », « Lancer une
  campagne », « Voir la boutique ».
- Exemple chiffré concret et honnête (ex: « Un achat de 120 $ génère 18 $ versés au
  bénéficiaire que tu choisis »), cohérent avec les règles de crédit réelles.
- « Comment ça fonctionne » : 4 cartes (icône + titre court + phrase), pas une liste
  nue.
- Témoignages : prévoir la STRUCTURE ; tant qu'il n'y a pas de vrais témoignages,
  utiliser un placeholder clairement neutre OU masquer la section (ne JAMAIS inventer
  de faux témoignages attribués à de vraies personnes).
- Pied de page avec liens vers À propos / Confidentialité / Conditions / Contact.
- Mobile-first ; réutiliser les composants du système de design.

**Critères d'acceptation.**
- L'accueil présente les 3 boutons d'entrée, un exemple chiffré, le « comment ça
  marche » en cartes, une FAQ courte, et les liens de confiance en pied de page.
- Aucun faux témoignage nominatif ; la section témoignages est soit neutre, soit
  masquée si vide.
- Rendu correct sur mobile et desktop.

**Tests attendus.**
- e2e : présence des 3 boutons d'entrée et des liens de pied de page ; navigation
  vers les pages de contenu.

---

## TÂCHE 1.4b.3 — Boutique : images produits et cartes alignées

**Contexte.** Section 8. Les cartes de packs sont propres et affichent bien le
crédit généré, mais l'ABSENCE d'images fait « pas fini », et les hauteurs de cartes
ne sont pas alignées (bouton « Ajouter au panier » désaligné sur une carte).

**Objectif.** Ajouter une image à chaque pack/produit et uniformiser les cartes
(même hauteur, bouton aligné), pour une boutique crédible et soignée.

**Fichiers concernés.**
- Composant de carte produit ; grille de la boutique
- Champ image des produits (déjà prévu : `products.image_url`)

**Règles.**
- Chaque carte a une image en haut, format homogène (même ratio).
- Cartes de hauteur égale dans la grille ; bouton « Ajouter au panier » aligné en bas.
- Si un produit n'a pas d'image, afficher un visuel de remplacement neutre et
  cohérent (pas de carte « cassée »).
- Conserver l'affichage clair du prix ET du crédit généré (déjà bien).

**Critères d'acceptation.**
- Tous les packs affichent une image et des cartes de hauteur égale.
- Le bouton d'ajout est aligné sur toutes les cartes.
- Un produit sans image affiche le visuel de remplacement, pas un trou.

**Tests attendus.**
- Rendu : grille alignée, images présentes ou remplacement ; vérif responsive.

---

## TÂCHE 1.4b.4 — Panier : clarté, taxes, impact et paiement rassurant

**Contexte.** Section 12. Page la plus sensible (décision de payer). Problèmes
actuels : formulations techniques (« Répartition actuelle : 100 % entre 0
bénéficiaire -- enregistrez pour confirmer »), taxes (TPS/TVQ) absentes, pas de
total clair ni de bouton de paiement visible, et le bloc « Impact » reste vide au
moment clé.

**Objectif.** Rendre le panier clair et rassurant : langage humain, récapitulatif
complet (sous-total, TPS, TVQ, total), impact bien mis en valeur, et chemin de
paiement évident.

**Fichiers concernés.**
- `app/(shop)/panier` et composants associés
- Calcul d'affichage des taxes (lecture depuis `tax_rates`, ne pas coder en dur)

**Règles.**
- Remplacer toute formulation technique par du langage humain (« Choisis qui tu
  veux encourager » plutôt que « 100 % entre 0 bénéficiaire »).
- Afficher le détail : sous-total, TPS (5 %), TVQ (9,975 %), total — clairement,
  avant le paiement.
- Le bloc « Impact de votre achat » doit inciter à choisir un bénéficiaire de façon
  engageante, et afficher l'impact dès qu'un bénéficiaire est choisi.
- Bouton de paiement clair et visible (« Payer » / « Passer au paiement »).
- Ne change PAS la logique de calcul (crédits, répartition) : présentation et
  clarté seulement.

**Critères d'acceptation.**
- Le panier affiche sous-total, TPS, TVQ et total avant paiement.
- Plus aucune formulation technique visible par l'utilisateur.
- Le chemin vers le paiement est évident ; l'impact s'affiche dès qu'un bénéficiaire
  est sélectionné.

**Tests attendus.**
- e2e : panier avec un pack → taxes et total affichés → choix bénéficiaire → impact
  visible → accès au paiement.
- Unitaire : affichage des taxes cohérent avec `tax_rates` (pas de taux en dur).

---

## TÂCHE 1.4b.5 — Pages de confiance (À propos, Confidentialité, Conditions, Contact)

**Contexte.** Sections 45, 48, 59. Aucune page institutionnelle n'existe. Pour un
parent, savoir qui gère l'argent et comment les données (surtout celles des enfants)
sont protégées est central pour la confiance — et plusieurs de ces pages sont aussi
des obligations à terme.

**Objectif.** Créer les pages : À propos, Politique de confidentialité, Conditions
d'utilisation, Politique de remboursement/livraison, et Contact — accessibles
depuis le pied de page.

**Fichiers concernés.**
- `app/(public)/a-propos`, `/confidentialite`, `/conditions`, `/contact`, etc.
- Liens de pied de page

**Règles.**
- Contenu en français, clair, honnête.
- IMPORTANT : Cowork rédige des GABARITS de base (structure + contenu de départ),
  mais inscrit visiblement que les textes légaux (confidentialité, conditions,
  protection des données de mineurs / Loi 25) DOIVENT être révisés par un
  professionnel avant tout lancement commercial réel. Ne pas présenter ces textes
  comme juridiquement définitifs.
- Page Contact : formulaire ou adresse de contact fonctionnelle.
- Ne pas inventer de fausses informations sur l'entreprise (équipe, adresse) :
  laisser des champs à compléter par le propriétaire si l'info n'est pas connue.

**Critères d'acceptation.**
- Les pages existent et sont accessibles depuis le pied de page.
- Les pages légales portent une mention claire « à faire valider juridiquement ».
- Aucune fausse information factuelle inventée sur l'entreprise.

**Tests attendus.**
- e2e : navigation vers chaque page depuis le pied de page.

---

## TÂCHE 1.4b.6 — États vides encourageants et finitions générales

**Contexte.** Plusieurs écrans (Mon compte, listes) affichent des « Aucun … » froids
qui donnent une impression d'abandon. Un bon état vide invite à agir.

**Objectif.** Transformer les états vides en invitations à l'action, et passer une
finition générale (espacements cohérents, alignements, largeur de contenu, états de
chargement) pour une impression soignée d'ensemble.

**Fichiers concernés.**
- Composants d'état vide réutilisables
- Écrans concernés (compte, commandes, impact, listes)

**Règles.**
- Chaque état vide : message encourageant + action claire (ex: « Encourage ton
  premier athlète » → bouton vers la boutique / la recherche).
- Harmoniser les espacements et la largeur de contenu (éviter l'impression de vide
  excessif des grandes pages centrées).
- États de chargement propres (pas d'écran blanc) là où des données se chargent.
- Réutiliser les composants du système de design ; ne pas créer de styles ad hoc.

**Critères d'acceptation.**
- Les écrans « vides » proposent une action au lieu d'un simple constat.
- Mise en page cohérente et soignée sur les pages clés, mobile et desktop.

**Tests attendus.**
- Rendu : états vides avec action ; vérif responsive des pages clés.

---

## Après la Phase 1.4b

Le site donne une impression de sérieux et de confiance : pas de page d'erreur sur
un parcours clé, accueil rassurant avec preuves et portes d'entrée, boutique avec
visuels, panier clair avec taxes et impact, pages institutionnelles présentes, et
états vides engageants. C'est le moment idéal pour le faire revoir par quelques
personnes du profil cible (un parent, un responsable) et noter leurs réactions.

RAPPEL : les pages légales restent des gabarits à faire valider par un professionnel
avant tout lancement commercial réel (Loi 25, données de mineurs, taxes).
