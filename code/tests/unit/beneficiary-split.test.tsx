// @vitest-environment jsdom
/**
 * Tests du Client Component `BeneficiarySplit` (Tâche 1.6.A4, voir
 * docs/prompts/phase-1-6.md) : égalisation automatique à l'ajout/au retrait
 * d'un bénéficiaire, ajustement manuel qui force le total à rester à 100 %,
 * et impact par bénéficiaire affiché en direct.
 *
 * `app/(shop)/panier/actions.ts` (la vraie Server Action soumise par ce
 * formulaire) importe `next/navigation`/`next/cache`/Supabase -- des modules
 * serveur qui n'ont pas de sens dans cet environnement jsdom. On le mocke
 * donc ici : ce fichier teste uniquement le comportement CLIENT (état local,
 * arithmétique de répartition, affichage), jamais la soumission réelle --
 * déjà couverte par `tests/integration/cart.test.ts` et
 * `tests/unit/cart-beneficiaries.test.ts`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BeneficiarySplit from '@/components/beneficiary-split';
import { formatCents } from '@/lib/format-cents';

vi.mock('@/app/(shop)/panier/actions', () => ({
  setBeneficiarySplitAction: vi.fn(),
}));

const ALICE_ID = '11111111-1111-1111-1111-111111111111';
const BOB_ID = '22222222-2222-2222-2222-222222222222';

/**
 * `Intl.NumberFormat('fr-CA', ...)` insère un espace insécable (U+00A0)
 * avant le symbole monétaire. Le normaliseur PAR DÉFAUT de `@testing-library/
 * dom` (utilisé par `getByText`) collapse déjà tout `\s` du texte du DOM en
 * espace simple avant de comparer -- mais il ne touche PAS la chaîne qu'on
 * lui passe en argument. Sans ceci, `screen.getByText(formatCents(...))`
 * échoue systématiquement (texte du DOM normalisé vs chaîne de recherche
 * brute, non normalisée). Même remède que `tests/unit/format-cents.test.ts`
 * (`normalizeSpaces`), appliqué ici au texte de recherche plutôt qu'au texte
 * comparé.
 */
function moneyText(amountCents: number): string {
  return formatCents(amountCents).replace(/\s/gu, ' ');
}

