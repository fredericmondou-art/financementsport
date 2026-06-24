/**
 * Tests unitaires (Tâche 1.6.C2) : message pré-rédigé pour le partage du
 * lien personnel depuis la page de suivi de l'athlète — « rien à rédiger,
 * copiable en un clic ». Logique pure, aucune DB — voir
 * `lib/athletes/share-message.ts`. Même structure que
 * `tests/unit/campaign-demarrage-message.test.ts` (gabarit jumeau, Tâche
 * 1.6.B3).
 */
import { describe, expect, it } from 'vitest';
import { buildAthleteShareMessage } from '@/lib/athletes/share-message';

describe('buildAthleteShareMessage', () => {
  it('inclut le nom du bénéficiaire, le nom de la campagne et le lien public', () => {
    const message = buildAthleteShareMessage({
      beneficiaryName: 'Thomas Tremblay',
      campaignName: 'Campagne U11 Hockey',
      publicUrl: 'https://example.com/thomas-tremblay',
    });
    expect(message).toContain('Thomas Tremblay');
    expect(message).toContain('Campagne U11 Hockey');
    expect(message).toContain('https://example.com/thomas-tremblay');
  });

  it('est en français, sans aucune balise/format à retirer avant collage (texte brut copiable directement)', () => {
    const message = buildAthleteShareMessage({
      beneficiaryName: 'Camille Tremblay',
      campaignName: 'Campagne U11',
      publicUrl: 'https://example.com/camille-tremblay',
    });
    expect(message).not.toMatch(/<[^>]+>/);
    expect(message.startsWith('Bonjour,')).toBe(true);
  });

  it('reste à la troisième personne (jamais "je"/"j\'" -- cadre parental, CLAUDE.md section 5)', () => {
    const message = buildAthleteShareMessage({
      beneficiaryName: 'Camille Tremblay',
      campaignName: 'Campagne U11',
      publicUrl: 'https://example.com/camille-tremblay',
    });
    expect(message).not.toMatch(/\bj['e]\b/i);
    expect(message).not.toMatch(/\bje\b/i);
  });
});
