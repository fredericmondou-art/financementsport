# Rapport — Tâche 0.4 : Politiques RLS

**Date :** 2026-06-19
**Statut :** ⚠️ Partiel

## 1. En une phrase
Row Level Security est activé et testé sur les 24 tables du schéma (anon refusé sur tout ce qui est sensible, accès scopé par rôle pour le staff), avec 3 vues publiques qui masquent correctement les champs `hide_*` — il ne reste qu'à coller le fichier SQL dans Supabase pour l'activer en conditions réelles.

## 2. Ce que j'ai fait
- `supabase/migrations/0003_rls_policies.sql` : `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` sur les 24 tables (aucune table exposée sans policy), avec des fonctions d'aide `SECURITY DEFINER` (`current_user_role`, `is_platform_admin`, `manages_team`, `manages_club`, `manages_athlete`, `manages_beneficiary`, `manages_campaign`, `manages_qr_target`, `owns_cart`, `owns_order`) pour éviter toute récursion de policy.
- Trois vues publiques `v_public_athlete`, `v_public_club`, `v_public_team` qui respectent `hide_last_name`, `hide_photo`, `hide_city`, `hide_amounts`, `show_team_only` — créées par un rôle qui contourne RLS et accordées en lecture à `anon`/`authenticated` (mécanisme standard Supabase), jamais d'accès direct aux tables de base.
- `code/supabase/a-coller-manuellement/3-rls-policies.sql` : copie prête à coller dans l'éditeur SQL Supabase (même méthode que les fichiers 1 et 2).
- `tests/integration/rls-policies.test.ts` : 18 tests sur Postgres embarqué (anon refusé sur 5 tables sensibles, masquage `hide_last_name` en avant/après, ownership des commandes par client, scope `team_manager`/`club_admin`, accès complet `platform_admin`).
- **Bug découvert et corrigé en cours de route** : `seed.sql` ne survivait pas au trigger de la tâche 0.3 une fois les deux migrations appliquées dans l'ordre réel (voir section 5).

## 3. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| Policies RLS pour toutes les tables | ✅ | 24/24 tables avec `ENABLE ROW LEVEL SECURITY` + policies (aucune table « nue ») |
| Vues publiques `v_public_athlete`/`v_public_team`/`v_public_club` respectant `hide_*` | ✅ | Vues créées, testées avec un cas réel (voir section 7) |
| anon refusé en lecture directe sur les tables sensibles | ✅ | Testé sur `profiles`, `athletes`, `orders`, `order_credits`, `campaigns` : 0 ligne dans chaque cas |
| Champs masqués jamais exposés publiquement | ✅ | Emma Gagnon (`hide_last_name=true`) : `last_name` = `null`, `display_name` = `"Emma G."` via `v_public_athlete` |
| Tests d'intégration anon + utilisateur authentifié sur 4-5 tables sensibles | ✅ | 18 tests : anon (5 tables) + client (ownership commandes) + team_manager (scope campagne) + club_admin (scope athlète) + platform_admin (accès complet) |
| Appliqué au vrai projet Supabase | ❌ | Fichier prêt (`3-rls-policies.sql`), pas encore collé — action de Frédéric (section 8) |

## 4. Tests
- Commande lancée : `npx vitest run`
- Résultat : **41 tests passés, 0 échoué** (18 nouveaux pour les politiques RLS, 23 déjà existants des tâches 0.1–0.3 — aucune régression)
- `npm run lint` : aucune erreur. `npx tsc --noEmit` : aucune erreur. `npm run build` : réussi.
- Cas limites couverts : anon sur table sensible (refus), athlète avec/sans masquage (les deux états), client A vs client B (isolation), staff scopé vs hors scope, platform_admin (bypass complet).

## 5. Décisions prises en autonomie
Voir `docs/DECISIONS.md`, trois entrées propres à cette tâche :
- **Bug seed.sql / trigger 0002** : un `INSERT INTO auth.users` sans email, combiné au trigger de la tâche 0.3, créait un `profiles` invalide avant même l'insert explicite du seed. Corrigé en fournissant l'email et en rendant l'insert `profiles` idempotent (`ON CONFLICT ... DO UPDATE`). C'est une correction réelle du fichier `supabase/seed.sql`, pas seulement un correctif de test — sans elle, un re-seed du vrai projet Supabase échouerait dès que le trigger de la tâche 0.3 sera collé.
- **Vues publiques plutôt qu'accès `anon` direct** : aucune policy `anon` sur les tables sensibles, tout passe par des vues filtrées. Lacune notée pour la tâche 1.6 : `campaigns` elle-même n'est pas publique, la page de progression publique devra s'appuyer sur les vues d'agrégat existantes ou une nouvelle `v_public_campaign`.
- **Club public seulement si approuvé** : `v_public_club` ne montre que les clubs avec `approved_at IS NOT NULL`, cohérent avec le processus d'approbation déjà prévu dans le schéma.

## 6. Respect des règles non négociables
- Argent en centimes, arithmétique entière : s.o. (aucune logique d'argent dans cette tâche)
- Crédit écrit uniquement sur paiement confirmé : s.o.
- **RLS activée sur toutes les tables : ✅ (24/24, vérifié explicitement)**
- **Aucune donnée d'athlète masquée exposée publiquement : ✅ (testé avec un cas réel, voir section 7)**
- Aucun secret en dur dans le code : ✅
- Pas de régression : ✅ (41/41 tests verts, dont les 23 des tâches précédentes)

## 7. Scénario concret vérifiable
Le seed crée deux athlètes de la même équipe (U11 Hockey, Corsaires), l'un avec confidentialité standard, l'autre avec le nom masqué :

| Athlète | `hide_last_name` | `last_name` via `v_public_athlete` | `display_name` via `v_public_athlete` |
|---|---|---|---|
| Thomas Tremblay | `false` | `"Tremblay"` | `"Thomas Tremblay"` |
| Emma Gagnon | `true` | `null` | `"Emma G."` |

Un visiteur anonyme (`anon`) qui interroge directement la table `athletes` reçoit **0 ligne** (refus RLS) ; en passant par `v_public_athlete`, il voit les deux athlètes mais ne voit jamais `"Gagnon"` nulle part — confirmé par un test automatisé (`tests/integration/rls-policies.test.ts`, section « Vue publique v_public_athlete respecte hide_last_name »).

## 8. Ce qu'il me faut de toi
Une seule action, même méthode que les fichiers 1 et 2 : coller `code/supabase/a-coller-manuellement/3-rls-policies.sql` dans l'éditeur SQL Supabase, **après** avoir collé le fichier 2 (trigger) s'il ne l'est pas déjà. Dis-moi quand c'est fait, sinon je continue vers la tâche 1.1 — ça ne bloque pas le reste du travail de code.

## 9. Prochaine tâche
1.1 — Gestion des entités club / équipe / athlète.
