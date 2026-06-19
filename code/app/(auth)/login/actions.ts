'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

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
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const message = 'Courriel ou mot de passe incorrect.';
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  redirect('/compte');
}

export async function logoutAction(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
