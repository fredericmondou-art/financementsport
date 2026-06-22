# Déploiement — Vercel (Tâche 1.4.6)

> Statut au 2026-06-22 : déploiement initial effectué par l'utilisateur via le
> tableau de bord Vercel (accès CLI/API impossible depuis le bac à sable de
> l'agent — voir `docs/DECISIONS.md`). URL en production (mode **TEST**
> Stripe) : **https://financementsport.vercel.app/**

## 1. Rappel — ce que "en ligne" signifie ici

Le site est accessible publiquement, mais Stripe reste en **mode TEST**.
Aucun paiement réel n'est traité. Une revue de conformité Québec et le passage
de Stripe en mode production seront nécessaires avant d'accepter de vrais
clients (hors périmètre de cette tâche).

## 2. Configuration du projet Vercel

- Dépôt : `https://github.com/fredericmondou-art/financementsport.git`
  (branche `main`, déploiement automatique à chaque push).
- **Root Directory : `code`** — l'application Next.js vit dans le
  sous-dossier `code/` du dépôt, pas à la racine (qui contient `CLAUDE.md`,
  `docs/`, etc.). Ce paramètre doit être réglé dans Vercel → Project Settings
  → General → Root Directory.
- Framework détecté automatiquement : Next.js (App Router).

## 3. Variables d'environnement Vercel

À régler dans Project Settings → Environment Variables (environnement
**Production**, et idéalement aussi **Preview** pour tester les PR) :

| Variable | Valeur (mode TEST) | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase de **production** | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publique du projet Supabase de production | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | clé secrète (`service_role`) du projet Supabase de production | idem — **jamais** la valeur du projet de dev |
| `STRIPE_SECRET_KEY` | `sk_test_...` (même compte Stripe qu'en dev — TEST mode conservé) | Stripe Dashboard → Developers → API keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | idem |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` du endpoint créé à l'étape 4 ci-dessous | Stripe Dashboard → Developers → Webhooks |
| `SENDGRID_API_KEY` | clé API SendGrid (non configurée en dev non plus — lacune pré-existante, hors périmètre) | SendGrid |
| `SENDGRID_FROM_EMAIL` | adresse expéditeur vérifiée SendGrid | SendGrid |
| `NEXT_PUBLIC_APP_URL` | `https://financementsport.vercel.app` | URL Vercel déployée |

**Important** : `SUPABASE_SERVICE_ROLE_KEY` et `STRIPE_SECRET_KEY` ne doivent
jamais être préfixées `NEXT_PUBLIC_` ni apparaître dans un commit. Elles ne
vivent que dans les variables d'environnement Vercel/Supabase, jamais dans le
code (CLAUDE.md section 5).

## 4. Webhook Stripe (mode TEST)

Le webhook ne peut pas être créé par l'agent : la création d'un endpoint
webhook n'est pas exposée par le connecteur Stripe disponible (read-only sur
ce point), et l'API Vercel/Stripe en ligne de commande est bloquée depuis le
bac à sable de l'agent (politique réseau, voir `docs/DECISIONS.md`). À faire
manuellement :

1. Stripe Dashboard, en **mode Test** (bascule en haut à droite) → Developers
   → Webhooks → "Add endpoint".
2. URL de l'endpoint : `https://financementsport.vercel.app/api/webhooks/stripe`
3. Évènements à sélectionner (seuls ceux traités par
   `app/api/webhooks/stripe/route.ts`) :
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
4. Copier le "Signing secret" (`whsec_...`) généré → le coller dans la
   variable Vercel `STRIPE_WEBHOOK_SECRET` → redéployer (étape 6).

## 5. URLs de redirection Supabase Auth

Dans le projet Supabase de **production** : Authentication → URL
Configuration :

- **Site URL** : `https://financementsport.vercel.app`
- **Redirect URLs** : ajouter `https://financementsport.vercel.app/**`
  (en conservant `http://localhost:3000/**` pour le développement local).

Sans cette étape, les liens de confirmation de courriel / réinitialisation de
mot de passe envoyés en production redirigeraient vers `localhost`.

## 6. Redéploiement

Le projet est lié au dépôt GitHub avec déploiement automatique : tout push
sur la branche `main` déclenche un nouveau build et déploiement Vercel sans
action manuelle. Un changement de variable d'environnement nécessite un
redéploiement manuel ("Redeploy" dans l'onglet Deployments) pour prendre
effet, un simple changement de variable ne redéploie pas automatiquement.

## 7. Vérification de bout en bout (mode TEST)

Après configuration complète (variables + webhook + redirect URLs) :

1. Visiter `https://financementsport.vercel.app/`.
2. Choisir un bénéficiaire, ajouter un produit au panier, payer avec une carte
   de test Stripe (`4242 4242 4242 4242`, toute date future, tout CVC).
3. Vérifier dans Stripe Dashboard (mode Test) → Webhooks → l'endpoint, que
   l'évènement `checkout.session.completed` a été livré avec succès (200).
4. Vérifier dans Supabase (table `orders` / `order_credits` du projet de
   production) que la commande et le crédit ont bien été créés pour le bon
   bénéficiaire.

## 8. Limitations connues de cette tâche

- L'agent n'a pas pu créer le projet Vercel, régler ses variables
  d'environnement, ni créer le endpoint webhook Stripe lui-même — ces actions
  ont été effectuées par l'utilisateur via les interfaces web Vercel/Stripe.
  Voir `docs/DECISIONS.md` pour le détail de l'investigation réseau.
- La clé `SUPABASE_SERVICE_ROLE_KEY` de production n'est récupérable que par
  l'utilisateur depuis le tableau de bord Supabase (non exposée par le
  connecteur MCP disponible, qui n'expose que les clés publiques).
