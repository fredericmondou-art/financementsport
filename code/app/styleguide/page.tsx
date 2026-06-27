/**
 * Page interne de référence visuelle (Tâche 1.4.2). Affiche tous les
 * composants de base dans leurs différents états, pour vérifier visuellement
 * que tout passe bien par les tokens de docs/DESIGN.md. Jamais liée depuis
 * la navigation du site ; exclue de l'indexation (voir `metadata` ci-dessous).
 */
import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { ModalDemo } from '@/components/ui/modal-demo';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
  title: 'Guide de style (interne)',
  robots: { index: false, follow: false },
};

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section style={{ marginBottom: 'var(--space-8)' }}>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>{children}</div>
    </section>
  );
}

export default function StyleguidePage(): JSX.Element {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>
      <h1 style={{ marginBottom: 'var(--space-2)' }}>Guide de style</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-8)' }}>
        Référence visuelle interne — non destinée aux visiteurs. Tous les composants ci-dessous
        viennent de <code>components/ui/*</code> et utilisent les tokens de <code>docs/DESIGN.md</code>.
      </p>

      <Section title="Boutons">
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button variant="primary">Primaire</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="outline">Contour</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" size="sm">
            Petit
          </Button>
          <Button variant="primary" loading>
            Chargement
          </Button>
          <Button variant="primary" disabled>
            Désactivé
          </Button>
          <Button href="/styleguide" variant="outline">
            Lien
          </Button>
        </div>
      </Section>

      <Section title="Badges">
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Badge>Neutre</Badge>
          <Badge variant="success">Payé</Badge>
          <Badge variant="warning">En attente</Badge>
          <Badge variant="error">Échoué</Badge>
          <Badge variant="info">Nouveau</Badge>
        </div>
      </Section>

      <Section title="Alertes">
        <Alert variant="info">Les crédits ne sont attribués qu&apos;après confirmation du paiement.</Alert>
        <Alert variant="success" title="Campagne créée">
          La campagne « Saison 2026 » est maintenant active.
        </Alert>
        <Alert variant="warning">Le rabais sur la couleur ambre doit toujours être sur fond clair (voir DESIGN.md).</Alert>
        <Alert variant="error">Le paiement a échoué. Veuillez réessayer.</Alert>
      </Section>

      <Section title="Carte">
        <Card>
          <h3>Pack Saison</h3>
          <p>Génère 18,00 $ de crédit de financement par unité.</p>
        </Card>
      </Section>

      <Section title="Champs de formulaire">
        <Field label="Courriel" hint="Utilisé pour la confirmation de commande">
          <input name="email" type="email" />
        </Field>
        <Field label="Pourcentage" required error="Le total doit être de 100 %">
          <input name="pct" />
        </Field>
      </Section>

      <Section title="Barre de progression">
        <ProgressBar percent={62} label="Progression de la campagne Saison 2026" />
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>1 240 $ amassés sur 2 000 $</p>
      </Section>

      <Section title="État de chargement">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Spinner />
          <span>Chargement…</span>
        </div>
      </Section>

      <Section title="État d'erreur">
        <ErrorState title="Campagne introuvable" retryHref="/" retryLabel="Retourner à l'accueil">
          Cette campagne est peut-être terminée ou le lien est incorrect.
        </ErrorState>
      </Section>

      <Section title="État vide">
        <EmptyState
          title="Aucune campagne pour l'instant"
          actionHref="/campagnes/nouvelle"
          actionLabel="Lancer une campagne"
        >
          Crée ta première campagne pour commencer à recevoir des encouragements.
        </EmptyState>
      </Section>

      <Section title="Modale">
        <ModalDemo />
      </Section>
    </main>
  );
}
