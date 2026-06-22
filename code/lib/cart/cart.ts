/**
 * Panier (Tâche 1.4) : récupération/création, contrôle d'accès.
 *
 * Même séparation que `lib/entities/*.ts`/`lib/catalog/products.ts` :
 * logique métier pure et testable, séparée de l'I/O via `CartRepo` injecté
 * (CLAUDE.md section 6).
 *
 * Contrôle d'accès volontairement SANS `can()` : comme documenté dans
 * `lib/auth/permissions.ts` ("le panier invité passe par un identifiant de
 * session géré ailleurs, pas par ce système de rôles"), un panier connecté
 * est comparé à `user.id`, un panier invité à un `session_token` — jamais de
 * croisement entre les deux (`assertCartOwnership`). `platform_admin` n'a PAS
 * de droit spécial ici : un panier n'est jamais un panier "admin" à gérer
 * pour un client, contrairement aux clubs/équipes/produits (décision
 * autonome, voir docs/DECISIONS.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CartsTable } from '@/lib/db/types';
import { createSupabaseServiceClient } from '@/lib/db/client';
import { BusinessRuleError, NotFoundError, PermissionError } from '@/lib/entities/errors';
import type { CartIdentity } from './types';

export type CartRow = CartsTable['Row'];

/**
 * Client à utiliser pour TOUTE opération sur `carts`/`cart_items`/
 * `cart_beneficiaries` (Tâche 1.4 — bug corrigé Tâche 1.4.6).
 *
 * Ces trois tables n'ont, par conception, aucune policy RLS `anon`
 * (migration `0003_rls_policies.sql`, section 12 : « Paniers invités... gérés
 * exclusivement par le serveur via le client service_role »). Le contrôle
 * d'accès réel passe par `assertCartOwnership` (comparaison applicative
 * `user_id`/`session_token`), jamais par Postgres RLS pour ces tables.
 *
 * Utiliser le client anon ici (`createSupabaseServerClient`) provoquait un
 * rejet RLS systématique en production dès qu'un panier invité (`user_id IS
 * NULL`) était inséré/lu, ainsi que lors du rattachement d'un panier invité
 * après connexion (la ligne reste `user_id IS NULL` jusqu'à l'attache) --
 * diagnostiqué via les logs Postgres production (`new row violates
 * row-level security policy for table "carts"`). Voir docs/DECISIONS.md.
 */
export function createCartDataClient(): SupabaseClient {
  return createSupabaseServiceClient();
}

/** Accès aux données `carts`, injecté pour permettre des tests
 * unitaires/d'intégration sans base de données réelle. */
export interface CartRepo {
  getCartById(id: string): Promise<CartRow | null>;
  /** Panier `status = 'open'` correspondant à l'identité (utilisateur OU
   * jeton de session invité, jamais les deux). `null` si aucun. */
  getOpenCartForIdentity(identity: CartIdentity): Promise<CartRow | null>;
  insertCart(identity: CartIdentity): Promise<CartRow>;
  attachCartToUser(cartId: string, userId: string): Promise<CartRow>;
  markCartAbandoned(cartId: string): Promise<void>;
  /** Panier ayant abouti à une commande payée (Tâche 1.5) -- distinct de
   * `markCartAbandoned` : un panier "converti" n'a pas été délaissé, il a
   * réussi. Évite qu'il soit relu comme panier `open` actif de l'identité. */
  markCartConverted(cartId: string): Promise<void>;
}

export function createSupabaseCartRepo(supabase: SupabaseClient): CartRepo {
  return {
    async getCartById(id) {
      const { data, error } = await supabase.from('carts').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as CartRow) ?? null;
    },
    async getOpenCartForIdentity(identity) {
      if (identity.userId !== null) {
        const { data, error } = await supabase
          .from('carts')
          .select('*')
          .eq('status', 'open')
          .eq('user_id', identity.userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data as CartRow) ?? null;
      }
      if (identity.sessionToken !== null) {
        const { data, error } = await supabase
          .from('carts')
          .select('*')
          .eq('status', 'open')
          .is('user_id', null)
          .eq('session_token', identity.sessionToken)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data as CartRow) ?? null;
      }
      return null;
    },
    async insertCart(identity) {
      const { data, error } = await supabase
        .from('carts')
        .insert({
          user_id: identity.userId,
          session_token: identity.userId === null ? identity.sessionToken : null,
          status: 'open',
        })
        .select()
        .single();
      if (error) throw error;
      return data as CartRow;
    },
    async attachCartToUser(cartId, userId) {
      const { data, error } = await supabase
        .from('carts')
        .update({ user_id: userId, session_token: null, updated_at: new Date().toISOString() })
        .eq('id', cartId)
        .select()
        .single();
      if (error) throw error;
      return data as CartRow;
    },
    async markCartAbandoned(cartId) {
      const { error } = await supabase
        .from('carts')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', cartId);
      if (error) throw error;
    },
    async markCartConverted(cartId) {
      const { error } = await supabase
        .from('carts')
        .update({ status: 'converted', updated_at: new Date().toISOString() })
        .eq('id', cartId);
      if (error) throw error;
    },
  };
}

/**
 * Seul point de contrôle d'accès à un panier. Un panier connecté
 * (`user_id !== null`) n'est accessible qu'à ce même `userId` ; un panier
 * invité (`user_id === null`) n'est accessible qu'avec le `sessionToken`
 * exact stocké sur la ligne — jamais l'inverse (un visiteur sans le bon
 * jeton ne doit pas pouvoir lire/modifier le panier d'un autre invité).
 */
export function assertCartOwnership(cart: CartRow, identity: CartIdentity): void {
  if (cart.user_id !== null) {
    if (identity.userId === null || identity.userId !== cart.user_id) {
      throw new PermissionError('Ce panier ne vous appartient pas.');
    }
    return;
  }
  if (
    identity.sessionToken === null ||
    cart.session_token === null ||
    identity.sessionToken !== cart.session_token
  ) {
    throw new PermissionError('Ce panier ne vous appartient pas.');
  }
}

/**
 * Retourne le panier ouvert de l'identité donnée, ou en crée un nouveau s'il
 * n'en existe pas. Point d'entrée principal pour "ajouter au panier" côté
 * route/page : appelé avant toute opération sur les articles/bénéficiaires.
 */
export async function getOrCreateCart(identity: CartIdentity, repo: CartRepo): Promise<CartRow> {
  if (identity.userId === null && identity.sessionToken === null) {
    throw new BusinessRuleError(
      'Un panier nécessite soit un utilisateur connecté, soit un jeton de session invité.',
    );
  }
  const existing = await repo.getOpenCartForIdentity(identity);
  if (existing) {
    return existing;
  }
  return repo.insertCart(identity);
}

/** Charge un panier par id et vérifie l'accès. Lève `NotFoundError` si le
 * panier n'existe pas, `PermissionError` s'il existe mais n'appartient pas
 * à `identity` — jamais l'inverse (ne pas révéler l'existence d'un panier
 * d'un tiers via le code d'erreur). */
export async function getCartForIdentity(
  cartId: string,
  identity: CartIdentity,
  repo: CartRepo,
): Promise<CartRow> {
  const cart = await repo.getCartById(cartId);
  if (!cart) {
    throw new NotFoundError('Panier introuvable.');
  }
  assertCartOwnership(cart, identity);
  return cart;
}
