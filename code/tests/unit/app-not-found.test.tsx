// @vitest-environment jsdom
/**
 * Tâche 1.4.5 : page 404 globale (`app/not-found.tsx`). Couverte aussi en
 * e2e (tests/e2e/error-pages.spec.ts, via une route inexistante) ; ce test
 * unitaire vérifie le contenu en français et le lien de retour sans dépendre
 * d'un serveur Next.js démarré.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NotFound from '../../app/not-found';

describe('NotFound (app/not-found.tsx)', () => {
  it('affiche un titre en français et un lien de retour à l’accueil', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Retour à l.accueil/ })).toHaveAttribute('href', '/');
  });
});
