# Avancement

## Terminé
- [x] 0.0 Mise en place du dépôt git et de la structure docs/
- [x] 0.1 Initialisation du projet Next.js (commit c826770) — lint OK, 3 tests
      unitaires Vitest passent, build Next.js OK. Test e2e Playwright écrit mais
      non exécuté (réseau sandbox bloque le téléchargement de Chromium ; voir
      DECISIONS.md).
- [x] 0.2 Migration du schéma + seed + clients DB (commit 39aecf4) — schéma
      copié à l'identique dans supabase/migrations/0001_initial_schema.sql,
      seed.sql conforme à la spec (club, équipe, 3 athlètes dont 1 masqué, 4
      packs à crédit fixe, taux QC, campagne active 5000$), lib/db/client.ts +
      types.ts (types dérivés manuellement, à régénérer via `supabase gen
      types typescript --linked` une fois le projet réel connecté). Validé par
      un test d'intégration sur Postgres embarqué jetable (aucun identifiant
      Supabase réel nécessaire) : 8/8 tests verts.

## En cours
- [ ] 0.3 Authentification et rôles — BLOQUÉ : nécessite de vrais identifiants
      Supabase (voir docs/QUESTIONS.md, question du 2026-06-19)

## À venir
- [ ] 0.4 Politiques RLS
- [ ] 1.1 Gestion des entités club / équipe / athlète
- [ ] 1.2 Catalogue : produits et packs
- [ ] 1.3 Moteur de crédit
- [ ] 1.4 Panier et répartition entre bénéficiaires
- [ ] 1.5 Paiement Stripe, création de commande et écriture des crédits
- [ ] 1.6 Pages publiques (athlète, équipe, club) et page d'accueil
- [ ] 1.7 Création de campagne (assistant)
