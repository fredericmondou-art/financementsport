'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

const signupSchema = z.object({
  email: z.string().trim().email("L'adresse courriel n'est pas valide."),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  fullName: z.string().trim().min(1, 'Le nom complet est requis.'),
});

export async function signupAction(formData: FormData): Promise<void> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Formulaire invalide.';
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    const message = "Impossible de créer le compte. L'adresse est peut-être déjà utilisée.";
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  redirect('/login?inscription=ok');
}
