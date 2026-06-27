/**
 * Clôture de campagne (Tâche 1.5.8, docs/prompts/phase-1-5.md) : le
 * responsable d'une campagne active peut la clôturer (verrouille les
 * nouveaux achats -- voir `lib/checkout/create-checkout-session.ts`) ; un
 * `platform_admin` peut la rouvrir, avec une raison obligatoire, tracée.
 *
 * Même pattern d'authentification/autorisation que `livraison/page.tsx`
 * (Tâche 1.5.5) : `getCurrentUser()` + redirection si non connecté, requête
 * RLS-scoped (`campagnes_select_scoped`, déjà en place) + `notFound()` si la
 * campagne est absente/non autorisée. Toute la logique de transition
 * (validité, autorisation, traçabilité) vit dans `lib/campaigns/close.ts` +
 * les fonctions Postgres gardées `close_campaign`/`reopen_campaign`
 * (migration 0017) -- cette page ne fait qu'afficher le statut courant, le
 * formulaire approprié, et l'historique des changements
 * (`campaign_status_log`).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { campaignStatusLabelFr } from '@/lib/campaigns/close';
import type { CampaignsTable } from '@/lib/db/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { closeCampaignAction, reopenCampaignAction } from './actions';

export const metadata = {
  title: 'Clôture de campagne',
};

interface CloturerPageProps {
  params: { campaignId: string };
  searchParams: { erreur?: string; avis?: string };
}

type CampaignRow = CampaignsTable['Row'];

interface StatusLogRow {
  id: string;
  previous_status: string;
  new_status: string;
  reason: string | null;
  changed_at: string;
}

export default async function CloturerPage({ params, searchParams }: CloturerPageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

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

  const { data: logData, error: logError } = await supabase
    .from('campaign_status_log')
    .select('id, previous_status, new_status, reason, changed_at')
    .eq('campaign_id', campaign.id)
    .order('changed_at', { ascending: false });
  if (logError) throw logError;
  const history = (logData ?? []) as StatusLogRow[];

  const isPlatformAdmin = user.role === 'platform_admin';

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Clôture de campagne -- {campaign.name}</h1>
        <p>
          Statut actuel : <strong>{campaignStatusLabelFr(campaign.status)}</strong>
          {campaign.closed_at ? ` (depuis le ${new Date(campaign.closed_at).toLocaleDateString('fr-CA')})` : ''}
        </p>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}
      {searchParams.avis ? <Alert variant="success">{searchParams.avis}</Alert> : null}

      <Card>
        <section className="stack stack--sm">
          {campaign.status === 'active' ? (
            <>
              <h2>Clôturer cette campagne</h2>
              <p className="muted">
                Clôturer une campagne empêche immédiatement tout nouvel achat la concernant. Les paiements déjà
                confirmés avant la clôture restent valides et continuent de produire leur crédit normalement.
              </p>
              <form action={closeCampaignAction}>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <input type="hidden" name="currentStatus" value={campaign.status} />
                <Button type="submit" variant="primary">
                  Clôturer la campagne
                </Button>
              </form>
            </>
          ) : campaign.status === 'closed' ? (
            isPlatformAdmin ? (
              <>
                <h2>Rouvrir cette campagne</h2>
                <p className="muted">
                  Réservé aux administrateurs de la plateforme. Une raison est obligatoire et sera conservée dans
                  l&apos;historique ci-dessous.
                </p>
                <form action={reopenCampaignAction} className="stack stack--sm">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <input type="hidden" name="currentStatus" value={campaign.status} />
                  <label htmlFor="reason">Raison de la réouverture</label>
                  <textarea id="reason" name="reason" required rows={3} />
                  <Button type="submit" variant="primary">
                    Rouvrir la campagne
                  </Button>
                </form>
              </>
            ) : (
              <p className="muted">
                Cette campagne est clôturée. Seul un administrateur de la plateforme peut la rouvrir.
              </p>
            )
          ) : (
            <p className="muted">
              Cette campagne n&apos;est ni active ni clôturée (statut : {campaignStatusLabelFr(campaign.status)}) --
              aucune action de clôture/réouverture n&apos;est disponible ici.
            </p>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Historique</h2>
          {history.length === 0 ? (
            <p className="muted">L&apos;historique apparaîtra ici après une clôture ou une réouverture.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Changement</th>
                    <th>Raison</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.changed_at).toLocaleString('fr-CA')}</td>
                      <td>
                        {entry.previous_status} &rarr; {entry.new_status}
                      </td>
                      <td>{entry.reason ?? '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>

      <div className="form__actions">
        <Button href={`/campagnes/${campaign.id}/demarrage`} variant="outline">
          Retour à l&apos;écran de démarrage
        </Button>
      </div>
    </main>
  );
}
