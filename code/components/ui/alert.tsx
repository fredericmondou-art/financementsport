/**
 * Message d'alerte contextuel (Tâche 1.4.2). Purement visuel — par exemple
 * pour rappeler que les crédits ne sont attribués qu'après paiement confirmé
 * (voir maquette panier), ou pour afficher une erreur de formulaire globale.
 */
import type { ReactNode } from 'react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
}

const ICONS: Record<AlertVariant, string> = {
  info: 'ℹ️',
  success: '✓',
  warning: '⚠️',
  error: '⛔',
};

export function Alert({ variant = 'info', title, children }: AlertProps): JSX.Element {
  return (
    <div className={`alert alert--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      <span className="alert__icon" aria-hidden="true">
        {ICONS[variant]}
      </span>
      <div>
        {title ? <p className="alert__title">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
