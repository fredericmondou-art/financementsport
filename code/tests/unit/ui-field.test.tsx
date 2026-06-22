// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '../../components/ui/field';

describe('Field', () => {
  it('lie l\'étiquette au contrôle natif', () => {
    render(
      <Field label="Courriel">
        <input name="email" type="email" />
      </Field>,
    );
    const input = screen.getByLabelText('Courriel');
    expect(input).toHaveAttribute('name', 'email');
  });

  it("affiche l'indice et le lie via aria-describedby", () => {
    render(
      <Field label="Quantité" hint="Entre 1 et 10">
        <input name="qty" />
      </Field>,
    );
    const input = screen.getByLabelText('Quantité');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(screen.getByText('Entre 1 et 10').id).toBe(describedBy);
  });

  it('marque le contrôle invalide et affiche le message d\'erreur', () => {
    render(
      <Field label="Pourcentage" error="Le total doit être 100 %">
        <input name="pct" />
      </Field>,
    );
    const input = screen.getByLabelText('Pourcentage');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Le total doit être 100 %');
  });

  it('affiche un astérisque quand le champ est requis', () => {
    render(
      <Field label="Nom" required>
        <input name="name" />
      </Field>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});