describe('BeneficiarySplit', () => {
  it('affiche "100%" pour un seul bénéficiaire (pas de champ d\'ajustement)', () => {
    render(
      <BeneficiarySplit
        cartId="c1"
        rows={[{ beneficiaryType: 'athlete', beneficiaryId: ALICE_ID, label: 'Alice', shareBps: 10000 }]}
        totalCreditCents={1000}
      />,
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText(moneyText(1000))).toBeInTheDocument();
  });

  it('ajouter un 2e bénéficiaire bascule automatiquement en 50/50', async () => {
    const user = userEvent.setup();
    render(
      <BeneficiarySplit
        cartId="c1"
        rows={[{ beneficiaryType: 'athlete', beneficiaryId: ALICE_ID, label: 'Alice', shareBps: 10000 }]}
        totalCreditCents={1000}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ajouter un bénéficiaire' }));

    expect(screen.getByLabelText('Part (%) pour Alice')).toHaveValue(50);
    expect(screen.getByLabelText('Part (%) pour Nouveau bénéficiaire')).toHaveValue(50);
    expect(screen.getAllByText(moneyText(500))).toHaveLength(2);
  });

  /**
   * `equalSplitBps(3)` répartit en bps avec le reliquat au premier :
   * [3334, 3333, 3333] (somme exacte = 10000, voir tests/unit/cart-
   * beneficiaries.test.ts). Affiché en pourcentage entier
   * (`Math.round(bps / 100)`), 3334 bps = 33,34 % arrondit à 33 % -- le
   * reliquat d'1 bps est trop petit pour faire basculer l'arrondi au point
   * de pourcentage supérieur. Les TROIS lignes affichent donc 33 % (somme
   * visuelle 99 %, jamais 100 %, pour un partage en tiers), alors que la
   * vraie valeur soumise au serveur (`shareBps`, vérifiée ci-dessous) reste
   * exacte à 10000 bps. C'est un arrondi d'AFFICHAGE uniquement : aucune
   * incidence sur l'argent réellement attribué (voir `formatCents` plus bas
   * et le test « impact... en direct »).
   */
  it('ajouter un 3e bénéficiaire répartit en bps exacts 3334/3333/3333 (affiché 33/33/33 %)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BeneficiarySplit
        cartId="c1"
        rows={[
          { beneficiaryType: 'athlete', beneficiaryId: ALICE_ID, label: 'Alice', shareBps: 5000 },
          { beneficiaryType: 'athlete', beneficiaryId: BOB_ID, label: 'Bob', shareBps: 5000 },
        ]}
        totalCreditCents={0}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ajouter un bénéficiaire' }));

    expect(screen.getByLabelText('Part (%) pour Alice')).toHaveValue(33);
    expect(screen.getByLabelText('Part (%) pour Bob')).toHaveValue(33);
    expect(screen.getByLabelText('Part (%) pour Nouveau bénéficiaire')).toHaveValue(33);

    const shareInputs = Array.from(container.querySelectorAll('input[name="shareBps"]')).map(
      (el) => (el as HTMLInputElement).value,
    );
    expect(shareInputs).toEqual(['3334', '3333', '3333']);
    expect(shareInputs.reduce((sum, value) => sum + Number(value), 0)).toBe(10000);
  });

  it('ajuster une part redistribue le reliquat aux autres et garde le total à 100 %', () => {
    render(
      <BeneficiarySplit
        cartId="c1"
        rows={[
          { beneficiaryType: 'athlete', beneficiaryId: ALICE_ID, label: 'Alice', shareBps: 5000 },
          { beneficiaryType: 'athlete', beneficiaryId: BOB_ID, label: 'Bob', shareBps: 5000 },
        ]}
        totalCreditCents={1000}
      />,
    );

    fireEvent.change(screen.getByLabelText('Part (%) pour Alice'), { target: { value: '70' } });

    expect(screen.getByLabelText('Part (%) pour Alice')).toHaveValue(70);
    expect(screen.getByLabelText('Part (%) pour Bob')).toHaveValue(30);
    expect(screen.getByText(moneyText(700))).toBeInTheDocument();
    expect(screen.getByText(moneyText(300))).toBeInTheDocument();
  });

  it('retirer un bénéficiaire réégalise les lignes restantes', async () => {
    const user = userEvent.setup();
    render(
      <BeneficiarySplit
        cartId="c1"
        rows={[
          { beneficiaryType: 'athlete', beneficiaryId: ALICE_ID, label: 'Alice', shareBps: 7000 },
          { beneficiaryType: 'athlete', beneficiaryId: BOB_ID, label: 'Bob', shareBps: 3000 },
        ]}
        totalCreditCents={1000}
      />,
    );

    const removeButtons = screen.getAllByRole('button', { name: 'Retirer' });
    await user.click(removeButtons[1]!);

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText(moneyText(1000))).toBeInTheDocument();
  });

  it('ne permet pas de retirer le dernier bénéficiaire', () => {
    render(
      <BeneficiarySplit
        cartId="c1"
        rows={[{ beneficiaryType: 'athlete', beneficiaryId: ALICE_ID, label: 'Alice', shareBps: 10000 }]}
        totalCreditCents={1000}
      />,
    );

    expect(screen.getByRole('button', { name: 'Retirer' })).toBeDisabled();
  });

  it('soumet les tableaux parallèles attendus par setBeneficiarySplitAction (champs cachés)', () => {
    const { container } = render(
      <BeneficiarySplit
        cartId="mon-panier-id"
        rows={[
          { beneficiaryType: 'athlete', beneficiaryId: ALICE_ID, label: 'Alice', shareBps: 4000 },
          { beneficiaryType: 'team', beneficiaryId: BOB_ID, label: 'Bob', shareBps: 6000 },
        ]}
        totalCreditCents={1000}
      />,
    );

    const cartIdInput = container.querySelector('input[name="cartId"]');
    expect(cartIdInput).toHaveValue('mon-panier-id');

    const typeInputs = Array.from(container.querySelectorAll('input[name="beneficiaryType"]')).map(
      (el) => (el as HTMLInputElement).value,
    );
    const idInputs = Array.from(container.querySelectorAll('input[name="beneficiaryId"]')).map(
      (el) => (el as HTMLInputElement).value,
    );
    const shareInputs = Array.from(container.querySelectorAll('input[name="shareBps"]')).map(
      (el) => (el as HTMLInputElement).value,
    );

    expect(typeInputs).toEqual(['athlete', 'team']);
    expect(idInputs).toEqual([ALICE_ID, BOB_ID]);
    expect(shareInputs).toEqual(['4000', '6000']);
  });
});
