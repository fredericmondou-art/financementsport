# Charte de projet — Plateforme de financement sportif

> Statut : signée

**Porteur de projet :** Frédéric Mondou
**Date de la charte :** 15 juillet 2026
**Statut du projet :** En cours — cœur V1 livré et testé (13 juillet 2026), avant lancement commercial
**Date de démarrage :** 19 juin 2026 (initialisation du dépôt)

## 1. Contexte et description

Le projet vise à doter une entreprise établie au Québec (Canada) d'une plateforme web de financement sportif destinée aux athlètes, équipes et clubs. La plateforme combine quatre systèmes intégrés : une boutique en ligne (produits, packs, abonnements), un moteur de financement qui calcule et attribue automatiquement des crédits (de l'argent réel) au bénéficiaire choisi lors de chaque vente, des portails de gestion permettant aux clubs et équipes de suivre leurs campagnes, et un back-office administratif complet (produits, commandes, crédits, paiements, livraisons, rapports).

Le problème résolu : aujourd'hui, le financement d'activités sportives (athlètes, équipes, clubs) repose sur des campagnes de vente gérées manuellement, sans lien automatique entre une vente et le crédit dû au bénéficiaire. La plateforme automatise ce lien de bout en bout : identifier le bénéficiaire → vendre → calculer le crédit → l'attribuer → afficher l'impact → regrouper les commandes → relancer → produire des rapports.

## 2. Objectif et valeur d'affaires

Permettre à des athlètes, équipes et clubs sportifs de financer leurs activités par la vente de produits en ligne, en éliminant le calcul et le suivi manuel des crédits, et en donnant aux clubs et équipes un outil de gestion et de reddition de comptes en libre-service (campagnes, distribution, rapports). Pour l'entreprise porteuse, le bénéfice attendu est une plateforme différenciante et automatisée, capable de gérer un volume de campagnes croissant sans alourdir la charge administrative proportionnellement. Cible chiffrée retenue : **20 campagnes actives dans les 6 mois suivant le lancement commercial** (détail au §4).

## 3. Hypothèse de valeur

Nous croyons qu'une plateforme combinant boutique en ligne et attribution automatique de crédits aux athlètes, équipes ou clubs permettra de simplifier et de fiabiliser le financement sportif pour les organisations bénéficiaires, ce qui sera validé par le nombre de campagnes actives, le volume de commandes traitées sans intervention manuelle et le taux de satisfaction des clubs/équipes utilisant les portails.

## 4. Critères de succès / KPIs

**Objectif chiffré principal (validé le 15 juillet 2026) : 20 campagnes de financement actives dans les 6 mois suivant le lancement commercial.** Cette cible sera mesurée à partir de la date de lancement commercial (§10, jalon « À déterminer ») et revue à mi-parcours (3 mois).

Indicateurs secondaires chiffrés (validés le 15 juillet 2026) :

- **Délai d'activation d'une campagne ≤ 14 jours** entre l'inscription et la première vente — mesure la facilité de prise en main des portails par les clubs/équipes.
- **Taux de reconduction ≥ 50 %** des clubs/équipes qui lancent une 2ᵉ campagne dans les 12 mois suivant la 1ʳᵉ — mesure la satisfaction et la valeur perçue à long terme.

Indicateurs secondaires de suivi, sans seuil chiffré pour l'instant :

