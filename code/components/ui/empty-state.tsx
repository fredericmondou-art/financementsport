/**
 * État vide générique (Tâche 1.4b.6, docs/prompts/phase-1-4b.md) : remplace
 * les constats froids (« Aucun(e) ... ») par une invitation à l'action.
 * Même structure que `ErrorState` (icône + titre + texte + bouton optionnel),
 * volontairement -- un seul patron visuel pour les deux états plutôt que
 * d'inventer un nouveau style (CLAUDE.md section 6 : réutiliser le système
 * de design existant).
 *
 * `actionHref` est optionnel : certains états vides restent purement
 * informatifs (ex. un historique vide, une métrique à zéro) -- pas d'action
 * pertinente à proposer dans ces cas, voir docs/DECISIONS.md (Tâche 1.4b.6).
 */
import type { ReactNode } from 'react';
import { Button } from './button';

export interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  icon?: string;
}

export function EmptyState({ title, children, actionHref, actionLabel, icon = '✨' }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-state__icon">
        {icon}
      </span>
      <p className="empty-state__title">{title}</p>
      {children ? <p className="empty-state__text">{children}</p> : null}
      {actionHref && actionLabel ? (
        <Button href={actionHref} variant="outline" size="sm">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
