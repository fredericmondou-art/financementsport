import { describe, expect, it } from 'vitest';
import { can, canEditHiddenAthleteFields, type AuthUser } from '@/lib/auth/permissions';

const client: AuthUser = { id: 'user-client-1', role: 'client', memberships: [] };
const otherClient: AuthUser = { id: 'user-client-2', role: 'client', memberships: [] };

const teamManager: AuthUser = {
  id: 'user-tm-1',
  role: 'team_manager',
  memberships: [{ role: 'team_manager', clubId: null, teamId: 'team-u11' }],
};

const clubAdmin: AuthUser = {
  id: 'user-ca-1',
  role: 'club_admin',
  memberships: [{ role: 'club_admin', clubId: 'club-corsaires', teamId: null }],
};

const platformAdmin: AuthUser = { id: 'user-admin-1', role: 'platform_admin', memberships: [] };

const accountant: AuthUser = { id: 'user-acc-1', role: 'accounting', memberships: [] };

describe('can() — visiteur non authentifié (achat invité)', () => {
  it('ne lève jamais d’exception et refuse toujours (le panier invité ne passe pas par ce système)', () => {
    expect(() => can(null, 'read', { type: 'order', ownerId: 'user-client-1' })).not.toThrow();
    expect(can(null, 'read', { type: 'order', ownerId: 'user-client-1' })).toBe(false);
    expect(can(null, 'create', { type: 'product' })).toBe(false);
  });
});

describe('can() — client lit ses propres commandes', () => {
  it('autorise un client à lire sa propre commande', () => {
    expect(can(client, 'read', { type: 'order', ownerId: client.id })).toBe(true);
  });

  it('refuse à un client la lecture de la commande d’un autre client', () => {
    expect(can(client, 'read', { type: 'order', ownerId: otherClient.id })).toBe(false);
  });

  it('refuse à un client la lecture d’une commande invité (ownerId null)', () => {
    expect(can(client, 'read', { type: 'order', ownerId: null })).toBe(false);
  });
});

describe('can() — team_manager lit les campagnes de son équipe', () => {
  it('autorise la lecture d’une campagne de sa propre équipe', () => {
    expect(can(teamManager, 'read', { type: 'campaign', clubId: null, teamId: 'team-u11' })).toBe(
      true,
    );
  });

  it('refuse la lecture d’une campagne d’une autre équipe', () => {
    expect(can(teamManager, 'read', { type: 'campaign', clubId: null, teamId: 'team-u9' })).toBe(
      false,
    );
  });

  it('refuse à un team_manager d’écrire un produit', () => {
    expect(can(teamManager, 'create', { type: 'product' })).toBe(false);
  });
});

describe('can() — club_admin lit les campagnes de son club', () => {
  it('autorise la lecture d’une campagne rattachée à son club', () => {
    expect(
      can(clubAdmin, 'read', { type: 'campaign', clubId: 'club-corsaires', teamId: null }),
    ).toBe(true);
  });

  it('refuse la lecture d’une campagne d’un autre club', () => {
    expect(can(clubAdmin, 'read', { type: 'campaign', clubId: 'club-rival', teamId: null })).toBe(
      false,
    );
  });
});

describe('can() — platform_admin écrit les produits', () => {
  it('autorise platform_admin à créer un produit', () => {
    expect(can(platformAdmin, 'create', { type: 'product' })).toBe(true);
  });

  it('refuse à un client de créer un produit', () => {
    expect(can(client, 'create', { type: 'product' })).toBe(false);
  });

  it('platform_admin a accès total, y compris hors des cas listés explicitement', () => {
    expect(can(platformAdmin, 'delete', { type: 'payout' })).toBe(true);
  });
});

describe('can() — deny-by-default sur les combinaisons non prévues', () => {
  it('refuse à un athlète l’accès à une commande qui n’est pas la sienne', () => {
    const athlete: AuthUser = { id: 'user-ath-1', role: 'athlete', memberships: [] };
    expect(can(athlete, 'read', { type: 'order', ownerId: otherClient.id })).toBe(false);
  });

  it('autorise accounting à lire les versements (payout)', () => {
    expect(can(accountant, 'read', { type: 'payout' })).toBe(true);
  });

  it('refuse à accounting de modifier les versements', () => {
    expect(can(accountant, 'update', { type: 'payout' })).toBe(false);
  });
});

