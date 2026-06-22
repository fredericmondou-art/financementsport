// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from '../../components/ui/progress-bar';

describe('ProgressBar', () => {
  it('expose le pourcentage via les attributs ARIA', () => {
    render(<ProgressBar percent={62} label="Progression de la campagne" />);
    const bar = screen.getByRole('progressbar', { name: 'Progression de la campagne' });
    expect(bar).toHaveAttribute('aria-valuenow', '62');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('borne les valeurs négatives à 0', () => {
    render(<ProgressBar percent={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('borne les valeurs supérieures à 100', () => {
    render(<ProgressBar percent={140} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
