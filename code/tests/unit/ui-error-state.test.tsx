// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorState } from '../../components/ui/error-state';

describe('ErrorState', () => {
  it('annonce le titre via le rôle alert', () => {
    render(<ErrorState title="Campagne introuvable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Campagne introuvable');
  });

  it('affiche un bouton de nouvelle tentative quand retryHref est fourni', () => {
    render(<ErrorState title="Erreur de chargement" retryHref="/boutique" retryLabel="Retourner à la boutique" />);
    expect(screen.getByRole('link', { name: 'Retourner à la boutique' })).toHaveAttribute('href', '/boutique');
  });

  it("n'affiche aucun lien quand retryHref est absent", () => {
    render(<ErrorState title="Erreur de chargement" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
