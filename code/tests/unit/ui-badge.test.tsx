// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../../components/ui/badge';

describe('Badge', () => {
  it('rend la variante neutre par défaut sans classe de couleur supplémentaire', () => {
    render(<Badge>Brouillon</Badge>);
    const badge = screen.getByText('Brouillon');
    expect(badge).toHaveClass('badge');
    expect(badge.className).not.toContain('badge--');
  });

  it.each([
    ['success', 'Payé'],
    ['warning', 'En attente'],
    ['error', 'Échoué'],
    ['info', 'Nouveau'],
  ] as const)('rend la variante %s avec la classe associée', (variant, label) => {
    render(<Badge variant={variant}>{label}</Badge>);
    expect(screen.getByText(label)).toHaveClass(`badge--${variant}`);
  });
});
