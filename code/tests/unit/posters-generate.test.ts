/**
 * Tests unitaires (Tâche 1.5.2) : génération d'affiches.
 *
 * `buildPosterContent` (logique pure) couvre le critère d'acceptation
 * « une affiche athlète avec hide_photo=true n'affiche pas la photo » et le
 * masquage `hide_amounts` -- `generatePosterPdfBuffer` (rendu pdf-lib) couvre
 * « génération pour les 3 formats sans erreur » (aucune dépendance réseau/DB,
 * donc placé ici comme `qr-generate.test.ts` à la Tâche 1.5.1, pas dans
 * tests/integration/).
 */
import { describe, expect, it } from 'vitest';
import {
  buildPosterContent,
  generatePosterPdfBuffer,
  POSTER_FORMATS,
  type PosterBeneficiaryInput,
  type PosterCampaignInput,
} from '@/lib/posters/generate';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const baseCampaign: PosterCampaignInput = {
  name: 'Campagne U11 -- saison 2026',
  goalCents: 500000,
  endsAt: '2026-12-31T23:59:59.000Z',
};

const baseBeneficiary: PosterBeneficiaryInput = {
  kind: 'athlete',
  name: 'Thomas T.',
  imageUrl: 'https://exemple.com/photo.jpg',
  bodyText: 'Aidez-moi à atteindre mon objectif !',
  hideAmounts: false,
};

describe('buildPosterContent -- respect des masquages', () => {
  it('masque l’objectif (goalCents) si hideAmounts est vrai pour un athlète', () => {
    const content = buildPosterContent({ ...baseBeneficiary, hideAmounts: true }, baseCampaign, [], 'https://exemple.com/qr');
    expect(content.goalCents).toBeNull();
  });

  it('n’masque rien si hideAmounts est faux', () => {
    const content = buildPosterContent(baseBeneficiary, baseCampaign, [], 'https://exemple.com/qr');
    expect(content.goalCents).toBe(500000);
  });

  it('ignore hideAmounts pour une équipe (pas de champ équivalent sur teams)', () => {
    const teamBeneficiary: PosterBeneficiaryInput = {
      kind: 'team',
      name: 'U11 Faucons',
      imageUrl: null,
      bodyText: null,
      hideAmounts: true, // ne devrait jamais arriver en pratique, mais ne doit rien masquer
    };
    const content = buildPosterContent(teamBeneficiary, baseCampaign, [], 'https://exemple.com/qr');
    expect(content.goalCents).toBe(500000);
  });

  it('ignore hideAmounts pour un club (pas de champ équivalent sur clubs)', () => {
    const clubBeneficiary: PosterBeneficiaryInput = {
      kind: 'club',
      name: 'Club des Corsaires',
      imageUrl: null,
      bodyText: null,
      hideAmounts: true,
    };
    const content = buildPosterContent(clubBeneficiary, baseCampaign, [], 'https://exemple.com/qr');
    expect(content.goalCents).toBe(500000);
  });

  it('ne masque jamais le prix des packs, même si hideAmounts est vrai (prix public du catalogue)', () => {
    const packs = [{ name: 'Pack Bronze', priceCents: 2500, creditCents: 1000 }];
    const content = buildPosterContent({ ...baseBeneficiary, hideAmounts: true }, baseCampaign, packs, 'https://exemple.com/qr');
    expect(content.packs).toEqual(packs);
  });

  it('passe tel quel un photoUrl déjà masqué en amont (null) -- ne le restaure jamais', () => {
    const content = buildPosterContent(
      { ...baseBeneficiary, imageUrl: null },
      baseCampaign,
      [],
      'https://exemple.com/qr',
    );
    expect(content.photoUrl).toBeNull();
  });

  it('conserve le nom déjà masqué (ex. "Prénom I." si hide_last_name) sans le modifier', () => {
    const content = buildPosterContent(
      { ...baseBeneficiary, name: 'Thomas T.' },
      baseCampaign,
      [],
      'https://exemple.com/qr',
    );
    expect(content.beneficiaryName).toBe('Thomas T.');
  });
});

describe('generatePosterPdfBuffer -- génération PDF dans les 3 formats', () => {
  it.each(POSTER_FORMATS)('produit un PDF valide et non vide pour le format "%s"', async (format) => {
    const content = buildPosterContent(
      baseBeneficiary,
      baseCampaign,
      [{ name: 'Pack Bronze', priceCents: 2500, creditCents: 1000 }],
      'https://exemple.com/api/qr/abc12345',
    );
    const buffer = await generatePosterPdfBuffer(content, format);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('fonctionne sans aucune photo (photoImageBytes absent)', async () => {
    const content = buildPosterContent({ ...baseBeneficiary, imageUrl: null }, baseCampaign, [], 'https://exemple.com/qr');
    const buffer = await generatePosterPdfBuffer(content, 'lettre');
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('intègre une photo PNG valide sans erreur', async () => {
    const content = buildPosterContent(baseBeneficiary, baseCampaign, [], 'https://exemple.com/qr');
    const buffer = await generatePosterPdfBuffer(content, 'carre', PNG_1X1);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('ignore silencieusement une image corrompue/non reconnue (ne plante jamais la génération)', async () => {
    const content = buildPosterContent(baseBeneficiary, baseCampaign, [], 'https://exemple.com/qr');
    const garbage = Buffer.from('ceci n’est pas une image', 'utf-8');
    const buffer = await generatePosterPdfBuffer(content, 'story', garbage);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('fonctionne avec une liste de packs vide', async () => {
    const content = buildPosterContent(baseBeneficiary, baseCampaign, [], 'https://exemple.com/qr');
    const buffer = await generatePosterPdfBuffer(content, 'lettre');
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('fonctionne avec un objectif et une date de fin nuls (aucune section masquée ne fait échouer le rendu)', async () => {
    const content = buildPosterContent(
      { ...baseBeneficiary, hideAmounts: true },
      { ...baseCampaign, endsAt: null },
      [],
      'https://exemple.com/qr',
    );
    expect(content.goalCents).toBeNull();
    const buffer = await generatePosterPdfBuffer(content, 'lettre');
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('découpe un message personnel long en plusieurs lignes sans erreur', async () => {
    const longMessage =
      'Bonjour à tous, je participe cette saison à la collecte de fonds pour mon équipe et chaque contribution compte énormément pour nous permettre de couvrir les frais d’inscription, l’équipement et les déplacements pour les tournois.';
    const content = buildPosterContent({ ...baseBeneficiary, bodyText: longMessage }, baseCampaign, [], 'https://exemple.com/qr');
    const buffer = await generatePosterPdfBuffer(content, 'story');
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });
});
