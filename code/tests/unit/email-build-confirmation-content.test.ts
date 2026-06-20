/**
 * Tests unitaires de `lib/email/build-confirmation-content.ts` (Tâche 1.5) :
 * fonction PURE, donc testable sans réseau/SendGrid (CLAUDE.md section 6/8).
 * Couvre le contenu texte/HTML, l'échappement HTML (anti-injection à partir
 * de noms de produit/bénéficiaire saisis par des tiers) et le message de
 * repli quand aucun bénéficiaire n'est associé à la commande.
 */
import { describe, expect, it } from 'vitest';
import { buildOrderConfirmationContent } from '@/lib/email/build-confirmation-content';
import { formatCents } from '@/lib/format-cents';

describe('buildOrderConfirmationContent', () => {
  const baseInput = {
    orderNumber: 'CMD-0001',
    items: [
      { productName: 'Chandail', quantity: 2, unitPriceCents: 3000, lineTotalCents: 6000 },
    ],
    subtotalCents: 6000,
    taxCents: 899,
    shippingCents: 0,
    totalCents: 6899,
    beneficiaryCredits: [{ label: 'Corsaires', amountCents: 600 }],
  };

  it('inclut le numéro de commande dans le sujet', () => {
    const { subject } = buildOrderConfirmationContent(baseInput);
    expect(subject).toBe('Confirmation de votre commande CMD-0001');
  });

  it('liste les articles et les totaux dans le corps texte', () => {
    const { text } = buildOrderConfirmationContent(baseInput);
    expect(text).toContain('Chandail x2');
    expect(text).toContain(formatCents(6000));
    expect(text).toContain(`Sous-total : ${formatCents(6000)}`);
    expect(text).toContain(`TPS + TVQ : ${formatCents(899)}`);
    expect(text).toContain(`Total : ${formatCents(6899)}`);
  });

  it('liste l’impact par bénéficiaire dans le corps texte', () => {
    const { text } = buildOrderConfirmationContent(baseInput);
    expect(text).toContain(`${formatCents(600)} pour Corsaires`);
  });

  it('affiche un message de repli quand la commande n’a aucun bénéficiaire associé', () => {
    const { text, html } = buildOrderConfirmationContent({ ...baseInput, beneficiaryCredits: [] });
    expect(text).toContain('Aucun bénéficiaire associé à cette commande.');
    expect(html).toContain('Aucun bénéficiaire associé à cette commande.');
  });

  it('inclut les mêmes informations dans le corps HTML', () => {
    const { html } = buildOrderConfirmationContent(baseInput);
    expect(html).toContain('CMD-0001');
    expect(html).toContain('Chandail');
    expect(html).toContain(formatCents(6899));
    expect(html).toContain('Corsaires');
  });

  it('échappe les caractères HTML dangereux dans le nom de produit (anti-injection)', () => {
    const { html, text } = buildOrderConfirmationContent({
      ...baseInput,
      items: [
        {
          productName: '<script>alert(1)</script>',
          quantity: 1,
          unitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // Le corps texte (non HTML) n'a pas besoin d'échappement -- pas de risque
    // d'injection en dehors d'un rendu HTML.
    expect(text).toContain('<script>alert(1)</script>');
  });

  it('échappe les caractères HTML dangereux dans le libellé de bénéficiaire', () => {
    const { html } = buildOrderConfirmationContent({
      ...baseInput,
      beneficiaryCredits: [{ label: '"><img src=x onerror=alert(1)>', amountCents: 100 }],
    });
    expect(html).not.toContain('"><img src=x onerror=alert(1)>');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('gère un crédit nul (0 ¢) sans lever d’erreur', () => {
    const { text } = buildOrderConfirmationContent({
      ...baseInput,
      beneficiaryCredits: [{ label: 'Corsaires', amountCents: 0 }],
    });
    expect(text).toContain(`${formatCents(0)} pour Corsaires`);
  });

  it('répartit l’impact entre plusieurs bénéficiaires distincts', () => {
    const { text } = buildOrderConfirmationContent({
      ...baseInput,
      beneficiaryCredits: [
        { label: 'Corsaires', amountCents: 400 },
        { label: 'Marie T.', amountCents: 200 },
      ],
    });
    expect(text).toContain(`${formatCents(400)} pour Corsaires`);
    expect(text).toContain(`${formatCents(200)} pour Marie T.`);
  });
});
