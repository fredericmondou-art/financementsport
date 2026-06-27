# DESIGN.md — Direction esthétique de FinancementSport

> **Remplace** la direction visuelle v1 (validée 2026-06-22, implémentée
> Phases 1.4/1.4b) — voir `docs/DESIGN-v1-archive.md` pour l'historique.
> Nouvelle direction en cours de validation, voir `docs/prompts/
> 07-prompts-refonte-visuelle.md` (Tâche V1) et `docs/QUESTIONS.md`.

Document de référence visuelle. Toute interface du site doit s'y conformer. Ambiance
choisie : CHALEUREUSE ET HUMAINE — énergie, sport, familles, couleurs vivantes —
tout en restant rassurante (on touche à l'argent de familles et au sport d'enfants).

NOTE : cette direction est une PROPOSITION de départ. Le propriétaire la valide et
l'ajuste avant application complète (cf. tâche dédiée). Les valeurs ci-dessous sont
un point de départ cohérent, pas un dogme.

---

## 1. Esprit

Le site doit donner, dès la première seconde, trois sensations :
- CHALEUR : des visages, du mouvement, des couleurs vivantes, du sport.
- CLARTÉ : on comprend quoi faire sans réfléchir ; rien n'est encombré.
- CONFIANCE : c'est soigné, cohérent, sérieux dans les détails ; on confie son
  argent sans hésiter.

Mot d'ordre : « chaleureux mais fiable ». Ni froid et corporatif, ni criard et
amateur.

## 2. Palette de couleurs (proposition neuve)

Approche : une couleur principale énergique et chaleureuse, une couleur d'accent
pour l'action, des neutres doux (pas de blanc clinique ni de gris froids), et des
couleurs d'état claires. Valeurs hex de départ, à ajuster à la validation :

COULEUR PRINCIPALE (énergie, sport) — un orange chaud/corail :
- primary-50  #FFF4ED  (fonds très clairs, surbrillances)
- primary-100 #FFE0CC
- primary-500 #F4732B  (couleur de marque, accents)
- primary-600 #DC5A14  (boutons principaux, liens forts)
- primary-700 #B4430A  (survol, texte sur fond clair)

COULEUR SECONDAIRE (confiance, calme) — un bleu-vert/teal profond :
- secondary-50  #E8F6F1
- secondary-500 #1F9E7A
- secondary-700 #0F6E56  (titres d'accent, éléments de réassurance)

NEUTRES CHAUDS (pas de gris froid) — base de tout le texte et des fonds :
- ink      #2A2622  (texte principal — brun très foncé, plus chaleureux que le noir)
- slate    #6B635C  (texte secondaire)
- cream    #FBF7F2  (fond de page — chaleur subtile vs blanc pur)
- surface  #FFFFFF  (cartes, surfaces surélevées)
- border   #ECE5DC  (bordures douces et chaudes)

ÉTATS :
- success #1F9E7A (réutilise le teal)
- warning #E89B22
- danger  #D8483F
- info    #2C7BB8

RÈGLES DE COULEUR :
- Le fond de page est `cream`, pas le blanc pur : ça réchauffe immédiatement.
- L'orange principal est réservé aux ACTIONS et aux accents, jamais en grands
  aplats qui fatiguent l'œil.
- Le texte n'est jamais noir pur (#000) : toujours `ink` (#2A2622).
- Contrastes conformes WCAG AA partout (vérifier chaque paire texte/fond).

## 3. Typographie

Deux familles maximum, lisibles et chaleureuses :
- TITRES : une sans-serif géométrique au caractère affirmé (ex : « Bricolage
  Grotesque », « Clash Display » ou « Fraunces » pour un côté plus humain). Doit
  avoir de la personnalité sans nuire à la lisibilité.
- TEXTE : une sans-serif neutre et très lisible (ex : « Inter », « Plus Jakarta
  Sans »).

Échelle (desktop ; réduire proportionnellement sur mobile) :
- Titre héros : 48–56px, poids 700, interligne serré
- H1 page : 36–40px, poids 700
- H2 section : 28px, poids 600
- H3 : 20px, poids 600
- Corps : 17px, poids 400, interligne 1.6 (confort de lecture)
- Petit texte : 14px

RÈGLES : pas plus de deux familles. Sentence case (pas de TOUT EN MAJUSCULES).
Hiérarchie claire : on doit distinguer titre / sous-titre / corps d'un coup d'œil.

## 4. Espacement et mise en page

Le défaut actuel du site est le VIDE : contenu étroit, perdu au centre. Corriger :
- Largeur de contenu confortable (max ~1100–1200px), bien rempli, pas une colonne
  étriquée au milieu d'un océan blanc.
- Rythme vertical généreux et RÉGULIER entre les sections (échelle d'espacement :
  4, 8, 12, 16, 24, 32, 48, 64px).
- Les sections alternent les fonds (cream / surface / léger teinté) pour créer du
  rythme et éviter la page plate.
- Mobile-first : tout doit respirer aussi sur petit écran, sans entassement.

## 5. Composants

- COINS : arrondis doux et cohérents (cartes 12–16px, boutons 8–10px). Jamais
  d'arrondi sur un seul côté.
- OMBRES : subtiles et chaudes (jamais de grosses ombres dures). Une ombre légère
  suffit à décoller une carte.
- BOUTONS : principal = fond `primary-600`, texte blanc, bien rembourré, survol
  plus foncé ; secondaire = contour. Taille tactile (≥44px de haut) pour le mobile.
- CARTES : fond `surface`, bordure `border` fine, arrondi 12–16px, contenu aéré,
  hauteurs égales dans une grille.
- ÉTATS DE SURVOL ET TRANSITIONS : douces (150–200ms), présentes mais discrètes —
  elles donnent l'impression « vivant et soigné ».
- ICÔNES : un set cohérent (une seule famille), trait régulier, jamais mélangé.

## 6. Imagerie (point sensible — mineurs)

- Pages MARKETING (accueil, à propos) : vraies photos de banque libres de droits,
  chaleureuses, diverses (sport, jeunes, familles, mouvement). Ne JAMAIS faire
  passer un mannequin pour un vrai athlète de la plateforme.
- Pages PROFIL D'ATHLÈTE : seules vraies photos d'enfants admises = celles
  téléversées par un parent AVEC consentement, et toujours soumises aux masquages
  (`hide_photo`, etc.).
- LIANT : illustrations et éléments graphiques (formes organiques, motifs,
  textures douces aux couleurs de la marque) pour réchauffer sans risque de droits
  ni de confidentialité.
- Toute image a un texte alternatif ; les images sont optimisées (poids, format).

## 7. Ton et formulations

- Tout en français québécois, chaleureux et simple. Tutoiement cohérent avec la
  cible familiale (à confirmer par le propriétaire : tu/vous — choisir UN registre
  et s'y tenir partout).
- Zéro jargon visible par l'utilisateur. « Choisis qui tu veux encourager », pas
  « sélectionner un bénéficiaire ».
- Les montants : format CAD clair (35,00 $).

## 8. Ce qu'on évite absolument

- Le blanc clinique et les gris froids (on veut de la chaleur).
- Les grands vides : contenu perdu au centre.
- Les pages plates sans rythme ni alternance.
- Le mélange d'icônes ou de polices dépareillées.
- Les couleurs criardes ou les dégradés tape-à-l'œil.
- Tout ce qui fait « gabarit par défaut non personnalisé ».
