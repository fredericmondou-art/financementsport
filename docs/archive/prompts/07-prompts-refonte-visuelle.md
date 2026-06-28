# Prompts d'exécution — Refonte visuelle complète

Objectif : rendre le site VRAIMENT beau — simple, clair, propre, esthétique,
chaleureux et humain — sans aucun oubli. La refonte applique `DESIGN.md` à
l'ENSEMBLE du site, écran par écran.

Méthode : une tâche à la fois, tests verts, rapport après chacune (RAPPORTS.md).
Réutiliser OBLIGATOIREMENT le système de design (tokens + components/ui) une fois
établi. Ne JAMAIS changer la logique métier (crédits, paiement, RLS) : présentation
seulement. Aucune régression : les tests fonctionnels existants restent verts.

PRINCIPE ANTI-OUBLI : à la dernière tâche, on passe une CHECKLIST de toutes les
pages/écrans du site pour garantir qu'aucun n'a été laissé dans l'ancien style.

---

## TÂCHE V1 — Valider et figer la direction (DESIGN.md) — DÉCISION HUMAINE

**Contexte.** `DESIGN.md` propose une direction chaleureuse (palette neuve, typo,
principes). Avant de toucher au site, le propriétaire doit la valider/ajuster.

**Objectif.** Produire un aperçu concret de la direction (nuancier, paires
typographiques, 2-3 composants types, et une maquette de section héros) et le
soumettre au propriétaire pour validation AVANT toute application.

**Fichiers concernés.**
- Une page interne `/styleguide` provisoire montrant palette + typo + composants
- `DESIGN.md` (ajuster selon le retour du propriétaire)

**Règles.**
- NE PAS appliquer au site tant que le propriétaire n'a pas validé : produire
  l'aperçu, puis S'ARRÊTER et demander validation via QUESTIONS.md.
- Proposer les vraies polices retenues (chargées), les vraies couleurs hex.
- Vérifier les contrastes WCAG AA.
- Poser au propriétaire les 2 choix ouverts de DESIGN.md : registre tu/vous, et
  polices titres/texte préférées parmi les options.

**Critères d'acceptation.**
- `/styleguide` montre palette, typo et composants réels.
- Le propriétaire a validé (ou ajusté) avant de continuer.

**Tests attendus.**
- Vérification de contraste AA sur la palette retenue.

---

## TÂCHE V2 — Système de design (tokens + composants) conforme à DESIGN.md

**Contexte.** Une fois la direction validée, on l'implémente comme système
réutilisable, base de toute la refonte.

**Objectif.** Implémenter les design tokens (couleurs, typo, espacements, rayons,
ombres douces) et la bibliothèque de composants : boutons, champs, cartes, badges,
alertes, modales, barre de progression, navigation, pied de page, états de
chargement et vides. Tout conforme à DESIGN.md.

**Fichiers concernés.**
- Config de thème (tokens) + chargement des polices
- `components/ui/*`
- `/styleguide` complété (référence vivante de tous les composants)

**Règles.**
- Aucune couleur/taille en dur hors tokens.
- Fond de page = `cream`, texte = `ink` (jamais noir pur), neutres chauds.
- Composants accessibles (focus visible, clavier, ARIA), taille tactile mobile.
- Transitions douces (150–200ms).

**Critères d'acceptation.**
- `/styleguide` affiche tous les composants dans leurs états, au nouveau style.
- Changer un token se répercute partout.
- Contrastes AA respectés.

**Tests attendus.**
- Rendu des composants dans leurs états ; vérif contraste sur composants clés.

---

## TÂCHE V3 — Navigation, pied de page et coquille générale

**Contexte.** L'en-tête et le pied de page actuels sont fonctionnels mais fades et
trop vides. Ils cadrent toutes les pages : à soigner en premier.

**Objectif.** Refondre l'en-tête (logo, navigation adaptée au rôle, menu mobile au
pouce, bouton d'action clair) et le pied de page (liens de confiance, mention
Québec, plan du site), dans le nouveau style.

**Fichiers concernés.**
- `components/nav/*`, layouts de zones
- Pied de page enrichi (liens vers À propos, Confidentialité, Conditions, Contact)

