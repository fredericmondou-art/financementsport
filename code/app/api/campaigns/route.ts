/**
 * Route API de création de campagne (Tâche 1.7). Même squelette que
 * `app/api/teams/route.ts` : authentification, délégation complète à la
 * couche `lib/`, traduction des erreurs via `toErrorResponse`. Surface REST
 * gardée pour un usage futur (app mobile, intégrations) en plus de
 * l'assistant `app/(portails)/campagnes/nouvelle` qui appelle `createCampaign`
 * directement (pas de round-trip HTTP interne, CLAUDE.md section 6).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { createCampaign, createSupabaseCampaignRepo } from '@/lib/campaigns/create-campaign';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const result = await createCampaign(user, body, createSupabaseCampaignRepo(supabase));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
