'use client';

import { Button, type ButtonAsButtonProps } from '@/components/ui/button';

/**
 * Bouton "Imprimer / Enregistrer en PDF" (Tâche 1.6.A3 -- « reçus
 * téléchargeables »). Décision autonome (voir docs/DECISIONS.md) : aucune
 * librairie PDF n'est installée dans le projet (greenfield pour cette
 * tâche) -- on s'appuie plutôt sur la fonction d'impression du navigateur
 * (`window.print()`), qui produit déjà un PDF via "Enregistrer en PDF" dans
 * toute boîte de dialogue d'impression moderne, sans dépendance ni route
 * serveur supplémentaire. Seul composant client de cette tâche : `onClick`
 * exige `'use client'` (même pattern déjà utilisé par `components/ui/
 * modal.tsx`/`components/nav/site-header.tsx`).
 *
 * Typé sur `ButtonAsButtonProps` (jamais l'union `ButtonProps`) : ce bouton
 * rend toujours un vrai `<button>`, jamais un lien -- `Omit` appliqué
 * directement à l'union perd la discrimination bouton/lien et fait échouer
 * le typage de `<Button>` (conflit `onToggle` bouton vs ancre).
 */
type PrintButtonProps = Omit<ButtonAsButtonProps, 'onClick' | 'type' | 'href'>;

export function PrintButton(props: PrintButtonProps): JSX.Element {
  return <Button type="button" onClick={() => window.print()} {...props} />;
}
