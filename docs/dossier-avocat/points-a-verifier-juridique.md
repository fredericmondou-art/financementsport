# Points à faire vérifier — audit juridique de fin août 2026

> Ceci n'est pas un avis juridique : c'est une liste de travail compilée à
> partir de `CLAUDE.md`, `docs/charte.md` et des notes déjà laissées dans le
> code (`docs/dossier-avocat/reglement-tirage-modele.md`,
> `docs/prompts/phase-c10-tirage.md`). Objectif : arriver à la rencontre avec
> une liste complète plutôt que de découvrir des trous en cours de route.

## Comment lire ce document

- **[Déjà identifié]** = point déjà signalé ailleurs dans le projet (souvent
  avec la référence légale précise trouvée pendant le développement).
- **[Nouveau]** = point qui découle du modèle d'affaires (argent de tiers,
  bénéficiaires mineurs) mais qui n'était pas encore formalisé comme question
  pour l'avocat. À valider si pertinent ou hors sujet.

---

## 1. Pages légales et conditions (gabarits à valider)

- **[Déjà identifié]** Politique de confidentialité, conditions d'utilisation,
  politique de remboursement/livraison : ce sont des **gabarits rédigés par
  Cowork**, explicitement marqués « à faire valider juridiquement » dans le
  produit. Rien n'a de valeur juridique définitive tant que l'avocat ne les a
  pas revus (`docs/archive/prompts/phase-1-4b.md`, tâche 1.4b.5).
- **[Nouveau]** Conformité à la *Loi sur la protection du consommateur* (Qc)
  pour : cartes-cadeaux/packs (règles de non-péremption), abonnements
  (contrats à exécution successive — droit de résiliation, avis), et
  politique de remboursement en cas de campagne annulée ou non atteinte.

## 2. Données personnelles — Loi 25 (Québec)

- **[Déjà identifié]** Conformité générale Loi 25 mentionnée comme préalable
  (`CLAUDE.md` §5, `charte.md` §8.2).
- **[Nouveau]** Un **responsable de la protection des renseignements
  personnels** est-il formellement désigné (obligatoire depuis la Loi 25) ?
- **[Nouveau]** Une **évaluation des facteurs relatifs à la vie privée (EFVP)**
  a-t-elle été faite pour la collecte de données de mineurs ?
- **[Nouveau]** Procédure de notification en cas d'incident de confidentialité
  (fuite de données) à la Commission d'accès à l'information — en place ?

## 3. Données et confidentialité des mineurs

