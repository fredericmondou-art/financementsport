/**
 * GET /api/campagnes/[campaignId]/distribution/csv -- export CSV de la
 * liste de distribution (Tâche 1.5.4). Même posture RLS que les exports de
 * la Tâche 1.5.1/1.5.2 : client serveur standard (clé anon, RLS appliquée),
 * la policy `orders_select_campaign_managers` (migration 0014) limite déjà
 * la lecture au gérant/admin/logistique concerné -- aucune re-vérification
 * de rôle dupliquée ici.
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { buildDistributionList, createSupabaseDistributionRepo } from '@/lib/distribution/build-list';
import { buildDistributionCsv } from '@/lib/distribution/export';
import type { CampaignsTable } from '@/lib/db/types';

interface RouteParams {
  params: { campaignId: string };
}

type CampaignRow = CampaignsTable['Row'];

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const supabase = createSupabaseServerClient();
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  const campaign = campaignData as CampaignRow | null;
  if (!campaign) {
    notFound();
  }

  const { groups } = await buildDistributionList(
    campaign.id,
    campaign.team_id,
    createSupabaseDistributionRepo(supabase),
    supabase,
  );
  const csv = buildDistributionCsv(groups);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="distribution-${campaign.slug}.csv"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
