'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { attachGuestCartToUser } from '@/lib/cart/attach-guest-cart';
import { createCartDataClient, createSupabaseCartRepo } from '@/lib/cart/cart';
import { getExistingGuestSessionToken } from '@/lib/cart/identity';
import { createSupabaseCartItemsRepo } from '@/lib/cart/items';

const loginSchema = z.object({
  email: z.string().trim().email("L'adresse courriel n'est pas valide."),
  password: z.string().min(1, 'Le mot de passe est requis.'),
});

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Formulaire invalide.';
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const message = 'Courriel ou mot de passe incorrect.';
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  // Tâche 1.4 : rattache un éventuel panier invité (cookie de session posé
  // avant la connexion) au compte qui vient de se connecter. Échec
  // silencieux côté UX (ne doit jamais bloquer une connexion réussie) ; les
  // erreurs Supabase réelles (pas "aucun panier invité", qui est un retour
  // normal `null`) sont laissées remonter aux logs serveur Next.js.
  const guestSessionToken = getExistingGuestSessionToken();
  if (guestSessionToken && data.user) {
    const cartClient = createCartDataClient();
    await attachGuestCartToUser(guestSessionToken, data.user.id, {
      carts: createSupabaseCartRepo(cartClient),
      items: createSupabaseCartItemsRepo(cartClient),
    });
  }

  redirect('/compte');
}

export async function logoutAction(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
