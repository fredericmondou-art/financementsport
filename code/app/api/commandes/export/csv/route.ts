/**
 * GET /api/commandes/export/csv -- export CSV des commandes (Tâche 1.5.11).
 * Mêmes paramètres de requête que `app/(admin)/commandes/export/page.tsx`
 * (`campaignId`, `teamId`, `status`, `periodStart`, `periodEnd`), passés au
 * MÊME `parseOrderExportFilters` -- garantit que ce que la page affiche est
 * exactement ce que ce fichier contient (critère d'acceptation explicite).
 *
 * Garde de rôle EXPLICITE ici (contrairement à `rapport/csv/route.ts`,
 * Tâche 1.5.9, qui se contente de la RLS) : `orders`/`order_credits` restent
 * lisibles par d'autres rôles via leurs propres policies (ex. un client lit
 * SES commandes), donc la RLS seule ne suffit pas à bloquer cette route pour
 * un rôle non autorisé à un export EN MASSE -- d'où `canExportOrders`,
 * vérifié avant tout accès aux données (`notFound()` -> 404, même convention
 * que `app/(admin)/commandes/export/page.tsx` : ne pas révéler l'existence
 * de la route à un rôle non autorisé via un message "accès refusé" distinct).
 */
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { canExportOrders, createSupabaseOrderExportRepo, loadOrderExportData, parseOrderExportFilters } from '@/lib/export/orders';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || !canExportOrders(user.role)) {
    notFound();
  }

  const url = new URL(request.url);
  const filters = parseOrderExportFilters({
    campaignId: url.searchParams.get('campaignId') ?? undefined,
    teamId: url.searchParams.get('teamId') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    periodStart: url.searchParams.get('periodStart') ?? undefined,
    periodEnd: url.searchParams.get('periodEnd') ?? undefined,
  });

  const supabase = createSupabaseServerClient();
  const { csv } = await loadOrderExportData(filters, createSupabaseOrderExportRepo(supabase), supabase);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="export-commandes.csv"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
