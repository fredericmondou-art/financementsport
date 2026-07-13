/**
 * Tests unitaires des avertissements non bloquants R5/R6 de l'assistant de
 * campagne (P.6, SPEC-PARAMETRES-PLATEFORME.md §4) :
 * `lib/campaigns/wizard-warnings.ts`. Fonctions PURES -- aucune I/O, aucun
 * repo simulé nécessaire (même esprit que
 * `tests/unit/campaign-order-cap.test.ts`, R4).
 */
import { describe, expect, it } from 'vitest';
import {
  buildObjectifAmbitieuxMessage,
  buildProduitsRecommandeMessage,
} from '@/lib/campaigns/wizard-warnings';

const SUGGERE = { min: 10000, max: 25000 }; // 100 $ - 250 $
const AVERTISSEMENT_CENTS = 40000; // 400 $

describe('buildObjectifAmbitieuxMessage', () => {
  it('retourne null si aucun objectif n’est fixé (optionnel, spec §4)', () => {
    expect(buildObjectifAmbitieuxMessage(null, AVERTISSEMENT_CENTS, SUGGERE)).toBeNull();
  });

  it('retourne null pour un objectif sous le seuil d’avertissement', () => {
    expect(buildObjectifAmbitieuxMessage(AVERTISSEMENT_CENTS - 1, AVERTISSEMENT_CENTS, SUGGERE)).toBeNull();
  });

  it('borne exacte : objectif === seuil d’avertissement --> pas encore un dépassement', () => {
    expect(buildObjectifAmbitieuxMessage(AVERTISSEMENT_CENTS, AVERTISSEMENT_CENTS, SUGGERE)).toBeNull();
  });

  it('borne max+1 : objectif === seuil + 1 centime --> avertissement affiché', () => {
    const message = buildObjectifAmbitieuxMessage(AVERTISSEMENT_CENTS + 1, AVERTISSEMENT_CENTS, SUGGERE);
    expect(message).not.toBeNull();
    expect(message).toContain('ambitieux');
  });

  it('mentionne la plage suggérée formatée en dollars', () => {
    const message = buildObjectifAmbitieuxMessage(AVERTISSEMENT_CENTS + 1, AVERTISSEMENT_CENTS, SUGGERE);
    // Espace insécable posée par Intl.NumberFormat('fr-CA') entre le montant
    // et « $ » -- on ne teste que les chiffres, indépendamment du caractère
    // d'espacement exact utilisé par l'environnement d'exécution.
    expect(message).toContain('100,00');
    expect(message).toContain('250,00');
  });

  it('ne bloque jamais (retourne toujours une chaîne, jamais une exception) même pour un objectif très élevé', () => {
    expect(() => buildObjectifAmbitieuxMessage(10_000_000, AVERTISSEMENT_CENTS, SUGGERE)).not.toThrow();
  });
});

describe('buildProduitsRecommandeMessage', () => {
  it('retourne null pour 0 produit sélectionné', () => {
    expect(buildProduitsRecommandeMessage(0, 4)).toBeNull();
  });

  it('borne exacte : nombre de produits === recommandé --> pas encore un dépassement', () => {
    expect(buildProduitsRecommandeMessage(4, 4)).toBeNull();
  });

  it('borne max+1 : nombre de produits === recommandé + 1 --> avertissement affiché', () => {
    const message = buildProduitsRecommandeMessage(5, 4);
    expect(message).not.toBeNull();
    expect(message).toContain('4');
  });

  it('reste sous le seuil pour un nombre de produits inférieur au recommandé', () => {
    expect(buildProduitsRecommandeMessage(2, 4)).toBeNull();
  });

  it('affiche toujours le seuil RECOMMANDÉ dans le message, jamais le nombre choisi', () => {
    const message = buildProduitsRecommandeMessage(6, 4);
    expect(message).toContain('4 produits');
    expect(message).not.toContain('6 produits');
  });
});
