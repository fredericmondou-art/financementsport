/**
 * GET /api/campagnes/[campaignId]/rapport/pdf -- export PDF du rapport
 * financier de campagne (Tâche 1.5.9). Voir `csv/route.ts` pour la posture
 * RLS (identique).
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseCampaignReportRepo, loadCampaignReport } from '@/lib/reports/campaign';
import { buildCampaignReportPdf } from '@/lib/reports/export';

interface RouteParams {
  params: { campaignId: string };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const supabase = createSupabaseServerClient();
  const report = await loadCampaignReport(params.campaignId, createSupabaseCampaignReportRepo(supabase));
  if (!report) {
    notFound();
  }

  const pdf = await buildCampaignReportPdf(report);

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapport-campagne-${report.campaignId}.pdf"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
