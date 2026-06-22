/**
 * Limite de chargement globale (Tâche 1.4.3, convention `loading.tsx` du App
 * Router). S'affiche dans la zone de contenu pendant qu'un segment de page
 * se charge, SANS remonter `SiteHeader`/`SiteFooter` (rendus par
 * `app/layout.tsx` en dehors de `{children}`) — donc jamais d'écran blanc ni
 * de saut de mise en page entre deux pages.
 */
import { Spinner } from '@/components/ui/spinner';

export default function Loading(): JSX.Element {
  return (
    <div className="page-loading">
      <Spinner size="md" label="Chargement de la page" />
    </div>
  );
}
