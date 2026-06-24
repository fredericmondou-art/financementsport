/**
 * GET /api/qr/[code]/png — téléchargement de l'image PNG d'un code QR
 * (Tâche 1.5.1, action « Télécharger en PNG » de la page
 * `app/(portails)/campagnes/[campaignId]/qr`).
 *
 * Contrairement à `app/api/qr/[code]/route.ts` (résolution PUBLIQUE d'un
 * scan), cet endpoint sert au RESPONSABLE qui télécharge -- client serveur
 * standard (clé anon, RLS appliquée) : la policy `qr_codes_scoped`
 * (migration 0003, section 11 -- `manages_qr_target`) limite déjà l'accès au
 * gérant/admin concerné, exactement comme `/qr` lit la même ligne. Aucune
 * vérification de rôle dupliquée ici (CLAUDE.md : la policy RLS est la
 * source de vérité, pas une re-déclaration côté application).
 *
 * Le PNG encode l'URL TRAÇABLE (`/api/qr/[code]`, pas l'URL publique finale
 * directement) -- décision autonome (voir docs/DECISIONS.md, Tâche 1.5.1) :
 * sans cela, un scan du QR imprimé ne passerait jamais par la route qui
 * incrémente `scan_count`, ce qui viderait de son sens le compteur de scans
 * exigé par le cahier.
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { generateQrPngBuffer } from '@/lib/qr/generate';
import { getPublicAppUrl } from '@/lib/env';

interface RouteParams {
  params: { code: string };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('qr_codes')
    .select('code')
    .eq('code', params.code)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    notFound();
  }

  const trackableUrl = `${getPublicAppUrl()}/api/qr/${params.code}`;
  const png = await generateQrPngBuffer(trackableUrl);

  // `Response` (lib.dom) ne connaît pas le type `Buffer` de Node -- une vue
  // `Uint8Array` sur les mêmes octets satisfait `BodyInit` sans copie.
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qr-${params.code}.png"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
