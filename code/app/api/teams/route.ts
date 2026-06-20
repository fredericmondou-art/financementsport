import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { createTeam, createSupabaseTeamRepo } from '@/lib/entities/teams';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const team = await createTeam(user, body, createSupabaseTeamRepo(supabase));
    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
