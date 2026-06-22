// @vitest-environment jsdom
/**
 * Tâche 1.4.5 : limite d'erreur globale (`app/error.tsx`). Une vraie page 500
 * n'est pas déclenchable de façon fiable en e2e sans route dédiée à casser
 * intentionnellement (aucune n'existe en V1, voir CLAUDE.md section 10 — ne
 * pas anticiper de surface de test supplémentaire). Ce composant est donc
 * vérifié au niveau unitaire : rendu du message en français, et le bouton
 * « Réessayer » appelle bien la fonction `reset` fournie par Next.js plutôt
 * que de recharger la page.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GlobalError from '../../app/error';

describe('GlobalError (app/error.tsx)', () => {
  it('affiche un message en français sans exposer le détail de l’erreur', () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom interne')} reset={reset} />);

    expect(screen.getByRole('heading', { name: 'Une erreur est survenue' })).toBeVisible();
    expect(screen.queryByText('boom interne')).not.toBeInTheDocument();
  });

  it('le bouton "Réessayer" appelle reset()', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom interne')} reset={reset} />);

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('propose aussi un retour à l’accueil', () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom interne')} reset={reset} />);

    expect(screen.getByRole('link', { name: /Retour à l.accueil/ })).toHaveAttribute('href', '/');
  });
});
