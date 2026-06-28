import type { Metadata } from 'next';
import { signupAction } from './actions';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description: "Crée un compte pour suivre l'impact de tes achats -- jamais obligatoire pour acheter.",
};

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}): JSX.Element {
  return (
    <main className="page">
      <div className="page-header">
        <h1>Créer un compte</h1>
        <p>
          Créer un compte n&apos;est jamais obligatoire pour acheter — tu peux toujours passer
          commande sans compte.
        </p>
      </div>
      <Card>
        <form action={signupAction} className="form">
          <Field label="Nom complet">
            <input name="fullName" type="text" required autoComplete="name" />
          </Field>

          <Field label="Courriel">
            <input name="email" type="email" required autoComplete="email" />
          </Field>

          <Field label="Mot de passe" hint="8 caractères minimum.">
            <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </Field>

          {searchParams.error ? <Alert variant="error">{searchParams.error}</Alert> : null}

          <Button type="submit">Créer mon compte</Button>
        </form>
      </Card>
    </main>
  );
}