**Règles.**
- En-tête épuré, chaleureux, repère clair de la page active.
- Menu mobile fluide, atteignable au pouce.
- Pied de page complet (les liens de confiance manquaient).
- Transitions de page douces (pas d'écran blanc brutal).

**Critères d'acceptation.**
- En-tête et pied de page au nouveau style, cohérents sur toutes les pages.
- Menu mobile fonctionnel ; navigation adaptée au rôle.

**Tests attendus.**
- e2e : navigation principale desktop + mobile ; liens de pied de page.

---

## TÂCHE V4 — Page d'accueil : la vitrine chaleureuse

**Contexte.** Section 3 du cahier. L'accueil actuel est squelettique. C'est la
première impression : elle doit être chaleureuse, claire et donner confiance.

**Objectif.** Refondre l'accueil avec rythme et chaleur : héros visuel + 3 portes
d'entrée (« Trouver un athlète », « Lancer une campagne », « Voir la boutique »),
exemple chiffré concret, « Comment ça fonctionne » en cartes illustrées, sports
desservis, section confiance (sans faux témoignages), FAQ courte, appel à l'action
clubs, sections à fonds alternés.

**Fichiers concernés.**
- `app/page.tsx` et composants de section
- Images de banque (marketing) conformes à DESIGN.md §6

**Règles.**
- Remplir l'espace, créer du rythme (alternance de fonds), pas de grands vides.
- Image(s) chaleureuse(s) de banque libres de droits ; jamais de faux athlète réel.
- Aucun faux témoignage nominatif : structure neutre ou section masquée si vide.
- Exemple chiffré honnête et cohérent avec les règles de crédit réelles.
- Mobile-first.

**Critères d'acceptation.**
- Accueil chaleureux, rempli, rythmé, au nouveau style.
- 3 portes d'entrée + exemple chiffré + comment ça marche + FAQ + liens confiance.
- Rendu impeccable mobile et desktop.

**Tests attendus.**
- e2e : présence des portes d'entrée et navigation ; vérif responsive.

---

## TÂCHE V5 — Boutique et cartes produits

**Contexte.** Section 8. Cartes actuelles propres mais sans images et désalignées.

**Objectif.** Refondre la boutique : cartes produits avec image, prix et crédit
clairs, hauteurs égales, survol soigné, filtres/tri lisibles, grille rythmée.

**Fichiers concernés.**
- Composant carte produit, grille boutique
- `products.image_url` (visuel de remplacement neutre si absent)

**Règles.**
- Chaque carte : image (ratio homogène), nom, prix, crédit généré, bouton aligné.
- Hauteurs égales ; survol doux ; pas de carte « cassée » sans image.
- Conserver l'affichage clair prix + crédit.

**Critères d'acceptation.**
- Boutique au nouveau style, cartes avec images et alignées.
- Survol et grille soignés ; responsive.

**Tests attendus.**
- Rendu : grille alignée, images/remplacement ; responsive.

---

## TÂCHE V6 — Panier et paiement

**Contexte.** Section 12. Page la plus sensible (décision de payer). Doit être
limpide, rassurante, chaleureuse.

**Objectif.** Refondre le panier au nouveau style : récap clair (sous-total, TPS,
TVQ, total), bloc « impact » mis en valeur et engageant, répartition multi-enfants
simple et visuelle, chemin de paiement évident et rassurant.

**Fichiers concernés.**
- `app/(shop)/panier` et composants ; affichage taxes (depuis tax_rates)

**Règles.**
- Langage humain (zéro formulation technique visible).
- Taxes et total affichés clairement avant paiement.
- Bloc impact engageant ; bouton de paiement clair.
- NE PAS modifier la logique de calcul (présentation seulement).

**Critères d'acceptation.**
- Panier clair, rassurant, au nouveau style ; taxes + total visibles.
- Impact mis en valeur ; chemin de paiement évident.

**Tests attendus.**
- e2e : panier → taxes/total → bénéficiaire → impact → accès paiement.

---

## TÂCHE V7 — Pages publiques (athlète, équipe, club)

**Contexte.** Sections 5, 6, 7. Points d'entrée des acheteurs (souvent via QR).
Doivent être motivantes ET respecter la confidentialité des mineurs.

**Objectif.** Refondre les pages publiques au nouveau style : en-tête chaleureux
(photo si autorisée, nom, sport), objectif et barre de progression valorisés,
impact, bouton « Encourager » proéminent, packs recommandés, partage, dans le
strict respect des masquages.

**Fichiers concernés.**
- `app/[athleteSlug]`, `app/team/[slug]`, `app/club/[slug]`
- Vues publiques respectant les `hide_*`

**Règles.**
- Ne JAMAIS afficher une donnée masquée.
- Progression et impact mis en valeur (barre soignée, chiffres clairs).
- « Encourager » très visible ; mobile-first.

**Critères d'acceptation.**
- Pages publiques au nouveau style, motivantes ; masquages respectés.
- Bouton Encourager proéminent ; responsive.

**Tests attendus.**
- e2e : page publique → Encourager → panier ; vérif d'un masquage respecté.

---

## TÂCHE V8 — Portails et tableaux de bord (parent, responsable, athlète, admin)

**Contexte.** Sections 31–35. Les espaces connectés (compte, dashboards, assistant
de campagne) doivent être aussi soignés que les pages publiques.

**Objectif.** Appliquer le nouveau style à tous les espaces connectés : « Mon
compte », dashboards (parent/équipe/club/admin), assistant de création de campagne,
listes — avec états vides encourageants et états de chargement propres.

**Fichiers concernés.**
- `app/(account)/*`, `app/(portal)/*`, `app/(admin)/*`

**Règles.**
- États vides = invitation à l'action (pas un « Aucun… » froid).
- Cohérence totale avec le système de design ; aucune page laissée en ancien style.
- Données réelles (agrégations), montants CAD bien formatés.

**Critères d'acceptation.**
- Tous les espaces connectés au nouveau style.
- États vides encourageants ; chargements propres ; responsive.

**Tests attendus.**
- e2e : parcours dans les espaces connectés ; états vides avec action.

---

## TÂCHE V9 — Pages utilitaires et états système

**Contexte.** Pages souvent oubliées mais qui cassent l'impression si négligées :
connexion/inscription, erreurs (404/500), confirmation post-paiement, pages de
contenu (À propos, Confidentialité, Conditions, Contact).

**Objectif.** Appliquer le nouveau style à TOUTES les pages utilitaires et états
système, pour une cohérence sans faille.

**Fichiers concernés.**
- Auth, `not-found.tsx`, `error.tsx`, confirmation de commande, pages de contenu

**Règles.**
- Pages d'erreur chaleureuses, utiles, en français, avec une issue claire.
- Pages de contenu lisibles ; pages légales portant la mention « à faire valider
  juridiquement » (cf. conformité Québec).
- Métadonnées et aperçus de partage social soignés.

**Critères d'acceptation.**
- Auth, erreurs, confirmation et pages de contenu au nouveau style.
- Pages légales marquées comme à valider.

**Tests attendus.**
- e2e : auth, pages d'erreur, pages de contenu ; aperçu de partage correct.

---

## TÂCHE V10 — Passe finale anti-oubli + accessibilité + performance

**Contexte.** Garantir qu'AUCUN écran n'a été oublié et que l'ensemble est
accessible et rapide.

**Objectif.** Parcourir la CHECKLIST complète des pages, corriger tout écran resté
en ancien style, et passer une finition accessibilité (AA) + performance (images,
chargement) + cohérence d'ensemble.

CHECKLIST DES ÉCRANS (cocher chacun ; ajouter ceux qui existent en plus) :
- [ ] Accueil
- [ ] Boutique + carte produit
- [ ] Page produit/pack (si existante)
- [ ] Panier
- [ ] Paiement / confirmation post-paiement
- [ ] Page publique athlète
- [ ] Page publique équipe
- [ ] Page publique club
- [ ] Recherche d'athlète/équipe/club (si existante)
- [ ] Connexion / inscription
- [ ] Mon compte (parent)
- [ ] Dashboard équipe
- [ ] Dashboard club
- [ ] Dashboard admin
- [ ] Assistant de création de campagne (toutes les étapes)
- [ ] Écran « prochaines actions » post-création
- [ ] Profil athlète (édition)
- [ ] Suivi athlète
- [ ] Listes/exports (présentation des pages)
- [ ] À propos / Confidentialité / Conditions / Contact
- [ ] Pages d'erreur 404 / 500
- [ ] États vides et états de chargement partout

**Règles.**
- Tout écran de la checklist doit être au nouveau style, mobile + desktop.
- Accessibilité AA (contraste, clavier, alt) ; pas d'erreur bloquante à l'audit.
- Performance : images optimisées, pas d'écran blanc.
- Aucune régression fonctionnelle.

**Critères d'acceptation.**
- Tous les éléments de la checklist cochés et vérifiés.
- Audit d'accessibilité sans erreur bloquante ; rendu cohérent partout.

**Tests attendus.**
- Audit accessibilité automatisé sur les pages clés.
- Revue responsive (desktop + mobile) de chaque écran de la checklist.

---

## Après la refonte

Le site est cohérent, chaleureux, clair et soigné sur l'ensemble des écrans, sans
oubli. Idéal pour le faire essayer à de vraies personnes du profil cible et
recueillir leurs réactions. Rappel : les pages légales restent des gabarits à
valider par un professionnel avant tout lancement commercial réel.
