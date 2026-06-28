# Direction visuelle — Plateforme de financement sportif (ARCHIVÉ — v1)

> **Archivé le 2026-06-26.** Cette direction a été validée par Frédéric le
> 2026-06-22 et implémentée dans les Phases 1.4 et 1.4b (tokens CSS dans
> `code/app/globals.css`, composants `components/ui/*`, page `/styleguide`).
> Elle est **remplacée par une nouvelle direction** (voir `docs/DESIGN.md` et
> `docs/prompts/07-prompts-refonte-visuelle.md`, Tâche V1). Conservé ici comme
> référence historique uniquement — ne plus utiliser pour de nouveaux travaux.

Statut : **proposition, non appliquée au site**. À valider par Frédéric avant la
Tâche 1.4.2 (voir `docs/QUESTIONS.md`).

Objectif : une identité sobre et crédible (plateforme financière qui touche des
enfants) tout en donnant de l'élan aux jeunes athlètes. Mobile-first, accessible
AA, en français.

## 1. Palette de couleurs

Toutes les paires texte/fond ci-dessous ont été vérifiées par calcul de contraste
WCAG (formule de luminance relative officielle), pas estimées à l'œil.

| Rôle | Couleur | Hex | Contraste texte blanc dessus | Usage |
|---|---|---|---|---|
| Primaire (confiance) | Bleu Confiance | `#1E3A5F` | 11.5:1 (AAA) | Boutons primaires, en-tête, liens, titres de section |
| Accent (action / élan) | Terracotta | `#C2410C` | 5.2:1 (AA) | CTA secondaires (« Encourager », boutons d'action ponctuels) — à utiliser avec retenue, jamais comme couleur dominante |
| Succès | Vert Succès | `#1F7A45` | 5.3:1 (AA) | Confirmations, crédit attribué, paiement réussi |
| Erreur | Rouge Erreur | `#C0392B` | 5.4:1 (AA) | Messages d'erreur, stock épuisé, échec de paiement |
| Avertissement | Ambre | `#B8860B` | 3.3:1 (insuffisant en texte blanc) | **Toujours en fond clair teinté `#FCEFC7` + texte foncé `#1A1F26`**, jamais en texte blanc dessus |
| Texte principal | Anthracite | `#1A1F26` | 16.6:1 sur blanc | Corps de texte, titres |
| Texte secondaire | Gris ardoise | `#5B6470` | 6.0:1 sur blanc | Légendes, métadonnées, texte secondaire |
| Fond | Blanc | `#FFFFFF` | — | Fond principal |
| Fond alterné | Gris très clair | `#F7F8FA` | — | Sections alternées, cartes |
| Bordure | Gris clair | `#E1E4E8` | — | Séparateurs, contours de champs |

Règle ferme : **jamais de texte blanc sur l'ambre ou sur une couleur non
vérifiée ci-dessus.** Toute nouvelle combinaison doit être vérifiée par calcul
avant usage (section 1.4.5 fera un audit automatisé en complément).

## 2. Typographie

- **Titres** : `Outfit` (Google Fonts) — géométrique, moderne, un peu d'élan
  sans perdre en sérieux. Graisses 600/700.
- **Corps de texte** : `Inter` (Google Fonts) — excellente lisibilité à toutes
  tailles, très large support, neutre et professionnel. Graisses 400/500/600.
- Chargement via `next/font/google` (auto-hébergé par Next.js, donc pas de
  requête externe au navigateur du visiteur — bon pour la performance et la
  confidentialité).
- Échelle (mobile-first, `rem`, base 16px) :

| Usage | Taille | Graisse | Interligne |
|---|---|---|---|
| Titre principal (H1) | 1.75rem (mobile) → 2.5rem (desktop) | 700 | 1.2 |
| Titre de section (H2) | 1.375rem → 1.875rem | 600 | 1.25 |
| Sous-titre (H3) | 1.125rem → 1.375rem | 600 | 1.3 |
| Corps | 1rem | 400 | 1.6 |
| Petit texte / légende | 0.875rem | 400 | 1.5 |
| Bouton | 0.9375rem | 600 | 1 |

## 3. Espacement

Échelle à base 4px, réutilisée partout (jamais de valeur arbitraire en dur) :

`4, 8, 12, 16, 24, 32, 48, 64, 96` (px), exposée comme tokens
`--space-1` à `--space-9`.

## 4. Rayons et ombres

- Rayon petit (champs, badges) : `6px`
- Rayon moyen (boutons) : `8px`
- Rayon large (cartes, modales) : `12px`
- Ombre légère (carte au repos) : `0 1px 3px rgba(26,31,38,0.08)`
- Ombre moyenne (carte au survol, menu) : `0 4px 12px rgba(26,31,38,0.12)`

Rayons modérés délibérément : assez doux pour être accueillant, pas assez pour
paraître « ludique » au point de nuire au sérieux d'une plateforme financière.

## 5. Ton

Chaleureux mais sérieux. Vouvoiement par défaut sur les pages publiques et
l'admin (on s'adresse à des parents, des gestionnaires, des organisations) ;
tutoiement possible uniquement si un profil athlète mineur s'adresse
directement à ses supporteurs dans un contenu éditorial qu'il contrôle (hors
scope V1). Pas de superlatifs marketing creux (« incroyable », « explosif ») ;
on préfère la clarté factuelle (« 1 240 $ amassés sur 2 000 $ », « 18 $ de
crédit pour [Nom] »).

## 6. Approche d'implémentation prévue pour la Tâche 1.4.2

Décision autonome (CLAUDE.md §9 — choix mineur, pas d'ambiguïté bloquante) :
**variables CSS natives** (`:root { --color-primary: ... }`) plutôt que
Tailwind. Le projet n'a actuellement aucune dépendance de styling ; ajouter
Tailwind maintenant introduirait un nouvel outil de build pour un projet dont
la priorité reste « ne jamais casser le cœur ». Les variables CSS suffisent
pour des tokens centralisés, fonctionnent nativement avec `next/font`, et
n'ajoutent aucune dépendance. Documenté aussi dans `docs/DECISIONS.md`.

## 7. Maquettes de validation

Trois maquettes statiques (HTML autonome, hors de l'application Next.js, donc
sans aucun impact sur le site actuel) sont fournies dans `docs/maquettes/` :

1. `accueil.html` — page d'accueil
2. `athlete.html` — page publique d'un athlète (avec barre de progression de
   campagne et confidentialité mineur respectée par défaut « Standard »)
3. `panier.html` — panier avec répartition entre bénéficiaires

Ouvrir directement ces fichiers dans un navigateur pour prévisualiser.

## 8. Prochaine étape (historique)

En attente de validation humaine (voir `docs/QUESTIONS.md`). Aucune
application au code de production tant que cette validation n'est pas
obtenue, conformément à la Tâche 1.4.1 du cahier de prompts.
