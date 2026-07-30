'use client';

/**
 * Champ quantité du panier avec enregistrement AUTOMATIQUE (2026-07-29) :
 * plus besoin d'appuyer sur « Mettre à jour ». À chaque modification, on
 * soumet le formulaire parent (même Server Action `updateQuantityAction`,
 * même contrat FormData) après un court anti-rebond (500 ms) pour éviter une
 * requête à chaque frappe ; on soumet aussi immédiatement à la sortie du
 * champ (blur). Amélioration progressive : sans JavaScript, le bouton de
 * repli `<noscript>` rendu par la page reste utilisable.
 *
 * Ne duplique aucune logique métier : la validation de la quantité et la mise
 * à jour du panier restent entièrement côté serveur (updateQuantityAction).
 */
import { useRef } from 'react';

interface CartQuantityInputProps {
  defaultValue: number;
  min?: number;
}

export function CartQuantityInput({ defaultValue, min = 1 }: CartQuantityInputProps): JSX.Element {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer(): void {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return (
    <input
      type="number"
      name="quantity"
      aria-label="Quantité"
      defaultValue={defaultValue}
      min={min}
      onChange={(event) => {
        const form = event.currentTarget.form;
        clearTimer();
        timer.current = setTimeout(() => {
          form?.requestSubmit();
        }, 500);
      }}
      onBlur={(event) => {
        clearTimer();
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
