/**
 * Conteneur visuel de base (Tâche 1.4.2). Purement structurel — aucune
 * logique métier, aucune donnée propre.
 */
import type { ReactNode } from 'react';

export interface CardProps {
  padded?: boolean;
  children: ReactNode;
  className?: string;
}

export function Card({ padded = true, children, className }: CardProps): JSX.Element {
  const classes = ['card', padded ? 'card--padded' : '', className ?? ''].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}
