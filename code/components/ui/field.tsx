/**
 * Champ de formulaire de base (Tâche 1.4.2) : étiquette + contrôle + indice/
 * erreur, avec les attributs ARIA de liaison (aria-describedby, aria-invalid)
 * posés automatiquement sur le contrôle natif.
 *
 * Reste un Server Component pur : `children` est le contrôle natif déjà
 * construit par l'appelant (ex. <input name="qty" defaultValue={1} />),
 * utilisable dans un formulaire natif + Server Action comme le reste du
 * projet (voir components/beneficiary-split.tsx). On ne fait que cloner
 * l'élément pour y injecter id/aria-*, sans ajouter aucun état React.
 */
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

/** Sous-ensemble des props que `Field` a besoin de lire/poser sur le contrôle. */
interface ControlOwnProps {
  id?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactElement<ControlOwnProps>;
}

export function Field({ label, hint, error, required = false, children }: FieldProps): JSX.Element {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control: ReactNode = isValidElement<ControlOwnProps>(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        className: ['field__control', children.props.className ?? ''].filter(Boolean).join(' '),
      })
    : children;

  return (
    <div className={error ? 'field field--invalid' : 'field'}>
      <label htmlFor={id} className="field__label">
        {label}
        {required ? <span className="field__required" aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
