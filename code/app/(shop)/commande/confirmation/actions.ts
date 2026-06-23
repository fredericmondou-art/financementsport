'use server';

/**
 * Création de compte encouragée après un achat invité (Tâche 1.6.A2,
 * docs/prompts/phase-1-6.md). Une seule Server Action : mot de passe
 * uniquement -- jamais de courriel saisi dans le formulaire (voir le
 * commentaire de sécurité ci-dessous et `app/(shop)/commande/confirmation/
 * page.tsx`).
 *
 * Décision autonome (voir docs/DECISIONS.md, Tâche 1.6.A2) : le courriel
 * utilisé pour créer le compte et rattacher la commande N'EST JAMAIS lu
 * depuis un champ de formulaire (même caché) -- un champ caché reste une
 * valeur soumise par le navigateur, donc falsifiable par quiconque
 * inspecte/modifie la requête. Il est relu côté serveur directement depuis
 * Stripe via `session_id` (`stripe.checkout.sessions.retrieve`), qui agit
 * comme un jeton porteur non-devinable (même modèle de confiance que le
 * `success_url` de `lib/checkout/create-checkout-session.ts`, déjà la seule
 * preuve d'achat utilisée par cette page). Ainsi, créer un compte avec le
 * courriel d'un tiers exigerait de connaître son `session_id` Stripe -- pas
 * juste son adresse courriel, publique par nature.
 *
 * Ce périmètre restreint (rattachement déclenché UNIQUEMENT depuis ce
 * parcours post-achat, jamais depuis le formulaire d'inscription général
 * `app/(auth)/signup`) est délibéré : généraliser le rattachement par
 * courriel au formulaire d'inscription public permettrait à quiconque
 * connaissant le courriel d'un tiers (information non secrète) de créer un
 * compte sous ce courriel et de s'en voir réassigner les commandes -- un
 * vrai risque de sécurité (CLAUDE.md section 5) que le `session_id` Stripe,
 * lui, empêche structurellement.
 */
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseServiceClient } from '@/lib/db/client';
import { getStripeClient } from '@/lib/payments/stripe-client';
import { attachGuestOrdersToUser, createSupabaseAttachGuestOrdersRepo } from '@/lib/orders/attach-guest-orders';
import { logger } from '@/lib/logger/logger';

const createAccountSchema = z.object({
  sessionId: z.string().trim().min(1, 'Session de paiement manquante.'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
});

function redirectWithError(sessionId: string, message: string): never {
  const params = new URLSearchParams({ session_id: sessionId, compteErreur: message });
  redirect(`/commande/confirmation?${params.toString()}`);
}

export async function createAccountFromOrderAction(formData: FormData): Promise<void> {
  const rawSessionId = String(formData.get('sessionId') ?? '');
  const parsed = createAccountSchema.safeParse({
    sessionId: formData.get('sessionId'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Formulaire invalide.';
    redirectWithError(rawSessionId, message);
  }

  const stripe = getStripeClient();
  let email: string | null = null;
  try {
    const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
    if (session.payment_status === 'paid') {
      email = session.customer_details?.email ?? null;
    }
  } catch (error) {
    logger.warn('Lecture de session Stripe échouée pour la création de compte post-achat', {
      sessionId: parsed.data.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!email) {
    redirectWithError(
      parsed.data.sessionId,
      'Impossible de retrouver votre achat pour créer le compte. Réessayez depuis le lien reçu après le paiement.',
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    redirectWithError(parsed.data.sessionId, "Impossible de créer le compte. L'adresse est peut-être déjà utilisée.");
  }

  // Rattache automatiquement la/les commande(s) invité(es) déjà payées avec
  // ce courriel (Tâche 1.6.A2). Échec silencieux côté UX -- comme
  // `attachGuestCartToUser` dans `app/(auth)/login/actions.ts` -- car le
  // rattachement est un bonus qui ne doit jamais faire échouer une création
  // de compte par ailleurs réussie.
  try {
    const serviceClient = createSupabaseServiceClient();
    await attachGuestOrdersToUser(email, data.user.id, createSupabaseAttachGuestOrdersRepo(serviceClient));
  } catch (attachError) {
    logger.warn('Rattachement des commandes invité échoué après création de compte', {
      userId: data.user.id,
      error: attachError instanceof Error ? attachError.message : String(attachError),
    });
  }

  redirect('/login?inscription=ok');
}
