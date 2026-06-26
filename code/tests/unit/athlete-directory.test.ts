import { describe, expect, it } from 'vitest';
import { filterAthleteDirectory } from '@/lib/public/athlete-directory';
import type { PublicAthleteRow } from '@/lib/public/profile';

function athlete(overrides: Partial<PublicAthleteRow>): PublicAthleteRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    team_id: null,
    first_name: 'Prénom',
    last_name: 'Nom',
    display_name: 'Prénom Nom',
    slug: 'prenom-nom',
    sport: null,
    city: null,
    photo_url: null,
    personal_message: null,
    hide_amounts: false,
    show_team_only: false,
    ...overrides,
  };
}

describe('filterAthleteDirectory', () => {
  const rows = [
    athlete({ id: '1', display_name: 'Thomas Gagnon', sport: 'Hockey', city: 'Québec' }),
    athlete({ id: '2', display_name: 'Léa Bouchard', sport: 'Natation', city: 'Montréal' }),
    athlete({ id: '3', display_name: 'Sam Roy', sport: 'Hockey', city: 'Trois-Rivières' }),
  ];

  it('renvoie l’annuaire complet quand la recherche est vide ou absente', () => {
    expect(filterAthleteDirectory(rows, undefined)).toEqual(rows);
    expect(filterAthleteDirectory(rows, '')).toEqual(rows);
    expect(filterAthleteDirectory(rows, '   ')).toEqual(rows);
  });

  it('filtre sur le nom affiché, insensible à la casse', () => {
    expect(filterAthleteDirectory(rows, 'thomas')).toEqual([rows[0]]);
    expect(filterAthleteDirectory(rows, 'GAGNON')).toEqual([rows[0]]);
  });

  it('filtre sur le sport', () => {
    expect(filterAthleteDirectory(rows, 'hockey')).toEqual([rows[0], rows[2]]);
  });

  it('filtre sur la ville', () => {
    expect(filterAthleteDirectory(rows, 'montréal')).toEqual([rows[1]]);
  });

  it('ne renvoie rien si aucun champ ne correspond', () => {
    expect(filterAthleteDirectory(rows, 'basketball')).toEqual([]);
  });
});
