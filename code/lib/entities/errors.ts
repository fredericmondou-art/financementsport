/**
 * Erreurs partagées par `lib/entities/*.ts`, mappées vers des codes HTTP
 * dans les routes (`app/api/.../route.ts`). Centralisées ici pour que les
 * routes n'aient pas à connaître les détails de chaque module métier.
 */

export class PermissionError extends Error {
  constructor(message = "Action non autorisée.") {
    super(message);
    this.name = 'PermissionError';
  }
}

export class NotFoundError extends Error {
  constructor(message = "Ressource introuvable.") {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Violation d'une règle métier (ex: athlète mineur sans guardian_id). */
export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}
