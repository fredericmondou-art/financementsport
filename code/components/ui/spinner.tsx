/**
 * Indicateur de chargement (Tâche 1.4.2). Purement visuel, sans logique
 * métier. `role="status"` + texte masqué pour les lecteurs d'écran.
 */
export interface SpinnerProps {
  size?: 'sm' | 'md';
  label?: string;
  /**
   * À utiliser quand le spinner est imbriqué dans un contrôle qui annonce
   * déjà son état de chargement autrement (ex. `aria-busy` + `disabled` sur
   * un <button>, voir components/ui/button.tsx). Sans ce drapeau, le texte
   * masqué du spinner se retrouve concaténé au nom accessible du bouton
   * parent (double annonce + nom accessible incorrect pour les lecteurs
   * d'écran). En usage autonome (page de chargement, transition), laisser
   * la valeur par défaut pour conserver `role="status"` + son libellé.
   */
  inline?: boolean;
}

export function Spinner({ size = 'md', label = 'Chargement en cours', inline = false }: SpinnerProps): JSX.Element {
  return (
    <span
      role={inline ? undefined : 'status'}
      aria-hidden={inline || undefined}
      className={size === 'sm' ? 'spinner spinner--sm' : 'spinner'}
    >
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
