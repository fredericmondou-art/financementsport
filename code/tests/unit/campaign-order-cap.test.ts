import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isCampaignOrderCapReached } from '@/lib/checkout/campaign-order-cap';
import { resolveEffectiveLimit, type DerogationRow } from '@/lib/derogations/derogations';

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

/**
 * P.8 (SPEC-PARAMETRES-PLATEFORME.md §6 : « chaque règle testée aux bornes
 * ... dérogation active ») : R4 était la seule des cinq règles dérogeables
 * (R1/R3/R4/R5/R7) sans test couvrant la composition RÉELLE utilisée par
 * `lib/checkout/create-checkout-session.ts` -- `resolveEffectiveLimit`
 * (lib/derogations/derogations.ts) puis `isCampaignOrderCapReached`
 * ci-dessus, exactement dans cet ordre. Les deux fonctions sont déjà pures
 * et déjà testées séparément (`tests/unit/derogations.test.ts` pour la
 * première, ci-dessus pour la seconde) ; ce bloc ne fait que prouver que
 * leur COMPOSITION se comporte comme au paiement réel, sans dupliquer une
 * logique de décision qui n'existe nulle part ailleurs qu'inline dans
 * `create-checkout-session.ts` (non repo-injectable, donc non testable
 * unitairement autrement -- voir docs/DECISIONS.md, P.8).
 */
describe('R4 + dérogation active (composition resolveEffectiveLimit + isCampaignOrderCapReached)', () => {
  const BASE_MAX = 250;

  function derogation(valeurAppliquee: unknown): DerogationRow {
    return {
      id: randomUUID(),
      cleParametre: 'campagne_commandes_max',
      entiteType: 'campagne',
      entiteId: randomUUID(),
      valeurAppliquee,
      justification: 'Relèvement ponctuel en cours de campagne (R4)',
      adminId: randomUUID(),
      creeLe: new Date().toISOString(),
    };
  }

  it('sans dérogation : le plafond de base s’applique (max déjà couvert ci-dessus)', () => {
    const effectif = resolveEffectiveLimit(BASE_MAX, null);
    expect(isCampaignOrderCapReached(BASE_MAX, effectif)).toBe(true);
  });

  it('avec une dérogation active à 300 : une commande entre 250 et 300 payées est encore acceptée', () => {
    const effectif = resolveEffectiveLimit(BASE_MAX, derogation(300));
    expect(effectif).toBe(300);
    expect(isCampaignOrderCapReached(250, effectif)).toBe(false);
    expect(isCampaignOrderCapReached(299, effectif)).toBe(false);
  });

  it('avec une dérogation active à 300 : la 300e commande payée bascule (borne exacte, >=)', () => {
    const effectif = resolveEffectiveLimit(BASE_MAX, derogation(300));
    expect(isCampaignOrderCapReached(300, effectif)).toBe(true);
  });

  it('avec une dérogation active à 300 : max dérogé + 1 bascule aussi (défensif)', () => {
    const effectif = resolveEffectiveLimit(BASE_MAX, derogation(300));
    expect(isCampaignOrderCapReached(301, effectif)).toBe(true);
  });

  it('une dérogation corrompue (valeur invalide) retombe sur le plafond de base -- jamais de crash au paiement', () => {
    const effectif = resolveEffectiveLimit(BASE_MAX, derogation(-10));
    expect(effectif).toBe(BASE_MAX);
    expect(isCampaignOrderCapReached(BASE_MAX, effectif)).toBe(true);
  });
});
