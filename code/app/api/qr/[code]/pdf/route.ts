/**
 * GET /api/qr/[code]/pdf — téléchargement de l'image PDF (format lettre,
 * imprimable) d'un code QR (Tâche 1.5.1).
 *
 * Même logique d'accès que `app/api/qr/[code]/png/route.ts` (client serveur
 * standard, RLS via `qr_codes_scoped`) ; voir ce fichier pour le détail des
 * décisions (URL traçable encodée, pas de re-vérification de rôle dupliquée).
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { generateQrPdfBuffer } from '@/lib/qr/generate';
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
  const pdf = await generateQrPdfBuffer({ url: trackableUrl });

  // Voir commentaire équivalent dans png/route.ts : `Buffer` -> `Uint8Array`
  // pour satisfaire le type `BodyInit` de `Response` (lib.dom).
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="qr-${params.code}.pdf"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
