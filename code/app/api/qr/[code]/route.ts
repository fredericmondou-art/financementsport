/**
 * GET /api/qr/[code] — résolution d'un scan de QR physique (Tâche 1.5.1).
 *
 * Endpoint PUBLIC (aucune session attendue — un visiteur scanne un code
 * imprimé sur une affiche/un dépliant). Lit et incrémente `scan_count` en UNE
 * seule opération atomique (`resolve_and_count_qr_scan`, migration 0012),
 * puis redirige vers la destination résolue par
 * `lib/qr/resolve-target.ts#resolveQrScanPath` (jamais d'exception côté
 * client : un code inconnu/expiré/lié à une campagne non active retombe
 * toujours sur `redirect_url` puis `/boutique`).
 *
 * Client SERVICE_ROLE obligatoire ici (commentaire RLS, migration 0003,
 * section 11 : « la résolution publique d'un QR scanné passe par une route
 * serveur avec le client service_role, jamais par anon directement »).
 *
 * L'échec de l'incrémentation ne doit JAMAIS bloquer la redirection (règle
 * explicite du cahier) : `resolve_and_count_qr_scan` fait les deux en une
 * seule requête SQL, donc en pratique un échec de l'UPDATE équivaut à
 * "code introuvable" -- traité identiquement (redirection de repli), ce qui
 * respecte déjà cette règle sans bloc try/catch séparé.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/db/client';
import { createSupabaseQrResolveRepo, resolveQrScanPath } from '@/lib/qr/resolve-target';
import { getPublicAppUrl } from '@/lib/env';

interface RouteParams {
  params: { code: string };
}

interface ScanRow {
  target_type: string;
  target_id: string | null;
  redirect_url: string | null;
  expires_at: string | null;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase.rpc('resolve_and_count_qr_scan', { p_code: params.code });
  // Une erreur RPC (panne DB, etc.) ne doit jamais laisser un visiteur en
  // scan sans destination -- on retombe sur la boutique plutôt que de
  // lever une 500.
  const row = (error ? null : ((data as ScanRow[] | null)?.[0] ?? null)) satisfies ScanRow | null;

  const path = row
    ? await resolveQrScanPath(
        {
          targetType: row.target_type,
          targetId: row.target_id,
          redirectUrl: row.redirect_url,
          expiresAt: row.expires_at,
        },
        createSupabaseQrResolveRepo(supabase),
      )
    : '/boutique';

  const destination = path.startsWith('http') ? path : `${getPublicAppUrl()}${path}`;
  return NextResponse.redirect(destination, { status: 302 });
}
