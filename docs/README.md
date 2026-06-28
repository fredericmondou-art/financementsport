# Index de la documentation

Ce dossier distingue deux types de contenu :
- **Documents vivants** (racine de `docs/`) — à jour en continu, à lire pour
  comprendre l'état actuel du projet.
- **`docs/archive/`** — comptes-rendus et plans datés, figés au moment où ils
  ont été écrits. Utiles pour l'historique et le « pourquoi », pas pour l'état
  actuel (qui peut avoir changé depuis).

## Documents vivants

| Fichier | Rôle |
|---|---|
| `PROGRESS.md` | Journal d'avancement : tâche faite, en cours, à venir. Le point d'entrée pour savoir « où en est le projet ». |
| `DECISIONS.md` | Journal de tous les petits choix faits en autonomie (CLAUDE.md section 9), avec le raisonnement. Long — utiliser la recherche par date/numéro de tâche plutôt que de tout lire. |
| `QUESTIONS.md` | Questions qui ont nécessité une décision du propriétaire du produit (argent, sécurité, données de mineurs, ambiguïté du cahier des charges) et leur résolution. |
| `DESIGN.md` | Système de design **actuel** (palette, typographie, composants) — référence vivante, voir aussi `/styleguide-refonte` dans l'app. |
| `DEPLOIEMENT.md` | Comment et où le projet est déployé (Vercel, variables d'environnement, etc.). |
| `schema-reference.sql` | Schéma de base de données de référence. La source de vérité réelle en production reste `code/supabase/migrations/`. |
| `cahier-des-charges.docx` | Cahier des charges complet (référence de fond du produit). |

À la racine du dépôt (pas dans `docs/`) : `CLAUDE.md` (règles permanentes,
source de vérité des conventions) et `ORCHESTRATION.md` (comment ce projet a
été piloté tâche par tâche).

## Archive (`docs/archive/`)

| Dossier | Contenu |
|---|---|
| `archive/prompts/` | Les plans de tâches donnés phase par phase (`phase-0-et-1.md` → `phase-1-6.md`, puis `07-prompts-refonte-visuelle.md` pour la refonte visuelle V1-V10). **Toutes les tâches qu'ils décrivent sont terminées** — voir `PROGRESS.md` pour la confirmation. |
| `archive/rapports/` | Les comptes-rendus produits après chaque tâche des phases 0 à 1.5 (`RAPPORT-*.md`), plus leur gabarit (`gabarit-rapport.md`). Cette convention a été remplacée à partir de la refonte visuelle par des entrées directement dans `DECISIONS.md`/`PROGRESS.md` (pas de nouveaux `RAPPORT-*.md` après la Tâche 1.4b.1). |
| `archive/audits/` | Audits ponctuels du dépôt (structure, sécurité, conventions) — `AUDIT-1.0.md` (premier audit), `AUDIT-2.0.md` (suivi après corrections). |
| `archive/design/` | `DESIGN-v1-archive.md` — l'ancienne direction visuelle (v1), remplacée par la direction actuelle documentée dans `DESIGN.md` (voir `QUESTIONS.md`, résolu 2026-06-27). |
| `archive/maquettes/` | Maquettes HTML statiques de la toute première direction visuelle (accueil, page athlète, panier) — superseded par l'implémentation réelle. |

## Pour un nouveau développeur : par où commencer

1. `README.md` (racine du dépôt) — démarrage local, structure du code.
2. `CLAUDE.md` (racine) — règles non négociables (argent, sécurité, mineurs).
3. `PROGRESS.md` puis les dernières entrées de `DECISIONS.md` — état actuel et
   choix récents.
4. `DESIGN.md` — système de design actuel, si tu touches à l'UI.
5. Au besoin seulement : `archive/` pour comprendre *pourquoi* une décision
   ancienne a été prise.
