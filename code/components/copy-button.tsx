'use client';

import { useState } from 'react';
import { Button, type ButtonAsButtonProps } from '@/components/ui/button';

/**
 * Bouton "Copier" (Tâche 1.6.B3 -- lien public et message aux parents
 * "copiable en un clic, rien à rédiger"). Même pattern que
 * `components/print-button.tsx` : `navigator.clipboard` exige
 * `'use client'`, aucune librairie ajoutée.
 *
 * Typé sur `ButtonAsButtonProps` (jamais l'union `ButtonProps`), pour la
 * même raison que `PrintButtonProps` -- un `Omit` sur l'union perd la
 * discrimination bouton/lien.
 */
type CopyButtonProps = Omit<ButtonAsButtonProps, 'onClick' | 'type' | 'href'> & {
  /** Texte copié dans le presse-papier au clic. */
  textToCopy: string;
  /** Libellé affiché brièvement après une copie réussie, à la place de
   * `children` -- toujours en français (CLAUDE.md section 2). */
  copiedLabel?: string;
};

export function CopyButton({
  textToCopy,
  copiedLabel = 'Copié !',
  children,
  ...props
}: CopyButtonProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function handleClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé, permission
      // refusée...) : pas d'erreur bruyante -- le texte affiché à côté du
      // bouton reste sélectionnable manuellement (voir docs/DECISIONS.md).
    }
  }

  return (
    <Button type="button" onClick={handleClick} {...props}>
      {copied ? copiedLabel : children}
    </Button>
  );
}
