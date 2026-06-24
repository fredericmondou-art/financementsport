/**
 * GET /api/campagnes/[campaignId]/distribution/pdf -- export PDF de la
 * liste de distribution (Tâche 1.5.4). Voir `csv/route.ts` pour la posture
 * RLS (identique).
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { buildDistributionList, createSupabaseDistributionRepo } from '@/lib/distribution/build-list';
import { buildDistributionPdf } from '@/lib/distribution/export';
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
  const pdf = await buildDistributionPdf(groups, campaign.name);

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="distribution-${campaign.slug}.pdf"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
