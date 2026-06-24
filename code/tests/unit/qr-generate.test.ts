/**
 * Tests unitaires (Tâche 1.5.1) : génération d'image de code QR (PNG/PDF).
 * Vérifie le format réel des octets produits (en-têtes PNG/PDF), pas
 * seulement "ne plante pas" — c'est la garantie minimale qu'un fichier
 * téléchargé sera effectivement ouvrable.
 */
import { describe, expect, it } from 'vitest';
import { generateQrPdfBuffer, generateQrPngBuffer } from '@/lib/qr/generate';

const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('generateQrPngBuffer', () => {
  it('produit un buffer PNG valide et non vide pour une URL', async () => {
    const buffer = await generateQrPngBuffer('https://exemple.com/thomas-tremblay');
    expect(buffer.length).toBeGreaterThan(0);
    expect(Array.from(buffer.subarray(0, PNG_MAGIC_BYTES.length))).toEqual(PNG_MAGIC_BYTES);
  });

  it('produit un buffer PNG valide pour chaque type de cible (athlète/équipe/club/campagne/produit)', async () => {
    const urls = [
      'https://exemple.com/thomas-tremblay',
      'https://exemple.com/team/u11-hockey',
      'https://exemple.com/club/corsaires',
      'https://exemple.com/campagnes/campagne-1',
      'https://exemple.com/boutique',
    ];
    for (const url of urls) {
      const buffer = await generateQrPngBuffer(url);
      expect(buffer.length).toBeGreaterThan(0);
      expect(Array.from(buffer.subarray(0, PNG_MAGIC_BYTES.length))).toEqual(PNG_MAGIC_BYTES);
    }
  });

  it('lève une erreur explicite pour une URL vide', async () => {
    await expect(generateQrPngBuffer('')).rejects.toThrow(/URL non vide est requise/);
  });
});

describe('generateQrPdfBuffer', () => {
  it('produit un PDF valide (en-tête %PDF) et non vide', async () => {
    const buffer = await generateQrPdfBuffer({ url: 'https://exemple.com/thomas-tremblay' });
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('inclut un titre optionnel sans faire échouer la génération', async () => {
    const buffer = await generateQrPdfBuffer({
      url: 'https://exemple.com/team/u11-hockey',
      title: 'Les Faucons U11',
    });
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('lève une erreur explicite pour une URL vide (réutilise generateQrPngBuffer)', async () => {
    await expect(generateQrPdfBuffer({ url: '' })).rejects.toThrow(/URL non vide est requise/);
  });
});
