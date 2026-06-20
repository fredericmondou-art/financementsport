import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { getAthlete, updateAthlete, createSupabaseAthleteRepo } from '@/lib/entities/athletes';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: { athleteId: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServerClient();
    const athlete = await getAthlete(user, params.athleteId, createSupabaseAthleteRepo(supabase));
    return NextResponse.json({ athlete });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { athleteId: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const athlete = await updateAthlete(
      user,
      params.athleteId,
      body,
      createSupabaseAthleteRepo(supabase),
    );
    return NextResponse.json({ athlete });
  } catch (error) {
    return toErrorResponse(error);
  }
}
