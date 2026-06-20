import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { getTeam, updateTeam, createSupabaseTeamRepo } from '@/lib/entities/teams';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: { teamId: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServerClient();
    const team = await getTeam(user, params.teamId, createSupabaseTeamRepo(supabase));
    return NextResponse.json({ team });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { teamId: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const team = await updateTeam(user, params.teamId, body, createSupabaseTeamRepo(supabase));
    return NextResponse.json({ team });
  } catch (error) {
    return toErrorResponse(error);
  }
}
