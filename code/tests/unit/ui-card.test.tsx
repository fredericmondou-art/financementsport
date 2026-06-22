// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '../../components/ui/card';

describe('Card', () => {
  it('applique un padding par défaut', () => {
    render(
      <Card>
        <p>Contenu</p>
      </Card>,
    );
    expect(screen.getByText('Contenu').parentElement).toHaveClass('card--padded');
  });

  it('permet de désactiver le padding', () => {
    render(
      <Card padded={false}>
        <p>Contenu</p>
      </Card>,
    );
    expect(screen.getByText('Contenu').parentElement).not.toHaveClass('card--padded');
  });
});
