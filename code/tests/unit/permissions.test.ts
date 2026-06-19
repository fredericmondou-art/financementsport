import { describe, expect, it } from 'vitest';
import { can, type AuthUser } from '@/lib/auth/permissions';

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
