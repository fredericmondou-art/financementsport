/**
 * Tests unitaires de la machine de transitions de statut de commande
 * (Tâche 1.5.5, docs/prompts/phase-1-5.md) : `lib/orders/status.ts`.
 *
 * Le repo Supabase réel (`createSupabaseOrderStatusRepo`) n'est
 * volontairement PAS exercé ici -- fine couche RPC, pas de logique métier
 * (même convention que `tests/unit/distribution-build-list.test.ts`). Seules
 * les fonctions PURES sont testées : table de cas demandée par le cahier
 * ("la machine de statut accepte les transitions valides, rejette les
 * invalides").
 */
import { describe, expect, it } from 'vitest';
import {
  advanceOrderStatus,
  assertValidOrderStatusTransition,
  DELIVERY_STATUS_FLOW,
  getValidNextStatuses,
  InvalidOrderStatusTransitionError,
  isValidOrderStatusTransition,
  nextDeliveryStatus,
  notificationTemplateForStatus,
  orderStatusLabelFr,
  statusRequiresClientNotification,
  VALID_ORDER_STATUS_TRANSITIONS,
  type OrderStatusRepo,
} from '@/lib/orders/status';
import type { OrderStatus } from '@/lib/db/types';
import type { OrderRow } from '@/lib/distribution/build-list';

const ALL_STATUSES: OrderStatus[] = Object.keys(VALID_ORDER_STATUS_TRANSITIONS) as OrderStatus[];

