/**
 * Tests unitaires de la liste « Mes campagnes » (correction d'écart de
 * navigation, Phase 1.4b -- voir docs/DECISIONS.md et
 * `lib/campaigns/list-for-manager.ts`).
 *
 * Le repo Supabase réel (`createSupabaseCampaignListRepo`) n'est
 * volontairement pas exercé ici -- fine couche de lecture, pas de logique
 * métier (même convention que `tests/unit/campaigns-close.test.ts`). Le
 * scope RLS lui-même est couvert par les tests e2e/intégration existants sur
 * `campaigns_select_scoped`, pas dupliqué ici.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCampaignListItems,
  campaignStatusBadgeVariant,
  type CampaignProgressRow,
} from '@/lib/campaigns/list-for-manager';
import type { CampaignRow } from '@/lib/campaigns/close';
import type { CampaignStatus } from '@/lib/db/types';

function makeCampaign(overrides: Partial<Pick<CampaignRow, 'id' | 'name' | 'status' | 'goal_cents' | 'created_at'>>) {
  return {
    id: 'camp-1',
    name: 'Campagne U11 Hockey',
    status: 'active' as CampaignStatus,
    goal_cents: 100000,
    created_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildCampaignListItems', () => {
  it('trie du plus récent au plus ancien', () => {
    const older = makeCampaign({ id: 'old', created_at: '2026-01-01T00:00:00.000Z' });
    const newer = makeCampaign({ id: 'new', created_at: '2026-06-01T00:00:00.000Z' });

    const items = buildCampaignListItems([older, newer], []);

    expect(items.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('associe le montant amassé depuis v_campaign_progress', () => {
    const campaign = makeCampaign({ id: 'camp-1' });
    const progress: CampaignProgressRow[] = [{ campaign_id: 'camp-1', raised_cents: 4500 }];

    const [item] = buildCampaignListItems([campaign], progress);

    expect(item?.raisedCents).toBe(4500);
  });

  it("retourne raisedCents: 0 quand la campagne n'a aucune ligne de progression (pas une erreur)", () => {
    const campaign = makeCampaign({ id: 'camp-sans-credit' });

    const [item] = buildCampaignListItems([campaign], []);

    expect(item?.raisedCents).toBe(0);
  });

  it('reporte le label français et la variante de badge du statut', () => {
    const campaign = makeCampaign({ status: 'closed' });

    const [item] = buildCampaignListItems([campaign], []);

    expect(item?.statusLabel).toBe('Clôturée');
    expect(item?.statusBadgeVariant).toBe('info');
  });

  it('conserve goalCents tel quel, y compris null (aucun objectif défini)', () => {
    const campaign = makeCampaign({ goal_cents: null });

    const [item] = buildCampaignListItems([campaign], []);

    expect(item?.goalCents).toBeNull();
  });

  it('retourne un tableau vide si aucune campagne (pas une erreur)', () => {
    expect(buildCampaignListItems([], [])).toEqual([]);
  });
});

describe('campaignStatusBadgeVariant', () => {
  it('mappe chaque statut vers une variante de badge valide', () => {
    const ALL_STATUSES: CampaignStatus[] = [
      'draft',
      'pending_approval',
      'scheduled',
      'active',
      'ended',
      'closed',
      'paid',
      'cancelled',
      'archived',
    ];
    const VALID_VARIANTS = new Set(['neutral', 'success', 'warning', 'error', 'info']);

    for (const status of ALL_STATUSES) {
      expect(VALID_VARIANTS.has(campaignStatusBadgeVariant(status))).toBe(true);
    }
  });

  it('marque "active" comme success et "cancelled" comme error', () => {
    expect(campaignStatusBadgeVariant('active')).toBe('success');
    expect(campaignStatusBadgeVariant('cancelled')).toBe('error');
  });
});
