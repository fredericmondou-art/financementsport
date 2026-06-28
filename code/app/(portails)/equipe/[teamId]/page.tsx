/**
 * Dashboard équipe (Tâche 1.5.6, docs/prompts/phase-1-5.md, section 33) :
 * objectif collectif, ventes totales, crédits générés, nombre de commandes,
 * panier moyen, ventes par athlète, progression dans le temps, commandes à
 * distribuer, statut de versement -- "en un coup d'œil".
 *
 * Même pattern d'authentification/scope que les pages `[campaignId]/*`
 * (Tâches 1.5.1/1.5.2/1.5.4/1.5.5, CLAUDE.md section 9) : `getCurrentUser()`
 * + redirection si non connecté, requête RLS-scoped sur `teams` (policy
 * `teams_select`, migration 0005) + `notFound()` si l'équipe est
 * absente/non gérée par cet utilisateur -- c'est le seul garde-fou de scope,
 * volontairement, voir le commentaire de tête de `lib/dashboards/team.ts`.
 *
 * Toute la logique d'agrégation vit dans `lib/dashboards/team.ts` -- cette
 * page ne fait qu'afficher `loadTeamDashboard(...)`. Graphiques "simples"
 * (cahier) : barres de progression CSS (`components/ui/progress-bar.tsx`,
 * déjà existant depuis la Tâche 1.4.2), pas de nouvelle dépendance --
 * aucune bibliothèque de graphiques n'est utilisée ailleurs dans le projet
 * (voir docs/DECISIONS.md, Tâche 1.5.6).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseTeamDashboardRepo, loadTeamDashboard } from '@/lib/dashboards/team';
import { formatCents } from '@/lib/format-cents';
import { orderStatusLabelFr } from '@/lib/orders/status';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';

export const metadata = {
  title: 'Dashboard équipe',
};

interface EquipePageProps {
  params: { teamId: string };
}

function formatWeekLabel(weekStartIso: string): string {
  const date = new Date(`${weekStartIso}T00:00:00Z`);
  return new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

export default async function EquipeDashboardPage({ params }: EquipePageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const dashboard = await loadTeamDashboard(params.teamId, createSupabaseTeamDashboardRepo(supabase), supabase);
  if (!dashboard) {
    notFound();
  }

  const { team, goalCents, sales, credits, progression, ordersToDistribute, payouts } = dashboard;

  const goalPercent = goalCents === 0 ? 0 : (credits.totalCents / goalCents) * 100;
  const maxAthleteCreditCents = Math.max(1, ...credits.byAthlete.map((entry) => entry.creditCents));
  const maxWeeklyCents = Math.max(1, ...progression.map((point) => point.weekTotalCents));

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Dashboard équipe -- {team.name}</h1>
        <p>Vue d&apos;ensemble de la campagne, en un coup d&apos;œil.</p>
      </div>

      <Card>
        <section className="stack stack--sm">
          <h2>Objectif collectif</h2>
          {goalCents === 0 ? (
            <p className="muted">Pas encore d&apos;objectif fixé pour cette équipe -- il apparaîtra ici dès qu&apos;une campagne sera lancée.</p>
          ) : (
            <>
              <ProgressBar
                percent={goalPercent}
                label={`${formatCents(credits.totalCents)} amassés sur ${formatCents(goalCents)}`}
              />
              <p>
                {formatCents(credits.totalCents)} amassés sur {formatCents(goalCents)} (
                {Math.round(goalPercent)}%)
              </p>
            </>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>En un coup d&apos;œil</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-card__value">{formatCents(sales.totalSalesCents)}</span>
              <span className="stat-card__label">Ventes totales</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{formatCents(credits.totalCents)}</span>
              <span className="stat-card__label">Crédits générés</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{sales.orderCount}</span>
              <span className="stat-card__label">Nombre de commandes</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{formatCents(sales.averageOrderCents)}</span>
              <span className="stat-card__label">Panier moyen</span>
            </div>
          </div>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Ventes par athlète</h2>
          {credits.byAthlete.length === 0 ? (
            <p className="muted">Les ventes par athlète apparaîtront ici dès qu&apos;un premier crédit sera attribué.</p>
          ) : (
            <ul className="stack stack--sm" style={{ listStyle: 'none', padding: 0 }}>
              {credits.byAthlete.map((entry) => (
                <li key={entry.athleteId} className="stack" style={{ gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <span>{entry.displayName}</span>
                    <span>{formatCents(entry.creditCents)}</span>
                  </div>
                  <ProgressBar
                    percent={(entry.creditCents / maxAthleteCreditCents) * 100}
                    label={`${entry.displayName} : ${formatCents(entry.creditCents)}`}
                  />
                </li>
              ))}
            </ul>
          )}
          {credits.unassignedToAthleteCents > 0 ? (
            <p className="muted">
              + {formatCents(credits.unassignedToAthleteCents)} attribués directement à l&apos;équipe (non
              ventilés par athlète).
            </p>
          ) : null}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Progression dans le temps</h2>
          {progression.length === 0 ? (
            <p className="muted">La progression hebdomadaire apparaîtra ici dès le premier achat.</p>
          ) : (
            <ul className="stack stack--sm" style={{ listStyle: 'none', padding: 0 }}>
              {progression.map((point) => (
                <li key={point.weekStart} className="stack" style={{ gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <span>Semaine du {formatWeekLabel(point.weekStart)}</span>
                    <span>
                      {formatCents(point.weekTotalCents)} (cumul : {formatCents(point.cumulativeCents)})
                    </span>
                  </div>
                  <ProgressBar
                    percent={(point.weekTotalCents / maxWeeklyCents) * 100}
                    label={`Semaine du ${formatWeekLabel(point.weekStart)} : ${formatCents(point.weekTotalCents)}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Commandes à distribuer ({ordersToDistribute.length})</h2>
          {ordersToDistribute.length === 0 ? (
            <p className="muted">Rien à distribuer pour le moment.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>N° commande</th>
                    <th>Statut</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersToDistribute.map((order) => (
                    <tr key={order.orderId}>
                      <td>{order.orderNumber}</td>
                      <td>{orderStatusLabelFr(order.status)}</td>
                      <td>{formatCents(order.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Statut de versement</h2>
          {payouts.length === 0 ? (
            <p className="muted">Les versements apparaîtront ici une fois la campagne clôturée.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bénéficiaire</th>
                    <th>Statut</th>
                    <th>Montant</th>
                    <th>Payé le</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr key={payout.payoutId}>
                      <td>{payout.beneficiaryLabel}</td>
                      <td>{payout.statusLabel}</td>
                      <td>{formatCents(payout.amountCents)}</td>
                      <td>{payout.paidAt ? new Date(payout.paidAt).toLocaleDateString('fr-CA') : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>

      <div className="form__actions">
        <Button href="/compte" variant="outline">
          Retour à mon compte
        </Button>
      </div>
    </main>
  );
}
