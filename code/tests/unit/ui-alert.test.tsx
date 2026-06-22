// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from '../../components/ui/alert';

describe('Alert', () => {
  it('rend un rôle status pour les variantes non bloquantes', () => {
    render(<Alert variant="info">Les crédits sont attribués seulement après confirmation du paiement.</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('confirmation du paiement');
  });

  it("rend un rôle alert pour la variante d'erreur (annonce immédiate aux lecteurs d'écran)", () => {
    render(<Alert variant="error">Le paiement a échoué.</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Le paiement a échoué.');
  });

  it('affiche un titre optionnel', () => {
    render(
      <Alert variant="warning" title="Stock limité">
        Il ne reste que 2 unités.
      </Alert>,
    );
    expect(screen.getByText('Stock limité')).toBeInTheDocument();
  });
});
