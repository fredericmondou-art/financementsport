# Prompts d'exécution — Phase 1.4 (Design UI/UX + Mise en ligne)

À exécuter ENTRE la Phase 1 (flux vendable, tâches 0.1 à 1.7) et la Phase 1.5
(campagne opérationnelle). Objectif : donner au site une apparence et une
navigation professionnelles, cohérentes et responsives, puis le déployer en ligne
sur une URL Vercel.

Mêmes règles : une tâche à la fois, dans l'ordre ; tests verts avant de continuer ;
rapport `RAPPORTS.md` après chaque tâche ; respect du `CLAUDE.md` (français par
défaut, CAD, mobile-first, confidentialité mineurs).

Prérequis : Phase 1 terminée et verte (le site « marche » fonctionnellement, même
s'il est laid).

IMPORTANT — distinction à garder en tête :
- Ces tâches DÉPLOIENT le site (le rendent accessible sur une URL) et le rendent
  beau. Elles ne le « lancent » PAS commercialement.
- Le passage à de vrais clients avec argent réel (Stripe en mode production,
  politiques légales, revue de conformité Québec / Loi 25 / données de mineurs)
  est un jalon séparé, hors de cette phase, à ne pas franchir sans validation
  professionnelle humaine.

---

## TÂCHE 1.4.1 — Direction visuelle (À VALIDER PAR L'HUMAIN AVANT D'APPLIQUER)

**Contexte.** Le site n'a pas encore d'identité visuelle. On en définit une, propre
et professionnelle, adaptée à une plateforme québécoise qui inspire confiance aux
parents et donne de l'élan aux jeunes athlètes. Référence : `frontend-design`
(guide de design de l'environnement) si disponible.

**Objectif.** Proposer UNE direction visuelle cohérente : palette de couleurs,
typographie, principes d'espacement, ton, et 2-3 maquettes clés (accueil, page
publique d'athlète, panier) pour validation AVANT toute application au reste du site.

**Fichiers concernés.**
- `docs/DESIGN.md` (la direction visuelle écrite : couleurs en hex, polices,
  principes, exemples)
- Maquettes statiques de prévisualisation (accueil, page athlète, panier)

**Règles.**
- Proposer, NE PAS imposer : produire la direction + maquettes, puis ARRÊTER et
  demander validation humaine via `QUESTIONS.md`. Ne pas appliquer au site tant que
  l'humain n'a pas approuvé.
- Direction sobre et crédible (c'est une plateforme financière touchant des
  enfants), pas criarde. Bon contraste, lisibilité.
- Accessible : contrastes conformes WCAG AA.
- Français ; ton chaleureux mais sérieux.
- Mobile-first (section 50 du cahier).

**Critères d'acceptation.**
- `DESIGN.md` définit palette, typographie, espacement, composants de base.
- 3 maquettes présentées pour validation.
- L'agent S'ARRÊTE et attend l'approbation humaine avant la tâche 1.4.2.

**Tests attendus.**
- Vérification de contraste (AA) sur la palette proposée.

---

## TÂCHE 1.4.2 — Système de design (design tokens + composants de base)

**Contexte.** Une fois la direction validée (1.4.1), on la transforme en un système
réutilisable pour que TOUT le site soit cohérent sans répétition.

**Objectif.** Implémenter les design tokens (couleurs, typo, espacements, rayons,
ombres) et une bibliothèque de composants de base réutilisables : boutons, champs,
cartes, badges, alertes, modales, barre de progression, états de chargement et
d'erreur.

**Fichiers concernés.**
- Config du thème (ex: `tailwind.config` / variables CSS) reflétant `DESIGN.md`
- `components/ui/*` (composants de base)
- Une page interne `/styleguide` listant tous les composants (référence visuelle)

**Règles.**
- Aucune couleur ni taille « en dur » dans les pages : tout passe par les tokens.
- Composants accessibles (focus visible, navigation clavier, attributs ARIA).
- Réutiliser ces composants partout ensuite ; ne pas recréer de variantes ad hoc.

**Critères d'acceptation.**
- La page `/styleguide` affiche tous les composants dans leurs états.
- Changer un token (ex: couleur primaire) se répercute partout.

**Tests attendus.**
- Unitaire/rendu : les composants de base se rendent dans leurs différents états.

---

## TÂCHE 1.4.3 — Navigation, layouts et changements de page

**Contexte.** Section 50 + parcours du cahier. Il faut une navigation claire et des
transitions de page fluides entre les grandes zones (site public, boutique, portails,
admin).

**Objectif.** Mettre en place les layouts par zone, la navigation (en-tête, pied de
page, menu mobile), le fil d'Ariane là où utile, et des transitions de page fluides
sans rechargement brutal.

**Fichiers concernés.**
- `app/layout.tsx` et layouts par groupe : `(public)`, `(shop)`, `(portal)`, `(admin)`
- `components/nav/*` (header, footer, menu mobile)
- Gestion des transitions et des états de chargement entre pages

**Règles.**
- Navigation adaptée au rôle : un visiteur, un parent, un responsable et un admin ne
  voient pas le même menu.
- Mobile-first : menu utilisable au pouce, achat atteignable en peu de touches.
- États de chargement propres entre les pages (pas d'écran blanc).
- Indiquer clairement où on est (page active mise en évidence).

**Critères d'acceptation.**
- On navigue entre accueil, boutique, page athlète, panier sans rechargement brutal.
- Le menu mobile fonctionne et est utilisable au pouce.
- Le menu s'adapte au rôle connecté.

**Tests attendus.**
- e2e : parcours de navigation principal sur desktop ET mobile (viewport réduit).

---

## TÂCHE 1.4.4 — Application du design aux pages existantes de la Phase 1

**Contexte.** Les pages de la Phase 1 (accueil, pages publiques athlète/équipe/club,
catalogue, panier, checkout, auth, création de campagne) existent mais sans style
soigné. On les habille avec le système de design.

**Objectif.** Appliquer le système de design et les layouts à toutes les pages déjà
livrées, pour un rendu cohérent et professionnel, sans changer leur logique métier.

**Fichiers concernés.**
- Toutes les pages livrées en Phase 1 (présentation uniquement)
- Réutilise `components/ui/*` et les layouts (1.4.2, 1.4.3)

**Règles.**
- NE PAS toucher à la logique métier (crédits, paiement, RLS) : présentation seulement.
- Aucune régression : les tests fonctionnels de la Phase 1 doivent rester verts.
- Respecter la confidentialité des mineurs dans tout affichage public.
- Tout en français, montants en CAD bien formatés.

**Critères d'acceptation.**
- Les pages de la Phase 1 utilisent les composants et tokens du système de design.
- Les tests fonctionnels de la Phase 1 passent encore (aucune régression).
- Rendu cohérent desktop et mobile.

**Tests attendus.**
- e2e de la Phase 1 relancés : toujours verts.
- Vérification visuelle responsive (desktop + mobile) des pages clés.

---

## TÂCHE 1.4.5 — Accessibilité, performance et finitions

**Contexte.** Un site professionnel est accessible et rapide, surtout sur mobile où
arriveront la plupart des acheteurs (via QR).

**Objectif.** Passe de finition : accessibilité (AA), performance (chargement,
images), métadonnées (titres, partage social), pages d'erreur (404/500) et états
vides soignés.

**Fichiers concernés.**
- Pages d'erreur `not-found.tsx`, `error.tsx`
- Optimisation des images, métadonnées / Open Graph
- Corrections d'accessibilité repérées

**Règles.**
- Cibles raisonnables de performance mobile ; images optimisées.
- Contraste AA, navigation clavier, textes alternatifs.
- Aperçus de partage social corrects (les liens partagés par les parents doivent
  bien s'afficher sur Messenger/Facebook — section 54).
- États vides clairs (« aucune commande pour l'instant », etc.).

**Critères d'acceptation.**
- Un audit d'accessibilité de base ne relève pas d'erreur bloquante.
- Les pages 404/500 sont soignées et en français.
- Un lien de page athlète partagé affiche un aperçu correct.

**Tests attendus.**
- Audit accessibilité automatisé sur les pages clés (pas d'erreur critique).
- e2e : pages d'erreur et états vides s'affichent correctement.

---

## TÂCHE 1.4.6 — Déploiement en ligne sur Vercel

**Contexte.** Le site doit être accessible en ligne sur une URL Vercel gratuite
(ex: monsite.vercel.app). Domaine personnalisé plus tard, sans refonte.

**Objectif.** Configurer le déploiement Vercel : projet relié au dépôt, variables
d'environnement, base Supabase de production, webhooks Stripe pointant vers l'URL
déployée, et déploiements automatiques à chaque push.

**Fichiers concernés.**
- Configuration Vercel (projet, variables d'environnement)
- Documentation : `docs/DEPLOIEMENT.md` (étapes, variables, comment redéployer)

**Règles.**
- Stripe reste en mode TEST à ce stade (pas de vrais paiements). Le passage en
  production est un jalon séparé, hors de cette phase.
- Secrets uniquement dans les variables d'environnement Vercel, jamais dans le code.
- Séparer clairement les environnements : développement vs production (clés et base
  distinctes).
- Vérifier que les webhooks Stripe atteignent bien l'URL déployée (sinon les crédits
  ne s'écriraient pas en ligne).
- Mettre à jour les URL de redirection d'authentification Supabase vers l'URL en ligne.

**Critères d'acceptation.**
- Le site est accessible publiquement sur l'URL Vercel.
- Un parcours d'achat en mode TEST fonctionne en ligne de bout en bout (page → achat
  test → crédit attribué), webhook compris.
- Un push sur la branche principale redéploie automatiquement.
- `DEPLOIEMENT.md` documente les variables et la procédure.

**Tests attendus.**
- e2e exécuté CONTRE l'URL déployée : parcours d'achat test complet, crédit vérifié.
- Vérification que le webhook Stripe est bien reçu en ligne (idempotence conservée).

---

## Après la Phase 1.4

Le site est en ligne, beau, cohérent et navigable, avec un parcours d'achat
fonctionnel en mode test accessible publiquement. On peut alors enchaîner la
Phase 1.5 (campagne opérationnelle) sur une base visuelle solide : chaque nouvelle
page héritera automatiquement du système de design.

RAPPEL : « en ligne en mode test » ≠ « ouvert aux vrais clients ». Avant d'accepter
de vrais paiements et de vraies données de familles, il faut Stripe en production,
les politiques légales, et une revue de conformité québécoise par un professionnel.
