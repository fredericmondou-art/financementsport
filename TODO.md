# TODO — E-commerce

## En cours
(aucune — les trois chantiers ci-dessous sont les prochaines priorités ;
1 et 2 décidés le 2026-07-13, 3 ajouté le 2026-07-16 — voir CLAUDE.md
section 11)

## À faire

### 1. Partenariats fournisseurs (business, hors code)
- [ ] Lister les compagnies cibles pour approvisionner la boutique
      (équipements, vêtements, accessoires sportifs)
- [ ] Contacter et négocier les conditions (prix, exclusivité, délais de
      livraison, minimums de commande)
- [ ] Obtenir catalogues/prix/photos officiels de chaque fournisseur retenu
- [ ] Signer les ententes de partenariat
- [ ] Une fois des ententes signées : revenir vers Claude pour décider
      comment les représenter dans le catalogue (nouveaux produits/packs, et
      si un suivi produit↔fournisseur devient nécessaire au back-office)

### 2. Refonte design complète (site professionnel et sportif)
- [ ] Finaliser et valider `docs/PLAN-DESIGN-REFONTE-ACCUEIL.md` (page
      d'accueil : captures desktop + mobile, `npm run build` complet), puis
      fusionner dans `docs/DESIGN.md`
- [ ] Étendre la direction visuelle validée (tokens, typographie, composants
      `components/ui/*`) aux pages restantes :
  - [ ] Boutique (`app/(shop)/boutique`, `product-card.tsx`)
  - [ ] Pages publiques athlète / équipe / club
  - [ ] Panier et paiement (`app/(shop)/panier`, confirmation)
  - [ ] Portails : compte, campagnes (assistant, démarrage, QR, affiches,
        distribution, rapport, clôture), équipe
  - [ ] Back-office admin (dashboard, dérogations)
  - [ ] `/styleguide` (mise à jour des composants de référence)
- [ ] Vérifier après chaque page habillée : accessibilité (contrastes AA,
      focus visible), aucune régression des tests de rendu/e2e existants
- [ ] Revue finale : captures desktop + mobile de tout le site, `npm run
      build` complet avant de considérer la refonte terminée

### 3. Récompenses vendeurs et acheteurs (schéma défini, implémentation à faire)
Contexte et décisions : voir `docs/DECISIONS.md`, entrée du 2026-07-16.
Financé par la marge de la plateforme, jamais en réduisant le crédit du
bénéficiaire (confirmé par l'utilisateur). Schéma livré :
`code/supabase/migrations/0028_seller_buyer_rewards.sql` (+ résumé dans
`docs/schema-reference.sql`) — code vendeur = extension de `qr_codes`,
`reward_rules`/`reward_grants`/`reward_grant_audit_log` nouvelles.
- [ ] Brancher `create_paid_order` (migrations 0006/0026) : accepter
      `p_seller_qr_code_id`, écrire `orders.seller_qr_code_id`
- [ ] Capturer `seller_qr_code_id` sur le panier à la visite via `/q/<code>`
- [ ] `lib/rewards/` : calcul pur de la hiérarchie `reward_rules` (par
      analogie avec `lib/credits/`), déclenché UNIQUEMENT par le webhook
      Stripe confirmé (jamais à la soumission du formulaire — CLAUDE.md
      section 4)
- [ ] UI : génération d'un code vendeur personnel (portail compte/équipe),
      palmarès des vendeurs, affichage de la récompense acheteur après achat
- [ ] Émission réelle des codes de rabais (discount_code) — décider du
      mécanisme technique (Stripe coupon ? code interne ?) au moment de
      l'implémentation
- [ ] Tests unitaires (paliers, arrondi, cumulative vs per_order, commande à
      0$, campagne inactive, vendeur sans compte) + e2e (un vendeur partage
      son lien, un acheteur achète, les deux récompenses sont correctement
      calculées et journalisées) — CLAUDE.md section 8, obligatoire avant de
      considérer ce chantier terminé

## Terminé
(voir `docs/PROGRESS.md` pour l'historique complet des tâches livrées —
cœur V1 + paramètres de plateforme P.1 à P.8 terminés au 2026-07-13)
