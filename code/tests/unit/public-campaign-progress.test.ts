/**
 * Tests unitaires (Tâche 1.6) : sélection de campagne, calcul de progression,
 * masquage des montants, jours restants. Logique pure, aucune DB — voir
 * `lib/public/campaign-progress.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAmountsMask,
  computeCampaignProgress,
  computeDaysRemaining,
  pickMostRelevantCampaign,
  type PublicCampaignRow,
} from '@/lib/public/campaign-progress';

function makeCampaign(overrides: Partial<PublicCampaignRow>): PublicCampaignRow {
  return {
    id: overrides.id ?? 'id',
    type: 'team',
    name: 'Campagne',
    slug: 'campagne',
    public_message: null,
    beneficiary_type: 'team',
    beneficiary_id: 'team-1',
    goal_cents: null,
    starts_at: null,
    ends_at: null,
    ...overrides,
  };
}

describe('pickMostRelevantCampaign', () => {
  it('retourne null pour une liste vide', () => {
    expect(pickMostRelevantCampaign([])).toBeNull();
  });

  it('retourne l’unique campagne s’il n’y en a qu’une', () => {
    const campaign = makeCampaign({ id: 'a' });
    expect(pickMostRelevantCampaign([campaign])).toBe(campaign);
  });

  it('choisit la campagne la plus récemment démarrée (starts_at décroissant)', () => {
    const ancienne = makeCampaign({ id: 'ancienne', starts_at: '2026-01-01T00:00:00Z' });
    const recente = makeCampaign({ id: 'recente', starts_at: '2026-06-01T00:00:00Z' });
    expect(pickMostRelevantCampaign([ancienne, recente])?.id).toBe('recente');
    expect(pickMostRelevantCampaign([recente, ancienne])?.id).toBe('recente');
  });

  it('classe une campagne sans starts_at en dernier (traitée comme "jamais démarrée")', () => {
    const sansDate = makeCampaign({ id: 'sans-date', starts_at: null });
    const avecDate = makeCampaign({ id: 'avec-date', starts_at: '2026-01-01T00:00:00Z' });
    expect(pickMostRelevantCampaign([sansDate, avecDate])?.id).toBe('avec-date');
  });

  it('départage deux campagnes à égalité de starts_at par id (ordre stable, déterministe)', () => {
    const b = makeCampaign({ id: 'b', starts_at: '2026-01-01T00:00:00Z' });
    const a = makeCampaign({ id: 'a', starts_at: '2026-01-01T00:00:00Z' });
    expect(pickMostRelevantCampaign([b, a])?.id).toBe('a');
    expect(pickMostRelevantCampaign([a, b])?.id).toBe('a');
  });
});

describe('computeCampaignProgress', () => {
  it('retourne goalCents/percent null si aucun objectif (goal_cents null)', () => {
    const progress = computeCampaignProgress(5000, null);
    expect(progress).toEqual({ raisedCents: 5000, goalCents: null, percent: null, isGoalExceeded: false });
  });

  it('retourne goalCents/percent null si l’objectif est <= 0 (cas limite)', () => {
    expect(computeCampaignProgress(100, 0).goalCents).toBeNull();
    expect(computeCampaignProgress(100, -500).goalCents).toBeNull();
  });

  it('calcule un pourcentage arrondi correct', () => {
    const progress = computeCampaignProgress(2500, 10000);
    expect(progress.percent).toBe(25);
    expect(progress.isGoalExceeded).toBe(false);
  });

  it('plafonne le pourcentage à 100 même si l’objectif est dépassé', () => {
    const progress = computeCampaignProgress(15000, 10000);
    expect(progress.percent).toBe(100);
    expect(progress.isGoalExceeded).toBe(true);
  });

  it('gère le montant amassé à 0 (cas limite)', () => {
    const progress = computeCampaignProgress(0, 10000);
    expect(progress.percent).toBe(0);
    expect(progress.isGoalExceeded).toBe(false);
  });
});

describe('applyAmountsMask — respect de athletes.hide_amounts', () => {
  it('ne modifie rien si hideAmounts est faux', () => {
    const progress = computeCampaignProgress(2500, 10000);
    expect(applyAmountsMask(progress, false)).toEqual(progress);
  });

  it('remplace tous les montants par des valeurs neutres si hideAmounts est vrai', () => {
    const progress = computeCampaignProgress(2500, 10000);
    expect(applyAmountsMask(progress, true)).toEqual({
      raisedCents: 0,
      goalCents: null,
      percent: null,
      isGoalExceeded: false,
    });
  });

  it('masque même un objectif déjà dépassé (ne doit jamais fuiter isGoalExceeded)', () => {
    const progress = computeCampaignProgress(15000, 10000);
    expect(applyAmountsMask(progress, true).isGoalExceeded).toBe(false);
  });
});

describe('computeDaysRemaining', () => {
  const now = new Date('2026-06-20T12:00:00Z');

  it('retourne null si endsAt est null (campagne sans échéance)', () => {
    expect(computeDaysRemaining(null, now)).toBeNull();
  });

  it('calcule le nombre de jours restants (arrondi au jour supérieur)', () => {
    expect(computeDaysRemaining('2026-06-25T12:00:00Z', now)).toBe(5);
  });

  it('plafonne à 0 si la date de fin est déjà dépassée (jamais négatif)', () => {
    expect(computeDaysRemaining('2026-01-01T00:00:00Z', now)).toBe(0);
  });

  it('retourne 0 si la fin est exactement maintenant (cas limite)', () => {
    expect(computeDaysRemaining(now.toISOString(), now)).toBe(0);
  });
});
