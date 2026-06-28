# Prompts d'exécution — Phase 1.6 (UX de tous les usagers)

Cette phase soigne l'expérience des TROIS grands types d'usagers, par ordre
d'importance stratégique :
- BLOC A — Client / parent acheteur (le plus critique : c'est lui qui paie)
- BLOC B — Responsable de campagne (il amène les acheteurs)
- BLOC C — Athlète (motivation, partage, suivi)

L'intensité est proportionnelle à l'enjeu : beaucoup de soin sur l'achat, du soin
sur la création, du soin ciblé sur l'athlète. On ne cherche PAS à polir chaque
écran du site, mais les MOMENTS QUI COMPTENT pour chaque usager.

PROFIL GÉNÉRAL : utilisateurs souvent peu à l'aise avec la techno, autant sur
téléphone que sur ordinateur. Test universel par écran : « une personne non
technique comprend-elle quoi faire en 3 secondes ? » Sinon, simplifier.

DÉCISIONS RETENUES :
- Achat : INVITÉ D'ABORD, création de compte encouragée JUSTE APRÈS le paiement
  (jamais un mur d'inscription avant de payer).
- Athlète : profil complet dès le départ (page publique, suivi, partage), dans le
  respect des masquages de confidentialité et de la gestion parentale des mineurs.

Prérequis : Phase 1 + Phase 1.4 (design). Réutilise OBLIGATOIREMENT le système de
design (cf. CLAUDE.md). Mêmes règles : une tâche à la fois, tests verts, rapport
après chacune. Confidentialité mineurs respectée partout.

=============================================================================
BLOC A — CLIENT / PARENT ACHETEUR (priorité maximale)
=============================================================================

## TÂCHE 1.6.A1 — Achat invité fluide (de la page athlète au paiement)

**Contexte.** Sections 2.1, 2.2, 12, 50. Le parent arrive souvent par QR code, sur
mobile, motivé sur le moment. Le chemin page athlète → paiement doit être le plus
court et rassurant possible. AUCUN mur d'inscription avant de payer.

**Objectif.** Un parcours d'achat invité sans friction : depuis la page d'un
athlète, choisir un pack, voir clairement l'impact (« ton achat génère X $ pour
[athlète] »), payer, le tout en un minimum d'étapes et impeccable sur mobile.

**Fichiers concernés.**
- Parcours `app/[athleteSlug]` → panier → checkout (présentation et fluidité)
- Réutilise le panier (tâche 1.4 Phase 1) et le checkout Stripe (tâche 1.5 Phase 1)

**Règles.**
- Achat possible SANS compte. Ne jamais exiger d'inscription avant le paiement.
- Le bénéficiaire est pré-sélectionné quand on vient d'une page athlète.
- Message d'impact toujours visible (« ton achat génère X $ pour [athlète] »).
- Mobile-first : paiement atteignable en très peu de touches ; Apple Pay / Google
  Pay si disponibles (section 50).
- Champs minimaux ; ne demander que le strict nécessaire à la livraison et au
  paiement.

**Critères d'acceptation.**
- Un visiteur non connecté achète de bout en bout, sans créer de compte.
- Depuis la page d'un athlète, le bénéficiaire est déjà sélectionné au panier.
- Le parcours est confortable sur mobile (test viewport étroit).

**Tests attendus.**
- e2e mobile + desktop : page athlète → pack → paiement test → succès, sans compte.

---

## TÂCHE 1.6.A2 — Création de compte encouragée APRÈS l'achat

**Contexte.** On veut le suivi et le rachat sans pénaliser la vente. Le bon moment
pour proposer un compte est juste après le paiement réussi.

**Objectif.** Après un achat invité réussi, proposer de créer un compte en une
étape (e-mail déjà connu, il ne reste qu'un mot de passe), en expliquant le bénéfice
concret : suivre l'impact, retrouver ses reçus, racheter en un clic.

**Fichiers concernés.**
- Écran de confirmation post-paiement
- `lib/auth/*` : rattacher la commande invité au nouveau compte
- Rattachement du panier/commande invité (table `orders.guest_email`)

**Règles.**
- 100 % optionnel : on peut refuser et garder son achat (jamais de blocage).
- À l'inscription, rattacher automatiquement la commande invité au compte (via
  l'e-mail) pour que l'historique soit complet.
- Bénéfice formulé concrètement, pas en jargon (« suis l'impact de ton don »,
  « rachète en un clic »).

**Critères d'acceptation.**
- Après un achat invité, on peut créer un compte en saisissant seulement un mot de
  passe.
- La commande faite en invité apparaît dans l'historique du nouveau compte.
- Refuser l'inscription n'affecte pas la commande.

**Tests attendus.**
- e2e : achat invité → création de compte post-achat → commande rattachée visible.
- Intégration : rattachement par e-mail correct ; refus sans effet sur la commande.

---

## TÂCHE 1.6.A3 — Espace parent : suivi, reçus et rachat en un clic

**Contexte.** Sections 31, 42. Une fois le compte créé, le parent doit retrouver
facilement ses achats, l'impact généré, et pouvoir racheter sans effort.

**Objectif.** Un espace parent clair : commandes récentes, impact généré par
bénéficiaire, reçus téléchargeables, bénéficiaires favoris, et bouton « racheter »
qui re-remplit le panier à l'identique.

**Fichiers concernés.**
- `app/(account)/*` (tableau de bord parent)
- `lib/reorder/*` (rachat d'une commande passée)

**Règles.**
- Rachat = panier pré-rempli identique, bénéficiaire conservé, modifiable avant
  paiement.
- Impact affiché simplement (« tu as généré X $ pour [athlète/équipe] »).
- Reçus accessibles et téléchargeables.
- Tout en français, montants CAD.

**Critères d'acceptation.**
- Le parent voit ses commandes, son impact et ses reçus.
- « Racheter » recrée le panier à l'identique avec le bon bénéficiaire.

**Tests attendus.**
- e2e : connexion → consulter l'impact → racheter → paiement test.
- Intégration : le rachat conserve produits et bénéficiaire.

---

## TÂCHE 1.6.A4 — Répartition entre plusieurs enfants, version simple

**Contexte.** Section 13. Un parent avec deux enfants veut soutenir les deux. Ça
doit rester trivial, pas un casse-tête de pourcentages.

**Objectif.** Rendre la répartition multi-bénéficiaires évidente : choisir
plusieurs enfants, répartir également par défaut (50/50, 33/33/33…), ajuster
simplement si désiré, et voir l'impact par enfant en direct.

**Fichiers concernés.**
- `components/beneficiary-split.tsx` (présentation simplifiée ; logique = tâche 1.4
  Phase 1, ne pas dupliquer)

**Règles.**
- Répartition égale proposée AUTOMATIQUEMENT dès qu'on ajoute plusieurs enfants.
- Ajustement simple (curseurs ou champs guidés), avec total toujours forcé à 100 %.
- Impact par enfant affiché en direct, en dollars.
- Réutilise la validation existante (somme = 100 %, arrondi déterministe).

**Critères d'acceptation.**
- Ajouter un 2e enfant bascule automatiquement en 50/50.
- L'impact par enfant s'affiche correctement et se met à jour à l'ajustement.

**Tests attendus.**
- e2e : sélection de 2 enfants → 50/50 auto → ajustement → impact correct.

=============================================================================
BLOC B — RESPONSABLE DE CAMPAGNE
=============================================================================

PRINCIPE : le responsable ne touche JAMAIS aux règles de crédit ni aux taux
(réglage admin). Il voit seulement objectif, packs, athlètes, dates. Le mot
« crédit » n'apparaît chez lui que comme « ta campagne a amassé X $ ».

## TÂCHE 1.6.B1 — Assistant de campagne pas-à-pas avec sauvegarde automatique

**Contexte.** Sections 17, 53. Transformer le formulaire (tâche 1.7 Phase 1) en
assistant en étapes courtes, une décision par écran, avec progression visible,
retour arrière sans perte, et reprise possible sur un autre appareil.

**Objectif.** Assistant multi-étapes clair et rassurant, avec sauvegarde
automatique du brouillon (statut `draft`) à chaque étape et reprise au bon endroit
sur tout appareil connecté.

**Fichiers concernés.**
- `app/(portal)/campagnes/nouvelle/*` (refonte en étapes)
- `components/wizard/*` (assistant réutilisable, basé sur le design)
- `lib/campaigns/draft.ts` (sauvegarde/reprise)

**Règles.**
- Une décision principale par étape ; langage simple, zéro jargon.
- Sauvegarde après chaque étape, sans action de l'utilisateur ; reprise multi-appareil.
- Un brouillon n'est JAMAIS visible publiquement et n'est jamais publié par accident.
- Boutons « Continuer » / « Revenir » toujours visibles, atteignables au pouce.

**Critères d'acceptation.**
- L'assistant se parcourt sur mobile et desktop ; la progression est visible.
- Quitter puis revenir (même appareil ou autre) reprend au bon endroit avec les données.
- Un brouillon n'apparaît dans aucune vue publique.

**Tests attendus.**
- e2e : parcours complet mobile + desktop ; retour arrière sans perte.
- Intégration : reprise du brouillon restitue l'état exact.

---

## TÂCHE 1.6.B2 — Défauts intelligents et saisie des athlètes sans douleur

**Contexte.** Profil bénévole peu technique ; chaque décision épargnée évite un
abandon. La saisie des athlètes est l'étape la plus laborieuse.

**Objectif.** Pré-remplir l'assistant avec des défauts raisonnables (type, packs
recommandés, durée) que le responsable confirme, masquer tout réglage avancé, et
permettre d'ajouter les athlètes vite (saisie fluide + collage d'une liste, avec
détection de doublons).

**Fichiers concernés.**
- `lib/campaigns/defaults.ts`
- `lib/athletes/bulk-add.ts` (parsing liste collée, doublons)
- Étapes de l'assistant (1.6.B1)

**Règles.**
- Une campagne valide doit pouvoir être créée en acceptant tous les défauts.
- RÈGLES DE CRÉDIT / TAUX jamais exposés au responsable.
- Athlètes : demander le minimum (prénom, nom, catégorie) ; coller une liste crée
  en lot avec récap à confirmer ; signaler les doublons évidents.
- Mineur sans consentement : non publié, mais création non bloquée (l'indiquer).

**Critères d'acceptation.**
- Création « tout par défaut » aboutit à une campagne activable.
- Aucun écran responsable ne montre de configuration de taux/crédit.
- Coller 15 noms les crée en une confirmation ; doublons signalés.

**Tests attendus.**
- e2e : création tout-par-défaut ; ajout d'athlètes en lot.
- Unitaire : logique de défauts ; parsing de liste et détection de doublons.

---

## TÂCHE 1.6.B3 — Aperçu, activation et écran « prochaines actions »

**Contexte.** Rassurer avant de publier, puis donner de l'élan juste après (le
moment le plus fragile : la campagne existe mais le responsable ne sait pas quoi
faire).

**Objectif.** Avant activation : aperçu fidèle de la page publique + exemple
d'affiche + récap clair, tout modifiable d'un clic. Après activation : écran de
démarrage avec 3-4 actions concrètes (partager le lien, envoyer le message
pré-rédigé aux parents, télécharger l'affiche, suivre les ventes).

**Fichiers concernés.**
- Étape « aperçu » de l'assistant ; `app/(portal)/campagnes/[id]/demarrage`
- Réutilise pages publiques, affiches (1.5.2), partage (section 54)

**Règles.**
- L'aperçu reflète exactement le rendu public réel ; un seul bouton d'activation
  explicite (« Lancer ma campagne »).
- Message aux parents PRÉ-RÉDIGÉ en français, copiable en un clic (rien à rédiger).
- Boutons de partage directs (Messenger, courriel, copier le lien).
- Clair et utilisable sur mobile.

**Critères d'acceptation.**
- L'aperçu correspond à la vraie page publique ; correction d'un champ en un clic.
- L'activation passe la campagne en `active` et génère liens/QR/affiches.
- L'écran de démarrage propose au moins : partager le lien, envoyer le message,
  télécharger l'affiche ; message pré-rempli et copiable.

**Tests attendus.**
- e2e : aperçu → correction → activation → écran de démarrage avec actions
  fonctionnelles.

=============================================================================
BLOC C — ATHLÈTE
=============================================================================

DÉCISION : profil complet dès le départ (page publique, suivi, partage). Pour un
mineur, le compte est géré par le parent/tuteur ; les masquages de confidentialité
s'appliquent partout.

## TÂCHE 1.6.C1 — Profil athlète et page publique soignée

**Contexte.** Sections 2.3, 2.4, 5, 32. L'athlète (ou son parent) gère un profil
complet : objectif, message, photo (optionnelle), et une page publique attrayante
qui donne envie d'encourager.

**Objectif.** Permettre de compléter facilement le profil (objectif personnel,
message, photo si autorisée) et offrir une page publique claire et motivante :
progression, impact, bouton « Encourager », partage.

**Fichiers concernés.**
- `app/(account)/athlete/*` (édition de profil, gérée par parent si mineur)
- Page publique athlète (présentation soignée ; réutilise tâche 1.6 Phase 1)

**Règles.**
- Mineur : édition réservée au parent/tuteur ; respect strict des masquages
  (`hide_*`) sur la page publique.
- Édition simple, en français, faisable sur mobile.
- La page publique ne montre jamais une donnée masquée.

**Critères d'acceptation.**
- Un parent complète le profil de son enfant (objectif, message, photo si autorisée).
- La page publique affiche progression, impact et bouton « Encourager ».
- Un masquage activé (ex: `hide_photo`) est respecté sur la page publique.

**Tests attendus.**
- e2e : édition de profil (par parent) → page publique conforme et respectant les
  masquages.

---

## TÂCHE 1.6.C2 — Suivi de progression et partage pour l'athlète

**Contexte.** Sections 32, 54. L'athlète veut voir sa progression et partager son
lien simplement pour mobiliser ses proches.

**Objectif.** Un espace de suivi simple (objectif, montant amassé, nombre de
supporters, progression) et des outils de partage faciles (lien personnel, QR,
messages pré-rédigés) adaptés au mobile.

**Fichiers concernés.**
- `app/(account)/athlete/suivi` (tableau de bord athlète simple)
- Réutilise partage (section 54), lien/QR personnels

**Règles.**
- Suivi motivant mais sans pression malsaine sur les jeunes (cf. cahier, gamification
  à utiliser avec prudence) : pas de classement mis en avant par défaut.
- Partage en un clic (Messenger, courriel, copier le lien) ; messages pré-rédigés.
- Pour un mineur, les communications passent par le cadre parental prévu (section 2.4).
- Mobile-first.

**Critères d'acceptation.**
- L'athlète (ou le parent) voit objectif, montant amassé et nombre de supporters.
- Le partage du lien personnel fonctionne en un clic, avec message pré-rédigé.

**Tests attendus.**
- e2e : consulter le suivi → partager le lien personnel → message pré-rempli.

---

## Après la Phase 1.6

Les trois usagers clés ont une expérience fluide et adaptée : le parent achète sans
friction et revient racheter ; le responsable crée sa campagne sans jargon et repart
avec de l'élan ; l'athlète a une page motivante et partage facilement. Teste chaque
parcours avec de VRAIES personnes du profil visé (un parent, un bénévole, un
ado/parent d'athlète) et observe sans aider : c'est le meilleur révélateur des
points de friction restants.
