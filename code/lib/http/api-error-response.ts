/**
 * Traduit une erreur levée par `lib/entities/*.ts` en réponse HTTP, pour les
 * routes `app/api/.../route.ts`. Centralisé pour que chaque route reste un
 * appel mince à la logique métier (CLAUDE.md section 6).
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from '@/lib/logger/logger';
import { BusinessRuleError, ConflictError, NotFoundError, PermissionError } from '@/lib/entities/errors';

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? 'Entrée invalide.', issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof BusinessRuleError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  // Erreur inattendue : journalisée en détail côté serveur, mais aucun
  // détail interne exposé au client (CLAUDE.md section 5).
  logger.error('Erreur interne non gérée dans une route API', {
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
}
