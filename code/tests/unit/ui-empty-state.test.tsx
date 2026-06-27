// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../../components/ui/empty-state';

describe('EmptyState', () => {
  it('affiche le titre et le texte', () => {
    render(<EmptyState title="Rien à voir ici">Un peu de contexte.</EmptyState>);
    expect(screen.getByText('Rien à voir ici')).toHaveClass('empty-state__title');
    expect(screen.getByText('Un peu de contexte.')).toHaveClass('empty-state__text');
  });

  it("affiche un bouton d'action quand actionHref et actionLabel sont fournis", () => {
    render(<EmptyState title="Aucune campagne" actionHref="/boutique" actionLabel="Découvrir la boutique" />);
    const action = screen.getByRole('link', { name: 'Découvrir la boutique' });
    expect(action).toHaveAttribute('href', '/boutique');
  });

  it("n'affiche aucun bouton si actionLabel est absent", () => {
    render(<EmptyState title="Historique vide" actionHref="/boutique" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it("n'affiche aucun bouton si actionHref est absent", () => {
    render(<EmptyState title="Historique vide" actionLabel="Voir" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
