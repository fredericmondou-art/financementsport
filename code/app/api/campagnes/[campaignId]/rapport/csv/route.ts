/**
 * GET /api/campagnes/[campaignId]/rapport/csv -- export CSV du rapport
 * financier de campagne (Tâche 1.5.9). Même posture RLS que les exports de
 * la Tâche 1.5.4 : client serveur standard (clé anon, RLS appliquée) ;
 * `loadCampaignReport` retourne `null` si la campagne n'existe pas ou n'est
 * pas visible par l'appelant (RLS sur `campaigns`), traité comme 404 --
 * aucune re-vérification de rôle dupliquée ici.
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseCampaignReportRepo, loadCampaignReport } from '@/lib/reports/campaign';
import { buildCampaignReportCsv } from '@/lib/reports/export';

interface RouteParams {
  params: { campaignId: string };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const supabase = createSupabaseServerClient();
  const report = await loadCampaignReport(params.campaignId, createSupabaseCampaignReportRepo(supabase));
  if (!report) {
    notFound();
  }

  const csv = buildCampaignReportCsv(report);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rapport-campagne-${report.campaignId}.csv"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