- Volume et valeur des commandes traitées par la boutique
- Montant total des crédits attribués aux bénéficiaires
- Taux de conversion du parcours d'achat (panier → paiement confirmé)
- Délai moyen de versement aux bénéficiaires (processus manuel en V1)
- Adoption des portails par les clubs/équipes (comptes actifs, fréquence d'utilisation)
- Zéro incident de sécurité ou de fuite de données, en particulier sur les données de mineurs

## 5. Portée du projet

### 5.1 Inclus (V1)

| Volet | Contenu |
|---|---|
| Boutique en ligne | Produits, packs, abonnements ; panier multi-bénéficiaires ; paiement Stripe (Checkout + webhooks) |
| Moteur de financement | Calcul et attribution automatique des crédits ; bénéficiaire polymorphe (athlète, équipe ou club) ; règles de crédit configurables par campagne/produit |
| Portails de gestion | Portails compte, campagnes (assistant, démarrage, QR, affiches, distribution, rapport, clôture) et équipe |
| Back-office admin | Produits, commandes, crédits, paiements, livraisons, rapports, paramètres de plateforme (P.1 à P.8), mécanisme de dérogation |
| Conformité / sécurité | Taxes QC (TPS/TVQ), Row Level Security sur toutes les tables, champs de masquage pour données de mineurs, interface en français |
| Module optionnel | Tirage / billets — développé mais désactivé, en attente d'un feu vert juridique |

### 5.2 Explicitement hors scope (V1)

- Marketplace ouverte à des vendeurs tiers
- Application mobile native
- Gestion multi-entrepôts
- Recommandations par intelligence artificielle
- Support multilingue complet (le français est la langue par défaut et unique en V1)
- Comptabilité complète intégrée
- Abonnements très flexibles (changement de formule en libre-service, etc.)
- Remboursement automatisé complexe
- Versements automatiques aux bénéficiaires (Stripe Connect) — les versements restent manuels en V1, validés par un administrateur

## 6. Gouvernance, parties prenantes et personas

### 6.1 Gouvernance et parties prenantes

| Partie prenante | Rôle |
|---|---|
| Frédéric Mondou | Porteur de projet et commanditaire — seul décideur sur les arbitrages produit et technique |
| Fournisseurs de produits | Parties prenantes externes — approvisionnent le catalogue boutique ; ententes en cours de négociation (chantier 1, §7 et §10) |

Aucun autre rôle formel (associé, avocat mandaté, designer dédié) n'est nommé à ce jour ; à revoir si le volume de campagnes ou la structure de l'entreprise évolue.

### 6.2 Personas et utilisateurs cibles

- **Acheteurs / donateurs** — grand public achetant des produits pour soutenir un athlète, une équipe ou un club
- **Athlètes bénéficiaires** — profils publics, impact affiché, sous réserve des règles de confidentialité pour les mineurs
- **Gestionnaires de club / d'équipe (team managers)** — utilisent les portails pour créer et suivre des campagnes, distribuer les crédits et produire des rapports
- **Administrateurs de la plateforme** — gèrent produits, commandes, crédits, paiements, livraisons et paramètres via le back-office

## 7. Grandes capacités et livrables

- Boutique en ligne avec catalogue produits/packs/abonnements et paiement Stripe
- Moteur de crédit automatique (calcul, attribution, audit des modifications)
- Portails campagne / équipe / compte pour les bénéficiaires et gestionnaires
- Back-office admin complet, incluant paramètres de plateforme configurables (P.1 à P.8)
- Refonte visuelle complète du site (direction validée, déploiement en cours — voir section 10)
- Partenariats fournisseurs pour approvisionner le catalogue produits (chantier business, hors code)

## 8. Hypothèses et contraintes

### 8.1 Techniques

- Stack imposée : Next.js (App Router) + React + TypeScript, PostgreSQL via Supabase (RLS activée sur toutes les tables), Supabase Auth, Stripe, SendGrid, Supabase Storage, hébergement Vercel
- Tout montant est stocké en centimes (integer), jamais en float ; calcul de crédit et création de commande atomiques (transaction DB unique)
- Le crédit ne se déclenche que sur confirmation de paiement par webhook Stripe, avec idempotence garantie

### 8.2 Légales

- Entreprise établie au Québec (Canada) : taxes TPS 5 % + TVQ 9,975 %, adresses au format canadien
- Les pages légales (confidentialité, conditions, remboursement/livraison) sont des gabarits — une révision juridique professionnelle est requise avant tout lancement commercial, notamment sur la confidentialité des données de mineurs
- **Statut (mis à jour le 15 juillet 2026) : rencontre d'audit juridique planifiée pour fin août 2026** avec un cabinet d'avocats, portant sur les pages légales et la confidentialité des données de mineurs. Le lancement commercial et l'activation du module tirage/billets restent conditionnels aux conclusions de cette revue.
- Le module tirage/billets est bloqué en attente d'un feu vert juridique avant activation

### 8.3 Budgétaires et opérationnelles

- Versements aux bénéficiaires manuels en V1 (validation par un administrateur) — pas de Stripe Connect ; implique une charge opérationnelle récurrente à anticiper si le volume croît
- Catalogue produits dépendant de partenariats fournisseurs non encore finalisés

### 8.4 Temporelles

- Aucune date de lancement commercial n'est fixée à ce jour dans la documentation du projet

## 9. Risques identifiés

| Risque | Impact potentiel | Mitigation / statut |
|---|---|---|
| Pages légales non révisées par un avocat | Non-conformité au lancement commercial (confidentialité, mineurs) | Statut au 15 juillet 2026 : **audit juridique planifié fin août 2026** avec un cabinet d'avocats. Lancement commercial et activation du tirage/billets restent conditionnels aux conclusions de cette revue. |
| Données de mineurs | Risque réputationnel et légal en cas de mauvaise gestion du consentement / masquage | Champs de masquage (`hide_*`) présents dès la V1 ; défaut « Standard » à reconfirmer selon avis juridique |
| Tests e2e non exécutés en environnement de développement | Régressions non détectées sur les parcours critiques avant mise en production | À exécuter en CI ou en local avant tout lancement (accès réseau Chromium/Supabase/Stripe requis) |
| Partenariats fournisseurs non finalisés | Catalogue produit limité ou vide au lancement commercial | Chantier business en cours, suivi dans `TODO.md` |
| Versements manuels à l'échelle | Charge opérationnelle et risque d'erreur humaine si le volume de campagnes augmente | Décision assumée pour la V1 ; migration vers Stripe Connect à réévaluer plus tard |
| Module tirage/billets | Fonctionnalité développée mais inutilisable tant que le feu vert juridique n'est pas obtenu | Fonctionnalité désactivée par indicateur (`RAFFLE_ENABLED`) en attendant |
| ~~Absence de KPIs et de budget formalisés~~ | ~~Difficulté à mesurer le succès du projet et à arbitrer les priorités~~ | **Résolu le 15 juillet 2026** : KPI principal chiffré (§4) et effort restant estimé à ~150-200 h (§11) |

## 10. Échéancier et jalons

| Date | Jalon |
|---|---|
| 19 juin 2026 | Initialisation du dépôt et de la structure de suivi du projet |
| 22 juin 2026 | Validation de la première direction visuelle (design v1) |
| 27 juin 2026 | Nouvelle direction visuelle validée (refonte design), remplaçant la v1 |
| 13 juillet 2026 | Cœur V1 livré et testé : boutique, moteur de crédit, panier multi-bénéficiaires, paiement Stripe, pages publiques, portails campagne/équipe/compte, back-office admin, paramètres de plateforme (P.1 à P.8) |
| En cours | Chantier 1 — Partenariats fournisseurs (business, hors code) : identification, négociation et signature avec les fournisseurs |
| En cours | Chantier 2 — Refonte design complète : extension de la direction visuelle validée à l'ensemble des pages (boutique, pages publiques, panier/paiement, portails, back-office, styleguide) |
| Fin août 2026 | Audit juridique planifié avec un cabinet d'avocats — pages légales, confidentialité des données de mineurs, gate du module tirage/billets |
| À déterminer | Exécution complète des tests e2e (Playwright) en environnement avec accès réseau |
| À déterminer | Lancement commercial |

## 11. Estimation et budget

Aucun budget monétaire formel n'est documenté dans le projet. **Effort restant estimé (validé le 15 juillet 2026) : ~150-200 heures avant le lancement commercial**, couvrant la refonte design complète (chantier 2, §7/§10) et l'intégration des premiers partenariats fournisseurs (chantier 1, §7/§10). Cette estimation exclut les coûts fournisseurs de plateforme (Stripe/SendGrid/Supabase/Vercel) et d'éventuels frais juridiques, non chiffrés à ce jour.

Effort constaté à ce jour : environ 97 commits entre le 19 juin et le 13 juillet 2026 (moins de 4 semaines) pour livrer le cœur fonctionnel V1.

## 12. Audit

| Date | Score | Verdict | Auditeur |
| --- | --- | --- | --- |
| 15 juillet 2026 | 37/100 | RETOUR | Claude (agent auditeur-charte) |
| 15 juillet 2026 (révision) | 68/100 | RETOUR | Claude (agent auditeur-charte) |
| 15 juillet 2026 (révision 2) | 71/100 | ADOPTÉ (sous réserve) | Claude (agent auditeur-charte) |
| 15 juillet 2026 (révision 3) | 83/100 | ADOPTÉ | Claude (agent auditeur-charte) |

Détail du calcul révisé (grille sur 100, `/auditer-charte`) :

| Critère | Points | Justification |
| --- | --- | --- |
| Objectif chiffré et mesurable | 15/20 | Cible et horizon désormais explicites (§2, §4) : 20 campagnes actives dans les 6 mois suivant le lancement. Il manque encore une base de comparaison (aucune donnée historique n'existe, le produit étant nouveau). |
| Portée exclue substantielle (≥3) | 15/15 | 9 exclusions réelles listées en §5.2 (inchangé). |
| Critères de succès mesurables | 13/15 | Trois KPI désormais chiffrés avec seuil et échéance (§4) : campagnes actives, délai d'activation ≤ 14 jours, taux de reconduction ≥ 50 %. Les 4 indicateurs restants demeurent sans seuil formel. |
| Budget OU effort cadré | 10/10 | Effort restant chiffré à ~150-200 heures avant lancement (§11), en plus des ~97 commits déjà livrés. |
| Risques avec impact et contrôle (≥3) | 10/10 | 7 risques en §9, chacun avec impact et mitigation/statut (inchangé). |
| Parties prenantes, commanditaire nommé | 8/10 | Table de gouvernance ajoutée (§6.1) : commanditaire nommé (Frédéric Mondou) + fournisseurs comme partie prenante externe. Gouvernance encore minimale (2 rôles, pas d'avocat/associé/designer nommés). |
| Aucun « À valider » critique restant | 12/20 | Passe de « non commencée » à **mandat daté** : audit juridique planifié fin août 2026 avec un cabinet d'avocats (§8.2, §9, §10). Score partiel, non plein : la revue elle-même n'a pas encore eu lieu et ses conclusions pourraient rouvrir des points (consentement mineurs, gate du tirage/billets). |
| **Total** | **83/100** | |

Pré-mortem (avocat-diable) : présent en substance via le tableau de risques (§9) et les mentions « à valider » disséminées dans le texte (légal, mineurs, tests e2e, fournisseurs, versements manuels) ; aucune trace d'objection disparue sans arbitrage. Pas de pénalité de -10, mais un passage formel par l'agent avocat-diable reste recommandé vu la sensibilité juridique/mineurs.

Manifeste de compétences : **absent** — aucun fichier `manifeste-competences.md` trouvé pour ce projet. Avertissement : à produire avant le décorticage.

**Verdict : ADOPTÉ — 83/100 ≥ 70.** Les lacunes de gestion de projet sont traitées et le point légal a une date ferme (audit fin août 2026). Nuance à conserver : ce verdict valide la *charte comme document de cadrage*, pas la conformité légale elle-même — le lancement commercial et l'activation du tirage/billets restent conditionnels aux conclusions de l'audit juridique de fin août.

## 12. Validation

| Rôle | Nom | Date | Signature / mention |
| --- | --- | --- | --- |
| Commanditaire | Frederic | 2026-07-15 | Approuvé — validé via cockpit |