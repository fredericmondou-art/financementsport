/**
 * Tests unitaires du rattachement des commandes invité à un compte
 * (Tâche 1.6.A2) : `attachGuestOrdersToUser`, logique pure avec repo en
 * mémoire injecté -- aucune base de données réelle (voir lib/orders/
 * attach-guest-orders.ts). Couvre les critères d'acceptation « rattachement
 * par e-mail correct » et « refuser l'inscription [donc ne rien rattacher]
 * n'affecte pas la commande » (a contrario : pas de courriel = pas d'appel
 * au repo, jamais une erreur).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { attachGuestOrdersToUser, type AttachGuestOrdersRepo } from '@/lib/orders/attach-guest-orders';

function createFakeRepo(countByEmail: Map<string, number>): {
  repo: AttachGuestOrdersRepo;
  calls: Array<{ guestEmail: string; userId: string }>;
} {
  const calls: Array<{ guestEmail: string; userId: string }> = [];
  const repo: AttachGuestOrdersRepo = {
    async attachOrdersByGuestEmail(guestEmail, userId) {
      calls.push({ guestEmail, userId });
      return countByEmail.get(guestEmail) ?? 0;
    },
  };
  return { repo, calls };
}

describe('attachGuestOrdersToUser', () => {
  const userId = randomUUID();

  it('rattache les commandes correspondant au courriel invité et retourne le nombre rattaché', async () => {
    const { repo, calls } = createFakeRepo(new Map([['parent@example.com', 2]]));

    const count = await attachGuestOrdersToUser('parent@example.com', userId, repo);

    expect(count).toBe(2);
    expect(calls).toEqual([{ guestEmail: 'parent@example.com', userId }]);
  });

  it("ne fait rien et n'appelle pas le repo quand il n'y a pas de courriel invité (compte créé hors parcours post-achat)", async () => {
    const { repo, calls } = createFakeRepo(new Map());

    const count = await attachGuestOrdersToUser(null, userId, repo);

    expect(count).toBe(0);
    expect(calls).toEqual([]);
  });

  it('retourne 0 sans erreur quand aucune commande ne correspond au courriel (cas normal, pas un échec)', async () => {
    const { repo } = createFakeRepo(new Map());

    const count = await attachGuestOrdersToUser('inconnu@example.com', userId, repo);

    expect(count).toBe(0);
  });
});
