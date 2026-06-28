import type { Metadata } from 'next';
import { loginAction } from './actions';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Se connecter',
  description: "Connecte-toi pour suivre tes commandes, tes reçus et l'impact de tes achats.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; inscription?: string };
}): JSX.Element {
  return (
    <main className="page">
      <div className="page-header">
        <h1>Se connecter</h1>
        <p>Retrouve tes commandes, tes reçus et l&rsquo;impact de tes achats.</p>
      </div>
      {searchParams.inscription === 'ok' ? (
        <Alert variant="success">Compte créé. Tu peux te connecter.</Alert>
      ) : null}
      <Card>
        <form action={loginAction} className="form">
          <Field label="Courriel">
            <input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Mot de passe">
            <input name="password" type="password" required autoComplete="current-password" />
          </Field>

          {searchParams.error ? <Alert variant="error">{searchParams.error}</Alert> : null}

          <Button type="submit">Se connecter</Button>
        </form>
      </Card>
    </main>
  );
}
