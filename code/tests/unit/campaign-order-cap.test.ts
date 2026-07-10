import { describe, expect, it } from 'vitest';
import { isCampaignOrderCapReached } from '@/lib/checkout/campaign-order-cap';

describe('isCampaignOrderCapReached (P.4, SPEC-PARAMETRES-PLATEFORME.md, R4)', () => {
  it('max-1 : sous le plafond -- toujours accepté sous la campagne', () => {
    expect(isCampaignOrderCapReached(249, 250)).toBe(false);
  });

  it('max : au plafond -- bascule vers la boutique permanente (>=, pas >)', () => {
    expect(isCampaignOrderCapReached(250, 250)).toBe(true);
  });

  it('max+1 : au-delà du plafond (défensif) -- bascule aussi', () => {
    expect(isCampaignOrderCapReached(251, 250)).toBe(true);
  });

  it('0 commande payée, plafond élevé -- jamais atteint', () => {
    expect(isCampaignOrderCapReached(0, 250)).toBe(false);
  });

  it('plafond à 0 (configuration limite) -- toujours atteint, même à 0 commande', () => {
    expect(isCampaignOrderCapReached(0, 0)).toBe(true);
  });

  it('plafond à 1 -- première commande acceptée (0 payée), deuxième bascule (1 payée)', () => {
    expect(isCampaignOrderCapReached(0, 1)).toBe(false);
    expect(isCampaignOrderCapReached(1, 1)).toBe(true);
  });
});
