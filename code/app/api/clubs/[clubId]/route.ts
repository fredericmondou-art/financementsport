import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { getClub, updateClub, createSupabaseClubRepo } from '@/lib/entities/clubs';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: { clubId: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServerClient();
    const club = await getClub(user, params.clubId, createSupabaseClubRepo(supabase));
    return NextResponse.json({ club });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clubId: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const club = await updateClub(user, params.clubId, body, createSupabaseClubRepo(supabase));
    return NextResponse.json({ club });
  } catch (error) {
    return toErrorResponse(error);
  }
}
