/**
 * État d'erreur générique (Tâche 1.4.2) — ex. campagne introuvable, paiement
 * échoué, erreur de chargement. Le message exact reste décidé par l'appelant
 * (cas limites définis dans le cahier des charges, pas ici).
 */
import type { ReactNode } from 'react';
import { Button } from './button';

export interface ErrorStateProps {
  title: string;
  children?: ReactNode;
  retryHref?: string;
  retryLabel?: string;
}

export function ErrorState({ title, children, retryHref, retryLabel = 'Réessayer' }: ErrorStateProps): JSX.Element {
  return (
    <div className="error-state" role="alert">
      <span aria-hidden="true" className="error-state__icon">
        ⚠️
      </span>
      <p className="error-state__title">{title}</p>
      {children ? <p>{children}</p> : null}
      {retryHref ? (
        <Button href={retryHref} variant="outline" size="sm">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
