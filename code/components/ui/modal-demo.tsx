'use client';

/**
 * Petit wrapper client UNIQUEMENT pour faire la démonstration de <Modal>
 * sur la page /styleguide (Tâche 1.4.2). Ce composant n'est utilisé que là ;
 * partout ailleurs, c'est l'appelant métier qui doit détenir l'état
 * ouvert/fermé, pas un composant générique comme celui-ci.
 */
import { useState } from 'react';
import { Button } from './button';
import { Modal } from './modal';

export function ModalDemo(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Ouvrir la modale</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Confirmer l'action">
        <p>Exemple de contenu de modale. Touche Échap ou clic à l&apos;extérieur pour fermer.</p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant="danger" onClick={() => setOpen(false)}>
            Confirmer
          </Button>
        </div>
      </Modal>
    </>
  );
}
