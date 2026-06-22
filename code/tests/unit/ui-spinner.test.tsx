// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from '../../components/ui/spinner';

describe('Spinner', () => {
  it("annonce un texte de chargement masqué visuellement pour les lecteurs d'écran", () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement en cours');
  });

  it('accepte un libellé personnalisé', () => {
    render(<Spinner label="Envoi du paiement" />);
    expect(screen.getByRole('status')).toHaveTextContent('Envoi du paiement');
  });

  it('applique la classe compacte en taille sm', () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole('status')).toHaveClass('spinner--sm');
  });
});
