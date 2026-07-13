/**
 * Bouton de base du système de design (Tâche 1.4.2, voir docs/DESIGN.md).
 * Server Component pur : aucune logique métier, juste de la composition de
 * classes CSS définies dans app/globals.css. Rend soit un <button>, soit un
 * <a> (si `href` est fourni) avec exactement le même habillage visuel.
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export type ButtonAsButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    href?: undefined;
  };

export type ButtonAsAnchorProps = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    href: string;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsAnchorProps;

function buttonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  className?: string,
): string {
  return [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    fullWidth ? 'btn--full-width' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button(props: ButtonProps): JSX.Element {
  const { variant = 'primary', size = 'md', loading = false, fullWidth = false } = props;
  const classes = buttonClassName(variant, size, fullWidth, props.className);

  if (props.href !== undefined) {
    const { href, children, variant: _v, size: _s, loading: _l, fullWidth: _fw, className: _c, ...rest } = props;
    return (
      <a href={href} className={classes} aria-disabled={loading || undefined} {...rest}>
        {loading ? <Spinner size="sm" inline /> : null}
        {children}
      </a>
    );
  }

  const { children, variant: _v, size: _s, loading: _l, fullWidth: _fw, className: _c, disabled, ...rest } = props;
  return (
    <button
      type={rest.type ?? 'button'}
      className={classes}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" inline /> : null}
      {children}
    </button>
  );
}
