/**
 * Barre de progression (Tâche 1.4.2) — ex. progression d'une campagne de
 * financement. Le pourcentage est calculé par l'appelant (logique métier
 * dans lib/, pas ici) ; ce composant se contente de l'afficher et de borner
 * la valeur entre 0 et 100 pour éviter un débordement visuel.
 */
export interface ProgressBarProps {
  /** Pourcentage déjà calculé par l'appelant, entre 0 et 100. */
  percent: number;
  label?: string;
}

export function ProgressBar({ percent, label }: ProgressBarProps): JSX.Element {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress__bar" style={{ width: `${clamped}%` }} />
    </div>
  );
}
