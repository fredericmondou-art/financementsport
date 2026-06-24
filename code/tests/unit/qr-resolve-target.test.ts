/**
 * Tests unitaires (Tâche 1.5.1) : décision de redirection d'un scan de QR.
 * `resolveQrScanPath` reçoit un faux repo (aucune DB) — voir
 * `lib/qr/resolve-target.ts`. Couvre les décisions autonomes documentées
 * dans le fichier source et `docs/DECISIONS.md` : repli produit, repli
 * campagne non active, expiration, bénéficiaire introuvable/masqué.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  QR_FALLBACK_PATH,
  resolveQrScanPath,
  type QrResolveRepo,
  type QrScanTarget,
} from '@/lib/qr/resolve-target';

function makeTarget(overrides: Partial<QrScanTarget> = {}): QrScanTarget {
  return {
    targetType: 'athlete',
    targetId: 'athlete-1',
    redirectUrl: null,
    expiresAt: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<QrResolveRepo> = {}): QrResolveRepo {
  return {
    getCampaign: vi.fn().mockResolvedValue(null),
    getBeneficiaryPublicPath: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('resolveQrScanPath', () => {
  it('résout directement le chemin public pour une cible athlète', async () => {
    const getBeneficiaryPublicPath = vi.fn().mockResolvedValue('/thomas-tremblay');
    const repo = makeRepo({ getBeneficiaryPublicPath });
    const target = makeTarget({ targetType: 'athlete', targetId: 'athlete-1' });
    expect(await resolveQrScanPath(target, repo)).toBe('/thomas-tremblay');
    expect(getBeneficiaryPublicPath).toHaveBeenCalledWith('athlete', 'athlete-1');
  });

  it('résout directement le chemin public pour une cible équipe', async () => {
    const getBeneficiaryPublicPath = vi.fn().mockResolvedValue('/team/u11-hockey');
    const repo = makeRepo({ getBeneficiaryPublicPath });
    const target = makeTarget({ targetType: 'team', targetId: 'team-1' });
    expect(await resolveQrScanPath(target, repo)).toBe('/team/u11-hockey');
  });

  it('résout directement le chemin public pour une cible club', async () => {
    const getBeneficiaryPublicPath = vi.fn().mockResolvedValue('/club/corsaires');
    const repo = makeRepo({ getBeneficiaryPublicPath });
    const target = makeTarget({ targetType: 'club', targetId: 'club-1' });
    expect(await resolveQrScanPath(target, repo)).toBe('/club/corsaires');
  });

  it('redirige vers /boutique pour une cible produit', async () => {
    const repo = makeRepo();
    const target = makeTarget({ targetType: 'product', targetId: 'product-1' });
    expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
  });

  it('résout le bénéficiaire d’une campagne ACTIVE', async () => {
    const getCampaign = vi
      .fn()
      .mockResolvedValue({ status: 'active', beneficiaryType: 'team', beneficiaryId: 'team-1' });
    const getBeneficiaryPublicPath = vi.fn().mockResolvedValue('/team/u11-hockey');
    const repo = makeRepo({ getCampaign, getBeneficiaryPublicPath });
    const target = makeTarget({ targetType: 'campaign', targetId: 'campaign-1' });
    expect(await resolveQrScanPath(target, repo)).toBe('/team/u11-hockey');
    expect(getCampaign).toHaveBeenCalledWith('campaign-1');
    expect(getBeneficiaryPublicPath).toHaveBeenCalledWith('team', 'team-1');
  });

  it.each(['ended', 'closed', 'cancelled', 'draft', 'pending_approval', 'scheduled', 'paid', 'archived'])(
    'redirige vers le repli pour une campagne au statut "%s"',
    async (status) => {
      const getCampaign = vi.fn().mockResolvedValue({ status, beneficiaryType: 'team', beneficiaryId: 'team-1' });
      const repo = makeRepo({ getCampaign });
      const target = makeTarget({ targetType: 'campaign', targetId: 'campaign-1' });
      expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
    },
  );

  it('redirige vers /boutique si la campagne référencée est introuvable', async () => {
    const repo = makeRepo({ getCampaign: vi.fn().mockResolvedValue(null) });
    const target = makeTarget({ targetType: 'campaign', targetId: 'campaign-introuvable' });
    expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
  });

  it('préfère redirect_url au repli /boutique quand il est défini', async () => {
    const repo = makeRepo();
    const target = makeTarget({ targetType: 'product', redirectUrl: 'https://exemple.com/special' });
    expect(await resolveQrScanPath(target, repo)).toBe('https://exemple.com/special');
  });

  it('redirige vers le repli si le code est expiré, même pour une cible valide', async () => {
    const getBeneficiaryPublicPath = vi.fn().mockResolvedValue('/thomas-tremblay');
    const repo = makeRepo({ getBeneficiaryPublicPath });
    const target = makeTarget({ expiresAt: '2020-01-01T00:00:00Z' });
    expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
    expect(getBeneficiaryPublicPath).not.toHaveBeenCalled();
  });

  it('ne redirige pas vers le repli si expiresAt est dans le futur', async () => {
    const getBeneficiaryPublicPath = vi.fn().mockResolvedValue('/thomas-tremblay');
    const repo = makeRepo({ getBeneficiaryPublicPath });
    const target = makeTarget({ expiresAt: '2999-01-01T00:00:00Z' });
    expect(await resolveQrScanPath(target, repo)).toBe('/thomas-tremblay');
  });

  it('redirige vers le repli si le bénéficiaire ciblé n’est pas visible publiquement (mineur sans consentement, etc.)', async () => {
    const repo = makeRepo({ getBeneficiaryPublicPath: vi.fn().mockResolvedValue(null) });
    const target = makeTarget({ targetType: 'athlete', targetId: 'athlete-masque' });
    expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
  });

  it('redirige vers le repli pour un targetType inconnu', async () => {
    const repo = makeRepo();
    const target = makeTarget({ targetType: 'inconnu' });
    expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
  });

  it('redirige vers le repli si une cible bénéficiaire n’a pas de targetId', async () => {
    const repo = makeRepo();
    const target = makeTarget({ targetType: 'athlete', targetId: null });
    expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
  });

  it('redirige vers le repli si une campagne n’a pas de targetId', async () => {
    const repo = makeRepo();
    const target = makeTarget({ targetType: 'campaign', targetId: null });
    expect(await resolveQrScanPath(target, repo)).toBe(QR_FALLBACK_PATH);
  });
});
