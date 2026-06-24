/**
 * Tests unitaires (Tâche 1.6.B3) : identité d'un bénéficiaire par id
 * (aperçu fidèle + écran de démarrage). `loadBeneficiaryPreviewIdentity`
 * reçoit un faux repo (aucune DB) — voir `lib/public/preview.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildBeneficiaryPublicPath,
  loadBeneficiaryPreviewIdentity,
  type BeneficiaryPreviewIdentity,
  type BeneficiaryPreviewRepo,
} from '@/lib/public/preview';

function makeIdentity(overrides: Partial<BeneficiaryPreviewIdentity> = {}): BeneficiaryPreviewIdentity {
  return {
    name: 'Nom',
    slug: 'slug',
    imageUrl: null,
    bodyText: null,
    sport: null,
    category: null,
    city: null,
    province: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<BeneficiaryPreviewRepo> = {}): BeneficiaryPreviewRepo {
  return {
    getTeamIdentityById: vi.fn().mockResolvedValue(null),
    getClubIdentityById: vi.fn().mockResolvedValue(null),
    getAthleteIdentityById: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('buildBeneficiaryPublicPath', () => {
  it('construit /team/:slug pour une équipe', () => {
    expect(buildBeneficiaryPublicPath('team', 'u11-hockey')).toBe('/team/u11-hockey');
  });

  it('construit /club/:slug pour un club', () => {
    expect(buildBeneficiaryPublicPath('club', 'corsaires')).toBe('/club/corsaires');
  });

  it('construit /:slug (route top-level, lien court) pour un athlète', () => {
    expect(buildBeneficiaryPublicPath('athlete', 'thomas-tremblay')).toBe('/thomas-tremblay');
  });
});

describe('loadBeneficiaryPreviewIdentity', () => {
  it('retourne null si le type ou l’id du bénéficiaire est absent (brouillon pas encore rempli)', async () => {
    const repo = makeRepo();
    expect(await loadBeneficiaryPreviewIdentity(undefined, 'id', repo)).toBeNull();
    expect(await loadBeneficiaryPreviewIdentity('team', undefined, repo)).toBeNull();
    expect(await loadBeneficiaryPreviewIdentity(null, null, repo)).toBeNull();
  });

  it('dispatche vers getTeamIdentityById pour beneficiaryType "team"', async () => {
    const identity = makeIdentity({ name: 'U11 Hockey' });
    const getTeamIdentityById = vi.fn().mockResolvedValue(identity);
    const repo = makeRepo({ getTeamIdentityById });
    expect(await loadBeneficiaryPreviewIdentity('team', 'team-1', repo)).toBe(identity);
    expect(getTeamIdentityById).toHaveBeenCalledWith('team-1');
  });

  it('dispatche vers getClubIdentityById pour beneficiaryType "club"', async () => {
    const identity = makeIdentity({ name: 'Corsaires' });
    const getClubIdentityById = vi.fn().mockResolvedValue(identity);
    const repo = makeRepo({ getClubIdentityById });
    expect(await loadBeneficiaryPreviewIdentity('club', 'club-1', repo)).toBe(identity);
    expect(getClubIdentityById).toHaveBeenCalledWith('club-1');
  });

  it('dispatche vers getAthleteIdentityById pour tout autre type (athlete)', async () => {
    const identity = makeIdentity({ name: 'Thomas Tremblay' });
    const getAthleteIdentityById = vi.fn().mockResolvedValue(identity);
    const repo = makeRepo({ getAthleteIdentityById });
    expect(await loadBeneficiaryPreviewIdentity('athlete', 'athlete-1', repo)).toBe(identity);
    expect(getAthleteIdentityById).toHaveBeenCalledWith('athlete-1');
  });

  it('propage un null du repo (id inexistant ou hide_* masquant tout) sans le transformer', async () => {
    const repo = makeRepo({ getTeamIdentityById: vi.fn().mockResolvedValue(null) });
    expect(await loadBeneficiaryPreviewIdentity('team', 'introuvable', repo)).toBeNull();
  });
});
