/**
 * Liste des campagnes éligibles au calcul des versements (Tâche 1.5.10,
 * docs/prompts/phase-1-5.md, section 37 -- « tâche financière sensible »).
 *
 * Décision autonome de routage (voir docs/DECISIONS.md, Tâche 1.5.10) : le
 * cahier ne liste que `app/(admin)/versements` (sans segment `[campaignId]`),
 * mais `platform_admin`/`accounting` voient déjà TOUTES les campagnes via RLS
 * (pas de scope `manages_X` comme pour team_manager/club_admin) -- il n'existe
 * par ailleurs aucune page admin existante listant les campagnes. Cette page
 * est donc le point d'entrée : liste des campagnes `closed`/`paid` (seuls
 * statuts éligibles au calcul, voir `CAMPAIGN_STATUSES_ELIGIBLE_FOR_PAYOUT_
 * CALCULATION` dans `lib/payouts/calculate.ts`), chacune un lien vers
 * `/versements/[campaignId]` qui porte le calcul + le cycle de validation.
 *
 * Garde de page : `can(user, 'read', { type: 'payout' })` -- vrai pour
 * `platform_admin` (court-circuit) et `accounting` (lecture seule, voir
 * `lib/auth/permissions.ts`). Aucune action d'écriture sur CETTE page.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { can } from '@/lib/auth/permissions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CampaignsTable } from '@/lib/db/types';

export const metadata = {
  title: 'Versements',
};

type CampaignRow = Pick<CampaignsTable['Row'], 'id' | 'name' | 'status' | 'ends_at'>;

function formatDateFr(dateIso: string | null): string {
  if (!dateIso) return '--';
  return new Date(dateIso).toLocaleDateString('fr-CA');
}

export default async function VersementsPage(): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!can(user, 'read', { type: 'payout' })) {
    // Pas de scope à révéler à un rôle non autorisé : 404, pas un message
    // "accès refusé" -- même convention que app/(admin)/dashboard/page.tsx.
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, status, ends_at')
    .in('status', ['closed', 'paid'])
    .order('ends_at', { ascending: false });
  if (error) throw error;
  const campaigns = (data ?? []) as CampaignRow[];

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Versements</h1>
        <p>
          Calcul des montants dus aux bénéficiaires et suivi du paiement manuel -- une seule campagne clôturée à la
          fois. Le paiement effectif (virement, chèque...) se fait hors plateforme ; cet écran sert à calculer le
          montant, faire valider l&apos;admin, et tracer la preuve.
        </p>
      </div>

      <Card>
        <section className="stack stack--sm">
          <h2>Campagnes clôturées</h2>
          {campaigns.length === 0 ? (
            <p className="muted">Aucune campagne clôturée pour le moment -- les versements ne sont calculables qu&apos;après clôture.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campagne</th>
                    <th>Statut</th>
                    <th>Fin</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>{campaign.name}</td>
                      <td>{campaign.status === 'paid' ? 'Payée' : 'Clôturée'}</td>
                      <td>{formatDateFr(campaign.ends_at)}</td>
                      <td>
                        <Button href={`/versements/${campaign.id}`} variant="outline" size="sm">
                          Gérer les versements
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>
    </main>
  );
}
