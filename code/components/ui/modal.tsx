'use client';

/**
 * Modale (Tâche 1.4.2).
 *
 * EXCEPTION DÉLIBÉRÉE ET LOCALISÉE à la règle « pas de composant client »
 * suivie ailleurs dans ce projet (voir components/beneficiary-split.tsx) :
 * une modale a besoin d'un état d'ouverture/fermeture, de la gestion de la
 * touche Échap et du focus trap, ce qu'un Server Component ne peut pas
 * fournir. On utilise l'élément natif <dialog> (showModal/close) pour que le
 * focus trap, le rôle ARIA et la fermeture au clavier soient gérés par le
 * navigateur plutôt que réimplémentés en JS. Voir docs/DECISIONS.md.
 *
 * Aucune logique métier ici : `open`/`onClose` sont entièrement contrôlés
 * par l'appelant.
 */
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const handleNativeClose = (): void => {
      onClose();
    };
    dialog.addEventListener('close', handleNativeClose);
    return () => dialog.removeEventListener('close', handleNativeClose);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" aria-labelledby={titleId} onClick={handleBackdropClick}>
      <div className="modal__body">
        <div className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fermer la fenêtre">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
