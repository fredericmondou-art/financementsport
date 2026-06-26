/**
 * Page Contact (Tâche 1.4b.5). Formulaire fonctionnel (Server Action, voir
 * ./actions.ts) qui envoie un courriel réel à l'équipe via SendGrid -- pas
 * une simple maquette. Aucune adresse postale/téléphone inventée : tant que
 * l'équipe n'en a pas fourni, seul le formulaire est proposé (voir
 * docs/DECISIONS.md, règle "ne jamais inventer de coordonnées").
 */
import type { Metadata } from 'next';
import { sendContactFormAction } from './actions';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Contact',
  description: "Une question ? Écris-nous via ce formulaire.",
};

export default function ContactPage({
  searchParams,
}: {
  searchParams: { erreur?: string; envoye?: string };
}): JSX.Element {
  return (
    <main className="page">
      <div className="page-header">
        <h1>Contact</h1>
        <p>Une question sur un achat, une campagne, ou la plateforme ? Écris-nous.</p>
      </div>

      {searchParams.envoye === '1' ? (
        <Alert variant="success">
          Message envoyé. Nous te répondrons par courriel dans les meilleurs délais.
        </Alert>
      ) : null}

      <Card>
        <form action={sendContactFormAction} className="form">
          <Field label="Nom" required>
            <input name="name" type="text" required maxLength={200} autoComplete="name" />
          </Field>
          <Field label="Courriel" required>
            <input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Sujet" required>
            <input name="subject" type="text" required maxLength={200} />
          </Field>
          <Field label="Message" required>
            <textarea name="message" required maxLength={5000} rows={6} />
          </Field>

          {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}

          <Button type="submit">Envoyer</Button>
        </form>
      </Card>
    </main>
  );
}
