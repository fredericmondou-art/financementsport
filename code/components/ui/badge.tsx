/**
 * Badge de statut (Tâche 1.4.2). Purement visuel — la décision de quelle
 * variante utiliser (ex. statut de commande, statut de campagne) revient à
 * l'appelant, jamais à ce composant.
 */
import type { ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps): JSX.Element {
  const classes = ['badge', variant !== 'neutral' ? `badge--${variant}` : ''].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}
