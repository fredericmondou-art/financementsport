/**
 * Route "keepalive" (2026-07-29) : maintient le projet Supabase actif pour
 * éviter sa mise en pause automatique (plan gratuit -> pause après ~7 jours
 * sans requête, ce qui casse le rendu serveur de l'accueil). Déclenchée par
 * un Vercel Cron quotidien (voir vercel.json). Fait une requête volontairement
 * minimale (une seule ligne) : le but est de "toucher" la base, pas de lire
 * des données.
 *
 * Sécurité : si la variable d'environnement CRON_SECRET est définie, on exige
 * l'en-tête `Authorization: Bearer <CRON_SECRET>` que Vercel Cron envoie
 * automatiquement. Si elle n'est pas définie, la route reste accessible mais
 * ne fait qu'une lecture publique anodine (aucune donnée sensible exposée).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authorization = request.headers.get('authorization');
    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createSupabaseServerClient();
    // Requête minimale : on sélectionne une seule ligne d'une table publique
    // pour réveiller/garder active la base. `head: true` ne renvoie aucune
    // donnée, seulement l'en-tête de réponse.
    const { error } = await supabase.from('products').select('id', { head: true }).limit(1);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
