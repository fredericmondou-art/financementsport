/**
 * Tests unitaires (Tâche 1.6.B3) : aperçu fidèle du brouillon de campagne
 * avant activation. Logique pure, aucune DB — voir
 * `lib/campaigns/draft-preview.ts`.
 */
import { describe, expect, it } from 'vitest';
import { buildDraftPreviewCampaignSection } from '@/lib/campaigns/draft-preview';
import type { CampaignDraftData } from '@/lib/campaigns/draft';

function makeDraft(overrides: Partial<CampaignDraftData> = {}): CampaignDraftData {
  return {
    type: 'team',
    name: 'Campagne U11',
    beneficiaryType: 'team',
    beneficiaryId: 'team-1',
    ...overrides,
  };
}

describe('buildDraftPreviewCampaignSection', () => {
  it('retourne null si aucun bénéficiaire n’a encore été choisi (étape « Bénéficiaire » pas remplie)', () => {
    expect(buildDraftPreviewCampaignSection({})).toBeNull();
    expect(buildDraftPreviewCampaignSection(makeDraft({ beneficiaryType: undefined }))).toBeNull();
    expect(buildDraftPreviewCampaignSection(makeDraft({ beneficiaryId: undefined }))).toBeNull();
  });

  it('retourne null si le nom de la campagne (étape 1) n’a pas encore été saisi', () => {
    expect(buildDraftPreviewCampaignSection(makeDraft({ name: undefined }))).toBeNull();
  });

  it('construit une section avec un montant amassé forcé à 0 (aucune commande réelle pendant le brouillon)', () => {
    const section = buildDraftPreviewCampaignSection(makeDraft({ goalCents: 10000 }));
    expect(section).not.toBeNull();
    expect(section?.progress.raisedCents).toBe(0);
    expect(section?.progress.goalCents).toBe(10000);
    expect(section?.progress.percent).toBe(0);
  });

  it('reprend le nom, le message public et le bénéficiaire saisis dans le brouillon', () => {
    const section = buildDraftPreviewCampaignSection(
      makeDraft({ publicMessage: 'Encouragez notre équipe !', beneficiaryType: 'club', beneficiaryId: 'club-1' }),
    );
    expect(section?.campaign.name).toBe('Campagne U11');
    expect(section?.campaign.public_message).toBe('Encouragez notre équipe !');
    expect(section?.campaign.beneficiary_type).toBe('club');
    expect(section?.campaign.beneficiary_id).toBe('club-1');
  });

  it('calcule daysRemaining si une date de fin est déjà saisie, sinon le laisse null', () => {
    expect(buildDraftPreviewCampaignSection(makeDraft())?.daysRemaining).toBeNull();
    const withEndDate = buildDraftPreviewCampaignSection(
      makeDraft({ endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }),
    );
    expect(withEndDate?.daysRemaining).toBeGreaterThanOrEqual(4);
  });
});
