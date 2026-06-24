// @vitest-environment jsdom
/**
 * Test du bouton « Copier » (Tâche 1.6.B3 -- lien public et message aux
 * parents copiables en un clic). `navigator.clipboard` est remplacé par un
 * mock, comme c'est l'usage standard en jsdom (l'implémentation réelle n'est
 * pas disponible hors navigateur).
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from '@/components/copy-button';

// Petite fonction utilitaire : `navigator.clipboard` n'a qu'un getter dans
// cette version de jsdom (`Object.assign` échoue silencieusement, il faut
// redéfinir la propriété). IMPORTANT : `userEvent.setup()` installe lui-même
// sa propre implémentation de `navigator.clipboard` (support copier/coller
// intégré) au moment où il est appelé -- si on définit notre mock AVANT
// `userEvent.setup()`, il est silencieusement écrasé et les assertions sur
// le mock échouent (vu en pratique : le bouton passe bien à "Copié !", mais
// le spy reste à 0 appel). Le mock doit donc toujours être (re)défini APRÈS
// l'appel à `userEvent.setup()`.
function mockClipboard(writeText: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

describe('CopyButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('copie le texte fourni dans le presse-papier au clic', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    mockClipboard(writeText);
    render(<CopyButton textToCopy="https://example.com/u11-hockey">Copier le lien</CopyButton>);
    await user.click(screen.getByRole('button', { name: 'Copier le lien' }));
    expect(writeText).toHaveBeenCalledWith('https://example.com/u11-hockey');
  });

  it('affiche brièvement la confirmation "Copié !" puis revient au libellé initial', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    mockClipboard(writeText);
    render(<CopyButton textToCopy="texte">Copier le message</CopyButton>);

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'Copié !' })).toBeInTheDocument();

    // `setTimeout` revient à `setCopied(false)` hors du `act()` implicite de
    // `userEvent.click` -- il faut l'envelopper explicitement pour que React
    // règle l'état avant l'assertion (sinon le DOM reste figé sur "Copié !").
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copier le message' })).toBeInTheDocument();
  });

  it('ne lève aucune erreur si le presse-papier est indisponible (contexte non sécurisé, permission refusée…)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('refusé'));
    const user = userEvent.setup();
    mockClipboard(writeText);
    render(<CopyButton textToCopy="texte">Copier</CopyButton>);
    await expect(user.click(screen.getByRole('button', { name: 'Copier' }))).resolves.not.toThrow();
  });
});
