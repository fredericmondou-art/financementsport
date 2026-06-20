import { describe, expect, it } from 'vitest';
import { pickUniqueSlug, slugify } from '@/lib/slug';

describe('slugify()', () => {
  it('met en minuscules et remplace les espaces par des tirets', () => {
    expect(slugify('Thomas U11')).toBe('thomas-u11');
  });

  it('retire les accents/diacritiques', () => {
    expect(slugify('Les Corsaires de l’Évêché')).toBe('les-corsaires-de-l-eveche');
  });

  it('retire les tirets en début/fin et compresse les caractères spéciaux', () => {
    expect(slugify('  !!Équipe-Étoile!!  ')).toBe('equipe-etoile');
  });

  it('retourne "item" pour une entrée sans caractère alphanumérique', () => {
    expect(slugify('!!!')).toBe('item');
  });
});

describe('pickUniqueSlug() — collisions (critère d’acceptation Tâche 1.1)', () => {
  it('deux athlètes "Thomas U11" produisent deux slugs distincts', async () => {
    const taken = new Set<string>();
    const isTaken = async (candidate: string) => taken.has(candidate);

    const first = await pickUniqueSlug('Thomas U11', isTaken);
    taken.add(first);
    const second = await pickUniqueSlug('Thomas U11', isTaken);

    expect(first).toBe('thomas-u11');
    expect(second).toBe('thomas-u11-2');
    expect(first).not.toBe(second);
  });

  it('enchaîne les suffixes -2, -3, ... jusqu’à trouver un slug libre', async () => {
    const taken = new Set(['club-corsaires', 'club-corsaires-2', 'club-corsaires-3']);
    const isTaken = async (candidate: string) => taken.has(candidate);

    const slug = await pickUniqueSlug('Club Corsaires', isTaken);
    expect(slug).toBe('club-corsaires-4');
  });

  it('lève une erreur si aucun slug libre n’est trouvé sous maxAttempts', async () => {
    await expect(
      pickUniqueSlug('Toujours pris', async () => true, 3),
    ).rejects.toThrow(/Impossible de générer un slug unique/);
  });
});