describe('isValidOrderStatusTransition / assertValidOrderStatusTransition', () => {
  // Table de cas : chemin normal complet, sauts illégaux, statuts terminaux.
  const validCases: Array<[OrderStatus, OrderStatus]> = [
    ['payment_pending', 'paid'],
    ['payment_pending', 'cancelled'],
    ['payment_pending', 'error'],
    ['paid', 'preparing'],
    ['paid', 'cancelled'],
    ['paid', 'refunded'],
    ['preparing', 'ready'],
    ['preparing', 'cancelled'],
    ['ready', 'delivered_to_team'],
    ['ready', 'cancelled'],
    ['delivered_to_team', 'distributed'],
    ['distributed', 'completed'],
    ['distributed', 'partially_refunded'],
  ];

  it.each(validCases)('%s -> %s est une transition valide', (from, to) => {
    expect(isValidOrderStatusTransition(from, to)).toBe(true);
    expect(() => assertValidOrderStatusTransition(from, to)).not.toThrow();
  });

  // Exemple explicite du cahier : "interdire les sauts illégaux (ex.
  // payment_pending -> distributed)" + d'autres sauts représentatifs.
  const invalidCases: Array<[OrderStatus, OrderStatus]> = [
    ['payment_pending', 'distributed'],
    ['payment_pending', 'ready'],
    ['payment_pending', 'completed'],
    ['paid', 'distributed'],
    ['paid', 'delivered_to_team'],
    ['ready', 'distributed'], // saute delivered_to_team
    ['ready', 'completed'],
    ['delivered_to_team', 'completed'], // saute distributed
    ['delivered_to_team', 'ready'], // recul
    ['distributed', 'ready'], // recul
    ['completed', 'paid'], // statut terminal -> rien
    ['cancelled', 'paid'], // statut terminal -> rien
  ];

  it.each(invalidCases)('%s -> %s est une transition invalide (rejetée)', (from, to) => {
    expect(isValidOrderStatusTransition(from, to)).toBe(false);
    expect(() => assertValidOrderStatusTransition(from, to)).toThrow(InvalidOrderStatusTransitionError);
  });

  it('le message d\'erreur est clair et nomme les deux statuts (en français)', () => {
    try {
      assertValidOrderStatusTransition('payment_pending', 'distributed');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOrderStatusTransitionError);
      const err = error as InvalidOrderStatusTransitionError;
      expect(err.from).toBe('payment_pending');
      expect(err.to).toBe('distributed');
      expect(err.message).toContain('Paiement en attente');
      expect(err.message).toContain('Distribuée');
    }
  });

  it('tous les statuts terminaux du flux normal ont une liste de transitions vide', () => {
    for (const status of ['completed', 'cancelled', 'refunded', 'partially_refunded', 'error'] as OrderStatus[]) {
      expect(getValidNextStatuses(status)).toEqual([]);
    }
  });

  it('tous les statuts connus ont une entrée dans la table (aucun statut oublié)', () => {
    expect(ALL_STATUSES).toHaveLength(11);
    for (const status of ALL_STATUSES) {
      expect(VALID_ORDER_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('orderStatusLabelFr', () => {
  it('fournit un libellé français pour chacun des 11 statuts', () => {
    for (const status of ALL_STATUSES) {
      expect(orderStatusLabelFr(status)).toBeTruthy();
    }
  });
});

describe('DELIVERY_STATUS_FLOW / nextDeliveryStatus', () => {
  it('contient exactement les 4 étapes de la livraison groupée, dans l\'ordre', () => {
    expect(DELIVERY_STATUS_FLOW).toEqual(['ready', 'delivered_to_team', 'distributed', 'completed']);
  });

  it('renvoie la prochaine étape pour chaque statut du flux, sauf le dernier', () => {
    expect(nextDeliveryStatus('ready')).toBe('delivered_to_team');
    expect(nextDeliveryStatus('delivered_to_team')).toBe('distributed');
    expect(nextDeliveryStatus('distributed')).toBe('completed');
    expect(nextDeliveryStatus('completed')).toBeNull();
  });

  it('renvoie null pour un statut hors flux de livraison', () => {
    expect(nextDeliveryStatus('payment_pending')).toBeNull();
    expect(nextDeliveryStatus('cancelled')).toBeNull();
  });
});

describe('statusRequiresClientNotification / notificationTemplateForStatus', () => {
  it('seuls "distributed" et "completed" déclenchent une notification (cahier, Tâche 1.5.5)', () => {
    for (const status of ALL_STATUSES) {
      const expected = status === 'distributed' || status === 'completed';
      expect(statusRequiresClientNotification(status)).toBe(expected);
    }
  });

  it('le gabarit correspond au statut notifiable', () => {
    expect(notificationTemplateForStatus('distributed')).toBe('order_distributed');
    expect(notificationTemplateForStatus('completed')).toBe('order_completed');
  });

  it('lève une erreur de programmation si appelée pour un statut non notifiable', () => {
    expect(() => notificationTemplateForStatus('ready')).toThrow();
  });
});

describe('advanceOrderStatus (orchestration avec un repo simulé)', () => {
  function makeFakeRepo(): { repo: OrderStatusRepo; calls: Array<{ orderId: string; newStatus: OrderStatus }> } {
    const calls: Array<{ orderId: string; newStatus: OrderStatus }> = [];
    const repo: OrderStatusRepo = {
      async advanceOrderStatus(orderId, newStatus) {
        calls.push({ orderId, newStatus });
        return { id: orderId, status: newStatus } as OrderRow;
      },
    };
    return { repo, calls };
  }

  it('valide la transition CÔTÉ TYPESCRIPT avant d\'appeler le repo (pas d\'aller-retour réseau pour un cas évidemment invalide)', async () => {
    const { repo, calls } = makeFakeRepo();
    await expect(advanceOrderStatus(repo, 'payment_pending', 'order-1', 'distributed')).rejects.toThrow(
      InvalidOrderStatusTransitionError,
    );
    expect(calls).toHaveLength(0);
  });

  it('appelle le repo (donc la fonction Postgres gardée) pour une transition valide', async () => {
    const { repo, calls } = makeFakeRepo();
    const result = await advanceOrderStatus(repo, 'ready', 'order-1', 'delivered_to_team');
    expect(calls).toEqual([{ orderId: 'order-1', newStatus: 'delivered_to_team' }]);
    expect(result.status).toBe('delivered_to_team');
  });
});
