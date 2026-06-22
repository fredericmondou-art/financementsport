// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../../components/ui/modal';

/**
 * jsdom n'implémente pas showModal()/close() sur <dialog> (voir
 * https://github.com/jsdom/jsdom/issues/3294). On les stub en no-op pour
 * pouvoir tester le rendu et les interactions du composant sans dépendre
 * d'un comportement natif que l'environnement de test ne fournit pas — le
 * vrai comportement (focus trap, fermeture Échap) est délégué au navigateur
 * et vérifié manuellement / en e2e, pas ici.
 */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function mockShowModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function mockClose(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Modal', () => {
  it('affiche le titre fourni', () => {
    render(
      <Modal open title="Confirmer la suppression" onClose={() => {}}>
        Cette action est irréversible.
      </Modal>,
    );
    expect(screen.getByRole('heading', { name: 'Confirmer la suppression' })).toBeInTheDocument();
  });

  it('appelle onClose quand le bouton de fermeture est cliqué', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Titre" onClose={onClose}>
        Contenu
      </Modal>,
    );
    await user.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('appelle showModal() sur le <dialog> quand open passe à vrai', () => {
    render(
      <Modal open title="Titre" onClose={() => {}}>
        Contenu
      </Modal>,
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });
});