// Tâche 1.1 — extension club / équipe / athlète, alignée EXACTEMENT sur les
// policies RLS déjà déployées (migration 0003 : `clubs_insert_admin`,
// `teams_insert`, `teams_delete`, `athletes_insert`, `manages_athlete`). Voir
// docs/DECISIONS.md pour la correction du modèle club/équipe (pas
// d'auto-service).
describe('can() — club : créer un club est réservé à platform_admin', () => {
  it('refuse à un client de créer un club', () => {
    expect(can(client, 'create', { type: 'club', id: null })).toBe(false);
  });

  it('refuse à un club_admin (déjà admin d’un autre club) de créer un club', () => {
    expect(can(clubAdmin, 'create', { type: 'club', id: null })).toBe(false);
  });

  it('autorise platform_admin à créer un club', () => {
    expect(can(platformAdmin, 'create', { type: 'club', id: null })).toBe(true);
  });
});

describe('can() — club : lecture/mise à jour scopées au club_admin', () => {
  it('autorise le club_admin scopé à lire/modifier son club', () => {
    expect(can(clubAdmin, 'read', { type: 'club', id: 'club-corsaires' })).toBe(true);
    expect(can(clubAdmin, 'update', { type: 'club', id: 'club-corsaires' })).toBe(true);
  });

  it('refuse au club_admin de lire/modifier un autre club', () => {
    expect(can(clubAdmin, 'read', { type: 'club', id: 'club-rival' })).toBe(false);
    expect(can(clubAdmin, 'update', { type: 'club', id: 'club-rival' })).toBe(false);
  });

  it('refuse la suppression d’un club au club_admin (réservée à platform_admin, `clubs_delete_admin`)', () => {
    expect(can(clubAdmin, 'delete', { type: 'club', id: 'club-corsaires' })).toBe(false);
  });
});

describe('can() — équipe : créer une équipe', () => {
  it('autorise le club_admin scopé à créer une équipe dans son club', () => {
    expect(can(clubAdmin, 'create', { type: 'team', id: null, clubId: 'club-corsaires' })).toBe(
      true,
    );
  });

  it('refuse au club_admin de créer une équipe dans un autre club', () => {
    expect(can(clubAdmin, 'create', { type: 'team', id: null, clubId: 'club-rival' })).toBe(false);
  });

  it('refuse à un client de créer une équipe indépendante (clubId null réservé à platform_admin)', () => {
    expect(can(client, 'create', { type: 'team', id: null, clubId: null })).toBe(false);
  });

  it('refuse même à un club_admin (d’un autre club) de créer une équipe indépendante', () => {
    expect(can(clubAdmin, 'create', { type: 'team', id: null, clubId: null })).toBe(false);
  });

  it('autorise platform_admin à créer une équipe indépendante', () => {
    expect(can(platformAdmin, 'create', { type: 'team', id: null, clubId: null })).toBe(true);
  });
});

describe('can() — équipe : lecture/mise à jour/suppression', () => {
  it('autorise le team_manager à lire/modifier sa propre équipe', () => {
    expect(can(teamManager, 'read', { type: 'team', id: 'team-u11', clubId: null })).toBe(true);
    expect(can(teamManager, 'update', { type: 'team', id: 'team-u11', clubId: null })).toBe(true);
  });

  it('refuse au team_manager la suppression de sa propre équipe (`teams_delete` = platform_admin ou club_admin uniquement)', () => {
    expect(can(teamManager, 'delete', { type: 'team', id: 'team-u11', clubId: null })).toBe(false);
  });

  it('autorise le club_admin à lire/modifier/supprimer une équipe de son club (cascade)', () => {
    expect(can(clubAdmin, 'read', { type: 'team', id: 'team-x', clubId: 'club-corsaires' })).toBe(
      true,
    );
    expect(
      can(clubAdmin, 'delete', { type: 'team', id: 'team-x', clubId: 'club-corsaires' }),
    ).toBe(true);
  });

  it('refuse au team_manager la lecture d’une autre équipe', () => {
    expect(can(teamManager, 'read', { type: 'team', id: 'team-u9', clubId: null })).toBe(false);
  });
});

