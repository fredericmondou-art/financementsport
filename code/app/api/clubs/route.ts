/**
 * Route API club (Tâche 1.1). Mince : authentification + délégation à
 * `lib/entities/clubs.ts` + traduction d'erreur (CLAUDE.md section 6 — la
 * logique métier vit dans `lib/`, pas ici).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { createClub, createSupabaseClubRepo } from '@/lib/entities/clubs';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const club = await createClub(user, body, createSupabaseClubRepo(supabase));
    return NextResponse.json({ club }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
