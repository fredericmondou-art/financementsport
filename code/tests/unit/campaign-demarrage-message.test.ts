/**
 * Tests unitaires (Tâche 1.6.B3) : message pré-rédigé envoyé aux parents
 * depuis l'écran de démarrage — « rien à rédiger, copiable en un clic ».
 * Logique pure, aucune DB — voir `lib/campaigns/demarrage-message.ts`.
 */
import { describe, expect, it } from 'vitest';
import { buildParentMessage } from '@/lib/campaigns/demarrage-message';

describe('buildParentMessage', () => {
  it('inclut le nom du bénéficiaire, le nom de la campagne et le lien public', () => {
    const message = buildParentMessage({
      beneficiaryName: 'Thomas Tremblay',
      campaignName: 'Campagne U11 Hockey',
      publicUrl: 'https://example.com/thomas-tremblay',
    });
    expect(message).toContain('Thomas Tremblay');
    expect(message).toContain('Campagne U11 Hockey');
    expect(message).toContain('https://example.com/thomas-tremblay');
  });

  it('est en français, sans aucune balise/format à retirer avant collage (texte brut copiable directement)', () => {
    const message = buildParentMessage({
      beneficiaryName: 'Équipe U11',
      campaignName: 'Campagne U11',
      publicUrl: 'https://example.com/u11',
    });
    expect(message).not.toMatch(/<[^>]+>/);
    expect(message.startsWith('Bonjour,')).toBe(true);
  });

  it('produit un message différent (mais du même gabarit) pour chaque type de bénéficiaire, sans branche spécifique', () => {
    const team = buildParentMessage({ beneficiaryName: 'Équipe A', campaignName: 'Campagne A', publicUrl: 'https://x/a' });
    const athlete = buildParentMessage({ beneficiaryName: 'Alice Côté', campaignName: 'Campagne B', publicUrl: 'https://x/b' });
    expect(team).not.toBe(athlete);
    expect(team.split('\n').length).toBe(athlete.split('\n').length);
  });
});
