// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../components/ui/button';

describe('Button', () => {
  it('rend un <button> par défaut avec la variante primaire', () => {
    render(<Button>Confirmer</Button>);
    const button = screen.getByRole('button', { name: 'Confirmer' });
    expect(button).toHaveClass('btn--primary');
    expect(button).toHaveClass('btn--md');
  });

  it('rend un <a> quand href est fourni, en conservant la même classe visuelle', () => {
    render(
      <Button href="/boutique" variant="outline">
        Voir la boutique
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Voir la boutique' });
    expect(link).toHaveAttribute('href', '/boutique');
    expect(link).toHaveClass('btn--outline');
  });

  it('désactive le bouton et affiche un indicateur de chargement quand loading est vrai', () => {
    render(<Button loading>Envoi…</Button>);
    // `aria-busy` + `disabled` sur le <button> sont la source unique de
    // vérité pour les lecteurs d'écran. Le Spinner imbriqué passe `inline`
    // (voir components/ui/spinner.tsx) pour ne pas polluer le nom
    // accessible du bouton avec son propre texte masqué ("Chargement en
    // cours" + "Envoi…" concaténés) ni déclencher une double annonce.
    const button = screen.getByRole('button', { name: 'Envoi…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it("n'appelle pas onClick quand le bouton est désactivé", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Action
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Action' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('appelle onClick quand le bouton est actif', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Action</Button>);
    await user.click(screen.getByRole('button', { name: 'Action' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applique la classe pleine largeur', () => {
    render(<Button fullWidth>Continuer</Button>);
    expect(screen.getByRole('button', { name: 'Continuer' })).toHaveClass('btn--full-width');
  });
});
