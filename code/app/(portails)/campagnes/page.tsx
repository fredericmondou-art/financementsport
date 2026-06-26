/**
 * Liste « Mes campagnes » -- correction d'un écart de navigation (Phase
 * 1.4b, voir docs/DECISIONS.md et lib/campaigns/list-for-manager.ts pour le
 * contexte complet) : le lien de nav « Campagnes » pointait directement vers
 * `/campagnes/nouvelle`, sans aucun moyen de retrouver une campagne déjà
 * créée. Cette page est maintenant la cible de ce lien ; `/campagnes/nouvelle`
 * reste accessible via le bouton « Nouvelle campagne » ci-dessous.
 *
 * Authentification/scope : même patron que `/equipe/[teamId]` -- RLS
 * (`campaigns_select_scoped`) est la seule source de vérité de ce qui est
 * visible, aucun filtre applicatif supplémentaire ici (CLAUDE.md section 5).
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseCampaignListRepo, loadCampaignListForCurrentUser } from '@/lib/campaigns/list-for-manager';
import { computeCampaignProgress } from '@/lib/public/campaign-progress';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';

export const metadata = {
  title: 'Mes campagnes',
};

export default async function CampagnesPage(): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const campaigns = await loadCampaignListForCurrentUser(createSupabaseCampaignListRepo(supabase));

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Mes campagnes</h1>
        <p>Retrouvez ici toutes vos campagnes et suivez leur progression.</p>
        <div className="form__actions">
          <Button href="/campagnes/nouvelle" variant="primary">
            + Nouvelle campagne
          </Button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <section className="stack stack--sm">
            <h2>Aucune campagne pour le moment</h2>
            <p>
              Lancez votre première campagne : moins de 15 minutes pour la rendre active et commencer
              à recueillir des encouragements.
            </p>
            <div className="form__actions">
              <Button href="/campagnes/nouvelle" variant="primary">
                Lancer ma première campagne
              </Button>
            </div>
          </section>
        </Card>
      ) : (
        <div className="stack">
          {campaigns.map((campaign) => {
            const progress = computeCampaignProgress(campaign.raisedCents, campaign.goalCents);
            return (
              <Card key={campaign.id}>
                <section className="stack stack--sm">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                    <h2>{campaign.name}</h2>
                    <Badge variant={campaign.statusBadgeVariant}>{campaign.statusLabel}</Badge>
                  </div>

                  <p>
                    {formatCents(campaign.raisedCents)} amassés
                    {progress.goalCents !== null ? ` sur un objectif de ${formatCents(progress.goalCents)}` : ''}
                    {progress.isGoalExceeded ? ' — objectif dépassé !' : ''}
                  </p>
                  {progress.percent !== null ? (
                    <ProgressBar percent={progress.percent} label={`Progression de ${campaign.name}`} />
                  ) : null}

                  <div className="form__actions">
                    <Button href={`/campagnes/${campaign.id}/rapport`} variant="outline">
                      Voir le rapport
                    </Button>
                    {campaign.status === 'active' ? (
                      <Button href={`/campagnes/${campaign.id}/demarrage`} variant="outline">
                        Partager la campagne
                      </Button>
                    ) : null}
                  </div>
                </section>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