- **[Déjà identifié]** Défaut « Standard » (profil complet visible) avec
  champs `hide_*` disponibles dès la V1 — à faire confirmer par l'avocat que
  ce défaut (opt-out plutôt qu'opt-in) est acceptable pour des mineurs
  (`CLAUDE.md` §2, `charte.md` §5.1).
- **[Déjà identifié]** Consentement parental requis avant publication d'un
  profil de mineur, et respect des demandes de suppression (`CLAUDE.md` §5).
  Mécanisme de **preuve** de ce consentement à valider avec l'avocat.
- **[Nouveau]** Seuil d'âge du consentement numérique au Québec (14 ans) :
  la collecte de renseignements d'un mineur de moins de 14 ans nécessite le
  consentement d'un titulaire de l'autorité parentale — à confirmer que le
  flux actuel le respecte pour tous les profils, pas seulement pour le
  module tirage.
- **[Nouveau]** Droit à l'image des mineurs (art. 36 C.c.Q.) pour les photos
  et noms affichés publiquement sur les pages athlète et sur les produits.

## 4. Qualification du « crédit » attribué au bénéficiaire

- **[Nouveau]** Qualification juridique et fiscale du crédit : don, commission
  commerciale, ou autre? Conséquence directe sur les obligations de
  déclaration.
- **[Nouveau]** Le crédit constitue-t-il un **revenu imposable** pour
  l'athlète (y compris mineur), l'équipe ou le club? Obligations de feuillets
  fiscaux (relevés) et retenues à la source éventuelles.
- **[Nouveau]** Traitement TPS/TVQ : le crédit réduit-il l'assiette taxable du
  produit vendu, ou est-il un service distinct? (`CLAUDE.md` impose déjà la
  table `tax_rates`, mais la question porte sur le traitement du crédit
  lui-même, pas seulement le taux.)

## 5. Encaissement et redistribution de fonds de tiers

- **[Nouveau]** La plateforme encaisse les paiements clients puis redistribue
  manuellement des sommes à des tiers (athlètes/équipes/clubs). À faire
  confirmer : est-ce que cela qualifie la plateforme d'« entreprise de
  services monétaires » au sens de la *Loi sur le recyclage des produits de
  la criminalité et le financement des activités terroristes* (obligations
  possibles d'enregistrement CANAFE/FINTRAC, tenue de dossiers, vérification
  d'identité des bénéficiaires) ?
- **[Nouveau]** Versements manuels validés par un administrateur (pas de
  Stripe Connect, `CLAUDE.md` §2) : est-ce que ce mode de versement change
  la réponse à la question précédente par rapport à un modèle automatisé ?

## 6. Travail et rémunération de mineurs

- **[Nouveau]** *Loi visant à prévenir les préjudices liés au travail des
  enfants* (Québec, 2023) : si le crédit peut être vu comme une forme de
  rémunération liée à l'image ou à la performance d'un athlète mineur,
  vérifier si des exigences (âge minimal, consentement parental renforcé,
  limites) s'appliquent par analogie.

## 7. Module tirage/billets (déjà en gate juridique)

Liste déjà établie dans `docs/prompts/phase-c10-tirage.md` (section C.10.10)
et `docs/dossier-avocat/reglement-tirage-modele.md` — reprise ici pour
mémoire, rien de nouveau :

- Validation art. 206 Code criminel (entrée sans achat + question d'habileté
  suffisante pour neutraliser la « contrepartie »)
- Dénomination légale exacte (NEQ) et confirmation qu'aucune obligation RACJ
  ne s'applique encore (abrogation du 27 octobre 2023, PL 17)
- Divulgation art. 74.06 *Loi sur la concurrence* (forme du prix, nombre et
  valeur des prix, modalités)
- Interdiction de publicité aux moins de 13 ans (art. 248-249 *Loi sur la
  protection du consommateur*) — lié à l'enjeu existant sur le
  dashboard/gamification athlète
- Loi 25 appliquée aux données du tirage (minimisation, durée de
  conservation, consentement parental)
- Qui répond à la question d'habileté pour un mineur : le parent ou
  l'athlète?
- Feu vert écrit requis avant `RAFFLE_ENABLED=true`

## 8. Propriété intellectuelle

- **[Nouveau]** Droits d'utilisation des noms, logos et marques des clubs,
  équipes et athlètes sur les produits vendus — licences ou ententes en place
  avec chaque bénéficiaire ?
- **[Nouveau]** Droits sur les photos/visuels utilisés sur les pages
  publiques et les produits.

## 9. Langue

- **[Nouveau]** Conformité à la *Charte de la langue française* (Loi 96) pour
  l'ensemble du contenu commercial, y compris le contenu fourni par des
  fournisseurs tiers (descriptions produits, etc.).

## 10. Responsabilité et assurances

- **[Nouveau]** Clauses de limitation de responsabilité dans les conditions
  d'utilisation (produit défectueux, retard de livraison, campagne annulée).
- **[Nouveau]** Couverture d'assurance responsabilité civile de l'entreprise,
  compte tenu de la manipulation de fonds destinés à des mineurs.

---

## Priorisation suggérée pour la rencontre de fin août

1. Pages légales + confidentialité des mineurs (§1-3) — bloque le lancement
   commercial (`charte.md` §8.2, risque #1).
2. Qualification du crédit et fiscalité (§4) — structure toute la mécanique
   financière du produit.
3. Statut « entreprise de services monétaires » (§5) — à trancher tôt, car
   ça peut avoir un impact d'architecture (pas seulement de texte légal).
4. Module tirage/billets (§7) — déjà cadré, prêt à soumettre tel quel.
5. Travail des mineurs, PI, langue, assurances (§6, §8-10) — pertinents mais
   moins urgents / plus simples à trancher.
