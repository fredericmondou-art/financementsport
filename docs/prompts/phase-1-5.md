# Prompts d'exécution — Phase 1.5

La Phase 1 a livré le flux vendable (campagne → page publique → achat → crédit).
La Phase 1.5 rend la campagne **opérationnelle de bout en bout** : un responsable
d'équipe mène sa campagne, distribue les produits, clôture, et l'admin suit, exporte
et calcule les versements (paiement manuel).

Mêmes règles qu'avant : une tâche à la fois, dans l'ordre ; tests verts avant de
passer à la suivante ; rapport `docs/gabarit-rapport.md` après chaque tâche ; respect du
`CLAUDE.md` (argent en centimes, RLS, confidentialité mineurs, contexte Québec :
français, CAD, TPS+TVQ via `tax_rates`).

Prérequis : Phase 1 (tâches 0.1 à 1.7) terminée et verte.

---

## TÂCHE 1.5.1 — QR codes téléchargeables (PNG / PDF)

**Contexte.** Section 18. Les QR codes existent déjà en base (table `qr_codes`,
créés à l'activation de campagne en tâche 1.7). Il faut maintenant les rendre
visibles, téléchargeables et suivre les scans.

**Objectif.** Génération d'images QR (PNG et PDF) pour athlète, équipe, club,
campagne et produit ; page de téléchargement ; comptage des scans et redirection
intelligente si la campagne est terminée.

**Fichiers concernés.**
- `lib/qr/generate.ts` (génération image à partir du `code` et de l'URL cible)
- `app/api/qr/[code]` (redirection + incrément `scan_count`)
- `app/(portal)/campagnes/[id]/qr` (page de téléchargement)

**Règles.**
- L'URL encodée pointe vers la page publique de la cible (slug).
- Si la campagne est `ended`/`closed`/`cancelled` : rediriger vers la boutique
  permanente ou `redirect_url` (section 18).
- Incrémenter `scan_count` à chaque accès, sans bloquer la redirection si l'écriture
  échoue.
- PNG pour usage écran, PDF pour impression (format lettre).

**Critères d'acceptation.**
- On télécharge le QR d'un athlète en PNG et en PDF.
- Scanner le QR mène à la bonne page publique et incrémente le compteur.
- QR d'une campagne terminée → redirige vers la boutique.

**Tests attendus.**
- Unitaire : génération produit un fichier non vide pour chaque type de cible.
- Intégration : accès à `/api/qr/[code]` incrémente `scan_count` et redirige bien.

---

## TÂCHE 1.5.2 — Génération automatique d'affiches

**Contexte.** Sections 17, 55. Les responsables doivent télécharger des affiches
prêtes à imprimer/partager, avec QR intégré.

**Objectif.** Générer des affiches (athlète, équipe, club) intégrant logo/photo,
objectif, dates, prix des packs, crédit généré et QR code, en formats PDF lettre,
carré (réseaux) et story.

**Fichiers concernés.**
- `lib/posters/generate.ts`
- `app/(portal)/campagnes/[id]/affiches`
- Réutilise `lib/qr/generate.ts` (tâche 1.5.1)

**Règles.**
- Respecter la confidentialité de l'athlète (`hide_photo`, `hide_last_name`, etc.) :
  ne jamais mettre sur une affiche une donnée masquée.
- Trois formats : lettre (impression), carré 1:1, story 9:16.
- Texte en français.

**Critères d'acceptation.**
- On télécharge une affiche d'athlète en PDF lettre avec QR scannable.
- Une affiche d'un athlète avec `hide_photo=true` n'affiche pas la photo.
- Les prix et crédits affichés correspondent aux packs de la campagne.

**Tests attendus.**
- Unitaire : l'affiche générée respecte les masquages (pas de champ interdit).
- Intégration : génération pour les 3 formats sans erreur.

---

## TÂCHE 1.5.3 — Saved splits : répartitions de bénéficiaires favorites

**Contexte.** Section 13. Un parent qui soutient plusieurs enfants veut réutiliser
sa répartition d'un achat à l'autre.

**Objectif.** Permettre à un client connecté de sauvegarder une répartition
multi-bénéficiaires nommée, et de la réappliquer au panier.

**Fichiers concernés.**
- Migration : table `saved_splits` (+ lignes `saved_split_items`)
- `lib/cart/saved-splits.ts`
- Intégration dans `components/beneficiary-split.tsx` (tâche 1.4)

**Règles.**
- Réservé aux clients connectés (RLS : chacun ne voit que ses propres splits).
- À l'application : valider que la somme fait toujours 100 % et que les
  bénéficiaires sont encore actifs ; sinon avertir et laisser corriger.
- Réutiliser la logique de validation existante de la tâche 1.4, ne pas la dupliquer.

**Critères d'acceptation.**
- Un client sauvegarde une répartition 50/50, la réapplique sur un nouveau panier.
- Un split référençant un bénéficiaire devenu inactif est signalé à l'application.

**Tests attendus.**
- Unitaire : validation de la somme et des bénéficiaires actifs.
- Intégration : sauvegarde puis réapplication, RLS (un client ne voit pas le split
  d'un autre).

---

## TÂCHE 1.5.4 — Liste de distribution par équipe

**Contexte.** Section 24. À la livraison, le responsable a besoin des commandes
regroupées par athlète/famille pour distribuer les produits.

**Objectif.** Générer une liste de distribution pour une campagne/équipe :
commandes regroupées par athlète puis par client, avec produits, quantités, statut
de paiement, exportable en PDF et CSV/Excel.

**Fichiers concernés.**
- `lib/distribution/build-list.ts` (utilise la table `distribution_lists`)
- `app/(portal)/campagnes/[id]/distribution`
- `lib/export/csv.ts`, `lib/export/pdf.ts` (réutilisables)

**Règles.**
- Regroupement : athlète → client → produits.
- Inclure le statut de paiement de chaque commande.
- Une seule adresse de livraison par commande (rappel règle section 13).
- Tri automatique (par athlète, puis nom de famille du client).

**Critères d'acceptation.**
- La liste regroupe correctement les commandes payées d'une campagne par athlète.
- Export PDF et CSV produisent les mêmes données.
- Une commande non payée apparaît avec le bon statut.

**Tests attendus.**
- Unitaire : logique de regroupement et de tri sur un jeu de commandes simulé.
- Intégration : génération + export, cohérence PDF/CSV.

---

## TÂCHE 1.5.5 — Confirmation de réception et livraison groupée

**Contexte.** Sections 22, 23. Le responsable confirme la réception des produits ;
les statuts de commande avancent jusqu'à « distribué ».

**Objectif.** Gérer les transitions de statut de commande liées à la livraison
groupée (`ready` → `delivered_to_team` → `distributed` → `completed`) et la
confirmation de réception par le responsable.

**Fichiers concernés.**
- `lib/orders/status.ts` (machine de transitions valides)
- `app/(portal)/campagnes/[id]/livraison`

**Règles.**
- Transitions de statut explicites et validées : interdire les sauts illégaux
  (ex. `payment_pending` → `distributed`).
- Seuls team_manager/admin du scope concerné peuvent faire avancer ces statuts.
- Chaque changement de statut horodaté et traçable.
- Notifier (journal `email_log`) le client à « distribué »/« complété » (l'envoi
  réel des courriels est en Phase 2, ici on journalise au minimum).

**Critères d'acceptation.**
- Un responsable confirme la réception : les commandes passent à
  `delivered_to_team`.
- Une transition illégale est refusée avec un message clair.

**Tests attendus.**
- Unitaire : la machine de statut accepte les transitions valides, rejette les
  invalides (table de cas).
- Intégration : parcours `ready` → `completed` par un responsable autorisé.

---

## TÂCHE 1.5.6 — Dashboard équipe

**Contexte.** Section 33. Le responsable doit suivre sa campagne en un coup d'œil.

**Objectif.** Tableau de bord équipe : objectif collectif, ventes totales, crédits
générés, nombre de commandes, panier moyen, ventes par athlète, progression dans le
temps, commandes à distribuer, statut de versement.

**Fichiers concernés.**
- `lib/dashboards/team.ts` (agrégations, en lecture seule)
- `app/(portal)/equipe/[teamId]`
- Composants de graphiques simples

**Règles.**
- Toutes les valeurs viennent des vues/agrégations (`v_campaign_progress`,
  `v_beneficiary_credit_totals`, `order_credits`) — jamais de soldes stockés en dur.
- Respecter le scope : un responsable ne voit que ses équipes (RLS + vérif serveur).
- Montants affichés en CAD, formatés correctement (centimes → dollars à l'affichage
  uniquement).

**Critères d'acceptation.**
- Le dashboard affiche le bon montant amassé après un achat test.
- Les ventes par athlète totalisent les ventes de l'équipe.
- Un responsable ne peut pas ouvrir le dashboard d'une équipe qui n'est pas la sienne.

**Tests attendus.**
- Unitaire : exactitude des agrégations sur un jeu de données connu.
- Intégration : isolation par scope (accès refusé hors équipe).

---

## TÂCHE 1.5.7 — Dashboard admin plateforme

**Contexte.** Section 35. L'admin doit avoir une vue d'ensemble opérationnelle et
financière.

**Objectif.** Tableau de bord admin : revenus totaux, commandes totales, marge brute
(si coûts disponibles), crédits dus, crédits payés, campagnes actives, campagnes à
risque, produits populaires, paiements échoués, remboursements, panier moyen.

**Fichiers concernés.**
- `lib/dashboards/admin.ts`
- `app/(admin)/dashboard`

**Règles.**
- Réservé à `platform_admin` (RLS + vérif serveur).
- « Crédits dus » = crédits actifs non encore versés (croisement avec `payouts`).
- « Campagne à risque » = active, proche de la fin, loin de l'objectif (définir le
  seuil, le noter dans `DECISIONS.md`).
- Lecture seule ; aucune action destructrice depuis le dashboard.

**Critères d'acceptation.**
- Les totaux correspondent à la somme réelle des commandes/crédits de test.
- « Crédits dus » diminue quand un versement passe à `paid`.
- Un non-admin ne peut pas accéder au dashboard.

**Tests attendus.**
- Unitaire : calcul des indicateurs sur jeu de données connu.
- Intégration : accès refusé hors `platform_admin`.

---

## TÂCHE 1.5.8 — Clôture de campagne

**Contexte.** Sections 16, 65 (étape 6) + automatisation 6. À la fin, on verrouille
les ventes pour figer les montants avant rapport et versement.

**Objectif.** Clôturer une campagne : passage en statut `closed`, verrouillage des
ventes (plus aucune commande/crédit rattaché après clôture), horodatage, déclenchement
de la génération du rapport (tâche 1.5.9).

**Fichiers concernés.**
- `lib/campaigns/close.ts`
- `app/(portal)/campagnes/[id]/cloturer`

**Règles.**
- Après clôture : refuser tout nouvel achat rattaché à cette campagne (les crédits
  deviennent non modifiables sauf via correction admin tracée).
- Clôture réservée au responsable/admin du scope.
- Action réversible uniquement par un admin (réouverture), avec trace dans
  `credit_audit_log`/`DECISIONS.md`.
- Vérifier qu'il n'y a pas de commande en cours de paiement non résolue ; sinon
  avertir avant de clôturer.

**Critères d'acceptation.**
- Clôturer une campagne empêche tout nouvel achat rattaché.
- Le statut passe à `closed` avec `closed_at` renseigné.
- Une tentative d'achat sur campagne close est refusée proprement côté serveur.

**Tests attendus.**
- Unitaire : règle de refus d'achat après clôture.
- Intégration : clôture → tentative d'achat refusée → réouverture admin tracée.

---

## TÂCHE 1.5.9 — Rapport de campagne

**Contexte.** Section 36. À la clôture, produire le rapport financier de la campagne.

**Objectif.** Générer un rapport de campagne : ventes brutes, taxes, ventes nettes,
coût produits (si dispo), frais de paiement, livraison, crédit équipe/bénéficiaires,
profit estimé ; exportable PDF/CSV/Excel.

**Fichiers concernés.**
- `lib/reports/campaign.ts`
- `app/(portal)/campagnes/[id]/rapport`
- Réutilise `lib/export/*` (tâche 1.5.4)

**Règles.**
- Tous les montants dérivés des données réelles (commandes, `order_credits`,
  `tax_rates`), en centimes, formatés en CAD à l'affichage.
- Le rapport d'une campagne `closed` est figé (les chiffres ne doivent plus bouger).
- Taxes ventilées TPS/TVQ pour le Québec.

**Critères d'acceptation.**
- Le rapport d'une campagne de test affiche des totaux cohérents avec les commandes.
- Ventes brutes − taxes = ventes nettes ; crédit total = somme des `order_credits`
  actifs de la campagne.
- Export PDF et CSV cohérents.

**Tests attendus.**
- Unitaire : exactitude de chaque ligne du rapport sur un jeu de données connu,
  ventilation TPS/TVQ.
- Intégration : génération + export après clôture.

---

## TÂCHE 1.5.10 — Calcul des versements (paiement manuel)

**Contexte.** Section 37. Décision V1 : le système CALCULE, l'admin paie à la main.
C'est une tâche financière sensible — soin maximal.

**Objectif.** Calculer le montant dû à chaque bénéficiaire à la clôture (somme des
crédits actifs), créer les enregistrements `payouts`, gérer le cycle de statut
(`calculated` → `approved` → `paid`) avec validation admin, retenue de frais
optionnelle, preuve de paiement et trace d'audit.

**Fichiers concernés.**
- `lib/payouts/calculate.ts` (fonction pure : crédits → montants dus)
- `lib/payouts/workflow.ts` (transitions de statut, validation admin)
- `app/(admin)/versements`

**Règles.**
- Montant dû = somme des `order_credits` en statut `active` du bénéficiaire pour la
  campagne, moins `fee_held_cents` si retenue.
- Ne jamais marquer `paid` automatiquement : un admin valide explicitement et
  fournit une preuve (`proof_url`).
- Tout changement de statut tracé (qui, quand) ; cohérence avec « crédits dus » du
  dashboard admin (tâche 1.5.7).
- Idempotent : recalculer ne crée pas de doublon de payout pour la même
  campagne/bénéficiaire.
- Gérer les crédits en attente (`pending`) : ne pas les verser tant qu'ils ne sont
  pas `active`.

**Critères d'acceptation.**
- Après clôture, le montant dû à chaque bénéficiaire = somme de ses crédits actifs.
- Un payout ne passe à `paid` que par action admin avec preuve.
- Recalcul ne duplique pas les payouts.
- Le « crédits dus » du dashboard admin baisse quand un payout passe `paid`.

**Tests attendus.**
- Unitaire : calcul des montants dus (plusieurs bénéficiaires, crédits actifs vs en
  attente, retenue de frais), idempotence.
- Intégration : cycle complet `calculated` → `approved` → `paid` avec preuve, trace
  d'audit, refus de paiement auto.
- **Scénario chiffré à fournir dans le rapport** (cf. docs/gabarit-rapport.md, tâches sensibles).

---

## TÂCHE 1.5.11 — Export des commandes (admin)

**Contexte.** Sections 22, 36. L'admin doit pouvoir exporter les commandes pour la
comptabilité et la logistique.

**Objectif.** Export des commandes (filtrable par campagne, équipe, période, statut)
en CSV/Excel, avec montants, taxes, crédits, bénéficiaires et statut.

**Fichiers concernés.**
- `lib/export/orders.ts`
- `app/(admin)/commandes/export`
- Réutilise `lib/export/csv.ts`

**Règles.**
- Réservé aux rôles autorisés (`platform_admin`, `accounting`).
- Montants en dollars dans l'export (conversion depuis centimes), clairement libellés.
- Filtres combinables ; export reflète exactement les filtres appliqués.
- Inclure la ventilation des taxes (TPS/TVQ).

**Critères d'acceptation.**
- Export d'une campagne donnée contient toutes ses commandes et seulement celles-là.
- Les totaux de l'export correspondent au rapport de campagne (tâche 1.5.9).
- Un rôle non autorisé ne peut pas exporter.

**Tests attendus.**
- Unitaire : application des filtres, exactitude des montants convertis.
- Intégration : cohérence export commandes ↔ rapport de campagne ; refus hors rôle.

---

## Après la Phase 1.5

Une fois 1.5.1 à 1.5.11 vertes et déployées, un responsable peut mener une campagne
complète (création → partage QR/affiches → ventes → distribution → clôture → rapport)
et l'admin peut suivre, exporter et calculer les versements. La Phase 2 ajoutera les
automatisations de fidélisation : réachat, relances automatiques, produits à la carte,
codes promo, support client, et l'envoi réel des courriels automatiques.
