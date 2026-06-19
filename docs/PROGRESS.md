# Avancement

## Terminé
- [x] 0.0 Mise en place du dépôt git et de la structure docs/
- [x] 0.1 Initialisation du projet Next.js (commit c826770) — voir
      rapports/RAPPORT-0.1.md (statut partiel : e2e Playwright écrit, non
      exécuté en sandbox).
- [x] 0.2 Migration du schéma + seed + clients DB (commit 39aecf4, puis
      appliqué pour de vrai au projet Supabase le 2026-06-19) — voir
      rapports/RAPPORT-0.2.md.
- [x] 0.3 Authentification et rôles — voir rapports/RAPPORT-0.3.md (statut
      partiel : logique de permissions testée unitairement (15/15 verts),
      trigger SQL écrit mais pas encore collé dans Supabase par Frédéric,
      e2e écrit mais non exécutable en sandbox).

## En cours
- [ ] Frédéric doit coller `code/supabase/a-coller-manuellement/2-trigger-auth-profiles.sql`
      dans l'éditeur SQL Supabase pour activer la création automatique de
      profil à l'inscription.

## À venir
- [ ] 0.4 Politiques RLS
- [ ] 1.1 Gestion des entités club / équipe / athlète
- [ ] 1.2 Catalogue : produits et packs
- [ ] 1.3 Moteur de crédit
- [ ] 1.4 Panier et répartition entre bénéficiaires
- [ ] 1.5 Paiement Stripe, création de commande et écriture des crédits
- [ ] 1.6 Pages publiques (athlète, équipe, club) et page d'accueil
- [ ] 1.7 Création de campagne (assistant)
