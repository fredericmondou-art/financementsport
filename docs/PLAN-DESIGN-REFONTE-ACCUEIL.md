# PLAN DE DESIGN — Refonte page d'accueil

> Étape 2 du processus demandé par `BRIEF-REFONTE-ACCUEIL.md` (section 11) :
> plan produit AVANT le code. Périmètre strict : page d'accueil
> (`app/(public)/page.tsx`) uniquement. Statut : **brouillon, en attente de
> validation** avant de coder et avant fusion dans `docs/DESIGN.md`.
>
> Base existante consultée : `docs/DESIGN.md` (direction validée
> 2026-06-27), `app/globals.css` (tokens actuels), `app/(public)/page.tsx`
> (page actuelle, Tâche V4).

---

## 1. Tokens — additions proposées (n'écrasent rien d'existant)

Tous les tokens `DESIGN.md` actuels restent valides ; ce qui suit s'ajoute
dans `app/globals.css`, scopé à `.home` sauf mention contraire.

**Contrastes renforcés**
- `--color-ink-strong: #17140F` — nouveau, réservé aux titres du hero et du
  scoreboard (plus dense que `--color-text` #2A2622, qui reste le texte
  courant).
- Les CTA primaires du hero passent en `--color-primary` (déjà AA) mais avec
  un poids de fonte plus lourd et un padding plus généreux (voir §5) pour
  paraître « plus francs », sans toucher au composant `Button` partagé
  (nouvelle variante `size="lg"` additive, pas de changement de l'existant).

**Aplats sarcelle (bandes d'aréna)**
- `--color-teal-deep: #0B4438` — nouveau, plus sombre que `--color-accent`
  (#0F6E56), pour les sections plein fond (« Pour les équipes », scoreboard).
  `--color-teal-deep-text: #FBF7F2` (= cream) pour le texte dessus — contraste
  vérifié > 8:1.
- Règle d'usage : au plus 2 sections en aplat sarcelle sur la page (voir
  wireframe §4), jamais adjacentes, pour garder l'alternance de rythme déjà
  en place sur le reste du site.
- Le corail (`--color-primary`) reste réservé à l'action et aux chiffres — pas
  de nouvel usage décoratif.

**Typographie**
- `--font-display: 'Archivo', var(--font-heading)` — nouvelle police condensée
  (variable, axes `wght`/`wdth`), chargée via `next/font/google`, réservée aux
  très grands titres du hero et du scoreboard (`.home h1`,
  `.home .scoreboard *`). Traitement : majuscules, `letter-spacing: 0.01em`,
  largeur condensée (`font-stretch`/axe `wdth` ~75-80).
- Le reste des titres de la page (`h2`, `h3` des sections) **reste** en
  `--font-heading` (Bricolage Grotesque, déjà validé) — le condensé sportif est
  un accent du hero/scoreboard, pas un remplacement généralisé des titres.
  Voir la question ouverte §6 sur le corps de texte.
- `--font-metric: 'Archivo', var(--font-heading)` avec
  `font-variant-numeric: tabular-nums`, poids 700+, pour tous les montants/
  compteurs héros du site (« 15 % », compteur de progression).

**Élément signature (scoreboard)**
- `--radius-scoreboard: 4px` (volontairement anguleux, tranche avec les 12–16px
  du reste du site — seule exception assumée, voir §4).
- `--color-scoreboard-bg: var(--color-teal-deep)`,
  `--color-scoreboard-digit: var(--color-primary-light)` (#F4732B, le ton
  vif plutôt que le 700 AA, car c'est un usage décoratif de chiffres larges
  et non du texte AA classique).
- Cadre fin `1px solid rgba(251,247,242,0.25)` façon panneau d'aréna.

Aucun token de `DESIGN.md` §2/§3 n'est modifié ; tout est additif.

## 2. Choix typographiques (arbitrage des pistes du brief)

- **Display retenu : Archivo** (variable, disponible sur Google Fonts,
  couvre les axes condensés demandés). Saira Condensed et Anybody restent des
  alternatives de repli si l'essai visuel d'Archivo déçoit — décision prise
  après un rendu réel sur `/styleguide-refonte`, pas seulement sur papier.
- **Corps de texte : Figtree** (tranché — voir §6). Choix confirmé malgré la
  rupture avec Inter (validé site-entier le 2026-06-27) sur le reste des
  pages ; à surveiller au rendu : le header/footer partagés (nav, `Button`,
  `Card`) restent en Inter tant que ce brief n'est pas fusionné dans
  `DESIGN.md`, donc la transition `/` → `/boutique` changera visiblement de
  police corps jusqu'à propagation.
- **Chiffres** : Archivo + `tabular-nums`, taille généreuse (voir §4
  scoreboard), jamais la police du corps.

## 3. Wireframe de sections (mappe le brief §9 sur la structure actuelle)

| # | Section | Fond | Contenu | Audience |
|---|---|---|---|---|
| 1 | Hero | `--color-bg` (cream) + illustration | Animation SVG en boucle (geste d'achat → soutien), titre en `--font-display`, 2 CTA max (« Encourager un athlète » primaire, « Lancer une campagne » secondaire), 1 compteur honnête (« 15 % de chaque achat va à l'athlète ») | Parent/supporter |
| 2 | Comment ça fonctionne | cream | 3 étapes illustrées (fusion des 4 étapes actuelles → 3 pour coller au brief : acheter → crédit calculé → athlète financé) | Parent |
| 3 | **Scoreboard d'impact** | `--color-teal-deep` (aplat sombre) | Élément signature, chiffres clés honnêtes en `--font-metric`, décompte animé au scroll | Tous |
| 4 | Produits vedettes | `--color-bg-alt` | 3 piliers produits (déjà en base : voir `supabase/seed.sql`), crédit généré affiché par carte (réutilise `ProductCard` existant) | Parent |
| 5 | Pour les équipes | `--color-teal-deep` (2e et dernier aplat sombre) | Promesse « campagne créée en 15 minutes », mini-démo du parcours responsable | Responsable d'équipe |
| 6 | Engagements | cream | Remplace la carte « Confiance » vide actuelle : produits québécois, 15 % intégral à l'athlète, livraison groupée, protection des données mineurs | Club + tous |
| 7 | Appel aux clubs | `--color-bg-alt` | Crédibilité B2B, CTA « Devenir club partenaire » (nouveau libellé — actuellement « Créer une campagne maintenant ») | Admin club |
| 8 | FAQ + footer | cream | FAQ existante conservée telle quelle | — |

CTA clubs — tranché (voir §6) : renommé en « Devenir club partenaire ».
`tests/e2e/accueil-confiance.spec.ts` devra être mis à jour dans la même
passe de code (nom accessible verrouillé actuellement sur « Créer une
campagne maintenant »).

## 4. Élément signature : le scoreboard

Traitement « tableau indicateur d'aréna », réutilisable plus tard (barres de
progression de campagne, crédit généré au panier, dashboards — hors
périmètre de cette tâche, homepage seulement pour l'instant) :

- Panneau plein fond `--color-teal-deep`, coins `--radius-scoreboard` (4px,
  seule exception aux rayons doux du reste du site — assumé et documenté ici
  pour ne pas être pris pour un oubli de cohérence).
- Chiffres en `--font-metric`, très grands, `--color-scoreboard-digit`
  (corail vif), cadre fin façon panneau lumineux.
- Animation : décompte/montée au premier passage dans le viewport
  (`IntersectionObserver`, pas de librairie ajoutée), respecte
  `prefers-reduced-motion` (saut direct à la valeur finale, sans animation).
- Contenu en pré-lancement : libellés honnêtes uniquement (« 15 % de chaque
  achat », pas de statistique inventée), conforme à la contrainte déjà
  respectée par la page actuelle (aucun témoignage/chiffre fictif).

## 5. Mouvement (cadre les règles du brief §8 en options techniques)

- Révélations au scroll : CSS `@starting-style`/`animation` déclenchée par
  `IntersectionObserver` par section, pas de librairie JS ajoutée (cohérent
  avec « aucun composant client sauf Modal » — nouvelle exception ciblée à
  documenter si un Client Component devient nécessaire pour l'observer).
  Alternative sans JS : `animation-timeline: view()` en CSS natif si le
  support navigateur cible le permet — à valider en phase code.
- `prefers-reduced-motion: reduce` : désactive toutes les animations
  (déplacement, décompte), pas seulement les réduit.
- Aucune vidéo, aucune librairie de parallaxe.

## 6. Questions tranchées (résolu — 2026-07-10)

1. **Corps de texte** → **Figtree** (suit le brief à la lettre, malgré la
   rupture temporaire de cohérence avec Inter ailleurs sur le site — voir
   §2).
2. **Libellé CTA clubs** → **« Devenir club partenaire »** (remplace « Créer
   une campagne maintenant » ; `tests/e2e/accueil-confiance.spec.ts` à
   ajuster dans la même passe de code).

## 7. Autocritique contre le brief (checklist section 12)

- Compréhension en 5 secondes sans scroller → hero à 1 message + 1 sous-texte
  + 2 CTA + 1 chiffre, pas plus : respecté par construction.
- Crédit de 15 % impossible à manquer → présent dans le hero ET répété dans
  le scoreboard (redondance volontaire).
- Aucun visage réaliste/photo de mineur → illustration SVG uniquement,
  cohérent avec la décision déjà prise à la Tâche V4 (aucune photo de banque
  disponible/validée) — le brief renforce une contrainte déjà en place.
- Anti-générique (§3 du brief) → différenciation via (a) Archivo condensé au
  lieu d'une serif, (b) 2 aplats sarcelle plein fond, (c) scoreboard anguleux
  qui tranche avec les cartes arrondies. Point de vigilance réel : Bricolage
  Grotesque (titres de section) et Archivo (hero/scoreboard) doivent rester
  visuellement distincts au rendu — à vérifier à l'écran, pas seulement sur
  papier.
- Lighthouse mobile ≥ 90 → aucune vidéo, SVG/CSS uniquement pour l'animation,
  polices limitées à 2 familles + 1 condensée (3 chargements `next/font`
  maximum) : risque principal est le poids de la police variable Archivo à
  surveiller au build.
- Le mouvement sert la narration → révélations par section uniquement,
  aucun effet par élément individuel.

**Point de tension non résolu que je signale plutôt que de trancher seul** :
le brief propose une direction typographique (condensé sport) qui coexiste
avec `DESIGN.md` déjà validé (Bricolage Grotesque partout) sans le remplacer
tant que ce brief n'est pas fusionné. Ce plan traite donc le condensé comme
un **accent local au hero/scoreboard**, pas un remplacement — si l'intention
était un remplacement complet des titres du site, dites-le avant que je code.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            