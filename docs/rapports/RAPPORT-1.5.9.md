# Rapport — Tâche 1.5.9 : Rapport de campagne

**Date :** 2026-06-24
**Statut :** ✅ Terminé

## 1. En une phrase
Le responsable d'une campagne (ou un `platform_admin`) peut maintenant consulter et exporter (CSV/PDF) un rapport financier complet de la campagne — ventes brutes, taxes ventilées TPS/TVQ, ventes nettes, frais de paiement, livraison, crédit total, profit estimé — qui se figent définitivement dès que la campagne est clôturée.

## 2. Ce que j'ai fait
- Écrit la migration `0018_campaign_reports.sql` : table `campaign_reports`, clé `UNIQUE (campaign_id, closed_at)` (auto-invalidation à chaque cycle clôture/réouverture), RLS avec policies SELECT/INSERT ordinaires (`private.is_platform_admin() OR private.manages_campaign(campaign_id)`), volontairement aucune policy UPDATE/DELETE — l'immuabilité du figeage est imposée par la base elle-même.
- Étendu `lib/db/types.ts` (`CampaignReportsTable`, `Update: never`).
- Écrit `lib/reports/campaign.ts` : `splitQcTax`/`findApplicableTaxRateBps` (ventilation TPS/TVQ depuis le taux combiné unique de `tax_rates`), `summarizeSales`/`summarizeTaxBreakdown`/`summarizePaymentFees`/`summarizeCreditTotal`, `computeProductCost` (toujours indisponible), `computeProfitEstimate`, `buildCampaignReport` (assemblage pur), repo Supabase + `loadCampaignReport` (orchestration : lit le figeage existant si `closed`, sinon le calcule et l'enregistre, sinon calcule en direct si la campagne est encore active).
- Écrit `lib/reports/export.ts` : `flattenCampaignReport` (source unique partagée), `buildCampaignReportCsv`/`buildCampaignReportPdf`.
- Créé la page `app/(portails)/campagnes/[campaignId]/rapport` + routes `app/api/campagnes/[campaignId]/rapport/{csv,pdf}`.
- Écrit et fait passer 25 nouveaux tests unitaires (`reports-campaign.test.ts`) + 8 nouveaux tests d'intégration RLS (`campaign-report-rls.test.ts`, Postgres embarqué).
- Relancé toute la suite de tests unitaires existante (aucune régression), plus `tsc --noEmit` et `eslint .` sur les fichiers nouveaux/modifiés.
- Documenté les cinq décisions autonomes dans `docs/DECISIONS.md` et mis à jour `docs/PROGRESS.md`.

## 3. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| Rapport sur une campagne test : totaux cohérents avec les commandes | ✅ | `buildCampaignReport`, test « assemble toutes les lignes de façon cohérente » sur un jeu de données connu |
| Ventes brutes − taxes = ventes nettes | ✅ | `summarizeSales` : `netSalesCents = grossSalesCents - taxCents`, vérifié explicitement |
| Crédit total = somme des `order_credits` actifs de la campagne | ✅ | `summarizeCreditTotal` filtre `status === 'active'` uniquement, conforme à la formulation explicite du cahier |
| Export PDF et CSV cohérents | ✅ | les deux construits depuis la même fonction pure `flattenCampaignReport` — cohérence structurelle garantie, pas vérifiée au runtime |
| Taxes ventilées TPS/TVQ (spécifique Québec) | ✅ | `splitQcTax` : `tpsCents + tvqCents = taxCents` exactement, testé y compris sur les cas de reliquat d'arrondi |
| Rapport figé après clôture | ✅ | table `campaign_reports`, clé `(campaign_id, closed_at)`, aucune policy UPDATE/DELETE ; testé : tentative d'UPDATE → 0 ligne touchée |

## 4. Tests
- Commandes lancées : `npx vitest run tests/unit/reports-campaign.test.ts`, `npx vitest run tests/integration/campaign-report-rls.test.ts`, `npx vitest run tests/unit` (suite complète), `npx tsc --noEmit`, `npx eslint <fichiers touchés>`.
- Résultat : 100 % verts. 25 nouveaux tests unitaires + 8 nouveaux tests d'intégration = 33 nouveaux tests ; suite unitaire complète (27 fichiers) sans régression ; `tsc`/`eslint` propres.
- Cas limites couverts : `taxCents = 0` (pas de division par zéro), `combinedRateBps <= 0` (défensif, tout en TVQ), reliquat d'arrondi non multiple de 500, aucune commande/crédit/versement (tout à zéro sans erreur), commande payée avec taxe à 0 (produit non taxable), absence de taux applicable à la date de la commande, anon/manager non lié refusés sur `campaign_reports`, contrainte `UNIQUE (campaign_id, closed_at)` (double figeage rejeté), second cycle de clôture (deux figeages distincts coexistent), tentative d'UPDATE/DELETE (immuabilité).

## 5. Décisions prises en autonomie
Cinq décisions, détaillées dans `docs/DECISIONS.md` (entrée « 2026-06-24 — Tâche 1.5.9 ») :
1. Ventilation TPS/TVQ recalculée depuis le taux combiné unique de `tax_rates` + une constante fédérale fixe (5 %), pas une nouvelle colonne.
2. Figeage via une table clé `(campaign_id, closed_at)` plutôt qu'un cache à durée de vie — auto-invalidation naturelle à chaque cycle clôture/réouverture.
3. RLS par policy ordinaire (SELECT/INSERT), pas par fonction `SECURITY DEFINER` — pas de logique transactionnelle complexe à protéger ici.
4. Frais de paiement = `fee_held_cents` sommé sur tous les statuts de versement, pas seulement `paid`.
5. Province de facturation (QC en dur) et coût produit (toujours indisponible) : mêmes limitations déjà actées au dashboard admin (Tâche 1.5.7), pas de nouvelle hypothèse.

## 6. Respect des règles non négociables
- Argent en centimes, arithmétique entière : ✅ (toutes les sommes en `*_cents`, aucun `float`)
- Calcul de crédit / création de commande toujours atomiques : ✅ (aucun changement à `create_paid_order`, ce rapport ne fait que lire)
- Le crédit ne se déclenche que sur paiement confirmé : ✅ (inchangé, le rapport ne fait que lire `order_credits` existants)
- RLS activée, aucune table exposée sans policy : ✅ (`campaign_reports` a RLS + policies SELECT/INSERT)
- Toute modification post-hoc d'un crédit tracée : ✅ (inchangé — ce rapport ne modifie jamais `order_credits`)
- Aucun secret en dur dans le code : ✅
- Pas de régression : ✅ (suite unitaire complète relancée, aucun échec)

## 7. Limites et risques
Le total des ventes/taxes/livraison est scopé via `orders.primary_campaign_id`, alors que le crédit total est scopé via `order_credits.campaign_id` (conformément à la formulation explicite du critère d'acceptation) — ces deux scopings peuvent diverger pour une commande multi-bénéficiaires/multi-campagnes, limitation préexistante héritée de la Tâche 1.4.6, pas introduite ici. Pas de nouveau test e2e Playwright (même limitation réseau du bac à sable que les tâches précédentes) — couvert par les tests unitaires + intégration RLS contre un vrai Postgres embarqué.

## 8. Ce qu'il me faut de toi
Rien, je passe à la tâche suivante.

## 9. Prochaine tâche
1.5.10 — Calcul des versements (manuel).