describe('can() — athlète : créer (pas de cascade club_admin à l’insertion)', () => {
  const guardian: AuthUser = { id: 'user-guardian-1', role: 'client', memberships: [] };

  it('autorise un tuteur à inscrire son propre athlète', () => {
    expect(
      can(guardian, 'create', {
        type: 'athlete',
        id: null,
        teamId: null,
        clubId: null,
        guardianId: guardian.id,
        athleteUserId: null,
      }),
    ).toBe(true);
  });

  it('autorise le team_manager direct de l’équipe visée à inscrire un athlète', () => {
    expect(
      can(teamManager, 'create', {
        type: 'athlete',
        id: null,
        teamId: 'team-u11',
        clubId: null,
        guardianId: null,
        athleteUserId: null,
      }),
    ).toBe(true);
  });

  it('refuse au club_admin (sans être team_manager direct) d’inscrire un athlète via la cascade club — `athletes_insert` n’inclut pas manages_club', () => {
    expect(
      can(clubAdmin, 'create', {
        type: 'athlete',
        id: null,
        teamId: 'team-x',
        clubId: 'club-corsaires',
        guardianId: null,
        athleteUserId: null,
      }),
    ).toBe(false);
  });

  it('refuse à un tiers sans lien ni scope d’inscrire un athlète', () => {
    expect(
      can(otherClient, 'create', {
        type: 'athlete',
        id: null,
        teamId: null,
        clubId: null,
        guardianId: 'user-guardian-1',
        athleteUserId: null,
      }),
    ).toBe(false);
  });
});

describe('can() — athlète : lecture/mise à jour/suppression (cascade club_admin incluse)', () => {
  it('autorise le club_admin via la cascade club sur la lecture/mise à jour d’un athlète existant', () => {
    expect(
      can(clubAdmin, 'update', {
        type: 'athlete',
        id: 'athlete-1',
        teamId: 'team-x',
        clubId: 'club-corsaires',
        guardianId: null,
        athleteUserId: null,
      }),
    ).toBe(true);
  });

  it('autorise l’athlète majeur lui-même à lire/modifier son propre profil', () => {
    expect(
      can(client, 'update', {
        type: 'athlete',
        id: 'athlete-1',
        teamId: null,
        clubId: null,
        guardianId: null,
        athleteUserId: client.id,
      }),
    ).toBe(true);
  });

  it('refuse à un tiers sans lien la lecture d’un athlète', () => {
    expect(
      can(otherClient, 'read', {
        type: 'athlete',
        id: 'athlete-1',
        teamId: null,
        clubId: null,
        guardianId: 'user-guardian-1',
        athleteUserId: null,
      }),
    ).toBe(false);
  });
});

describe('canEditHiddenAthleteFields() — hide_* et parental_consent_at réservés au tuteur/athlète/admin', () => {
  it('autorise le tuteur', () => {
    expect(
      canEditHiddenAthleteFields(client, { guardianId: client.id, athleteUserId: null }),
    ).toBe(true);
  });

  it('autorise l’athlète majeur lui-même', () => {
    expect(
      canEditHiddenAthleteFields(client, { guardianId: null, athleteUserId: client.id }),
    ).toBe(true);
  });

  it('autorise platform_admin', () => {
    expect(
      canEditHiddenAthleteFields(platformAdmin, { guardianId: 'autre', athleteUserId: null }),
    ).toBe(true);
  });

  it('refuse au team_manager de l’équipe (même s’il peut par ailleurs modifier l’athlète)', () => {
    expect(
      canEditHiddenAthleteFields(teamManager, { guardianId: 'autre', athleteUserId: null }),
    ).toBe(false);
  });

  it('refuse au club_admin', () => {
    expect(
      canEditHiddenAthleteFields(clubAdmin, { guardianId: 'autre', athleteUserId: null }),
    ).toBe(false);
  });

  it('refuse à un visiteur non authentifié', () => {
    expect(canEditHiddenAthleteFields(null, { guardianId: null, athleteUserId: null })).toBe(
      false,
    );
  });
});
