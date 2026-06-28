/**
 * Dashboard admin plateforme (Tâche 1.5.7, docs/prompts/phase-1-5.md, section
 * 35) : vue d'ensemble opérationnelle ET financière -- revenus totaux,
 * commandes totales, marge brute, crédits dus, crédits payés, campagnes
 * actives, campagnes à risque, produits populaires, paiements échoués,
 * remboursements, panier moyen. Lecture seule -- aucune action destructrice
 * depuis cette page (règle explicite de la tâche).
 *
 * Réservé à `platform_admin`. Contrairement aux pages `equipe`/`campagnes`,
 * l'admin n'a pas de scope "manages_X" : RLS autorise déjà une lecture totale
 * pour ce rôle (voir l'en-tête de `lib/dashboards/admin.ts`), mais ne bloque
 * PAS l'accès à cette page pour un non-admin (qui recevrait simplement des
 * données vides/scopées plutôt qu'un refus net). D'où la vérification de
 * rôle EXPLICITE ci-dessous, via `canViewAdminDashboard` -- même convention
 * de garde que `app/(portails)/campagnes/nouvelle/page.tsx` (comparaison
 * directe sur `user.role`), mais extraite en fonction pure testable dans
 * `lib/dashboards/admin.ts` plutôt qu'inline : décision autonome, le dashboard
 * financier de la plateforme est un point d'accès suffisamment sensible pour
 * justifier un test unitaire dédié (voir docs/DECISIONS.md, Tâche 1.5.7).
 *
 * Toute la logique d'agrégation vit dans `lib/dashboards/admin.ts` -- cette
 * page ne fait qu'afficher `loadAdminDashboard(...)`.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { canViewAdminDashboard, createSupabaseAdminDashboardRepo, loadAdminDashboard } from '@/lib/dashboards/admin';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';

export const metadata = {
  title: 'Dashboard admin',
};

function formatDateFr(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('fr-CA');
}

export default async function AdminDashboardPage(): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canViewAdminDashboard(user.role)) {
    // Pas de scope à révéler à un non-admin : 404, pas un message
    // "accès refusé" qui confirmerait l'existence de la page.
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const dashboard = await loadAdminDashboard(createSupabaseAdminDashboardRepo(supabase));
  const { revenue, grossMargin, creditsDue, activeCampaignsCount, atRiskCampaigns, popularProducts, failedPayments, refunds } =
    dashboard;

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Dashboard admin</h1>
        <p>Vue d&apos;ensemble opérationnelle et financière de la plateforme.</p>
      </div>

      <Card>
        <section className="stack stack--sm">
          <h2>En un coup d&apos;œil</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-card__value">{formatCents(revenue.totalRevenueCents)}</span>
              <span className="stat-card__label">Revenus totaux</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{revenue.totalOrderCount}</span>
              <span className="stat-card__label">Commandes totales</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{revenue.paidOrderCount}</span>
              <span className="stat-card__label">Commandes payées</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{formatCents(revenue.averageBasketCents)}</span>
              <span className="stat-card__label">Panier moyen</span>
            </div>
            <div className="stat-card">
              {grossMargin.availableCents === null ? (
                <span className="stat-card__value stat-card__value--muted">Non disponible</span>
              ) : (
                <span className="stat-card__value">{formatCents(grossMargin.availableCents)}</span>
              )}
              <span className="stat-card__label">
                Marge brute{grossMargin.availableCents === null ? ` -- ${grossMargin.reason}` : ''}
              </span>
            </div>
          </div>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Crédits</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-card__value">{formatCents(creditsDue.dueCents)}</span>
              <span className="stat-card__label">Crédits dus</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{formatCents(creditsDue.paidCents)}</span>
              <span className="stat-card__label">Crédits payés</span>
            </div>
          </div>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Campagnes actives ({activeCampaignsCount})</h2>
          <h3>À risque ({atRiskCampaigns.length})</h3>
          {atRiskCampaigns.length === 0 ? (
            <p className="muted">Aucune campagne à risque pour le moment -- tout va bien.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campagne</th>
                    <th>Fin</th>
                    <th>Jours restants</th>
                    <th>Amassé / Objectif</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskCampaigns.map((campaign) => (
                    <tr key={campaign.campaignId}>
                      <td>{campaign.name}</td>
                      <td>{formatDateFr(campaign.endsAt)}</td>
                      <td>{Math.floor(campaign.daysRemaining)}</td>
                      <td>
                        {formatCents(campaign.raisedCents)} / {formatCents(campaign.goalCents)} (
                        {Math.round(campaign.progressRatio * 100)}%)
                      </td>
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
          <h2>Produits populaires</h2>
          {popularProducts.length === 0 ? (
            <p className="muted">Pas encore de vente payée -- les produits populaires apparaîtront ici.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Unités vendues</th>
                    <th>Revenu</th>
                  </tr>
                </thead>
                <tbody>
                  {popularProducts.map((product) => (
                    <tr key={product.productId}>
                      <td>{product.productName}</td>
                      <td>{product.unitsSold}</td>
                      <td>{formatCents(product.revenueCents)}</td>
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
          <h2>Paiements échoués et remboursements</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-card__value">{failedPayments.count}</span>
              <span className="stat-card__label">
                Paiements échoués ({formatCents(failedPayments.attemptedTotalCents)} tenté)
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{refunds.count}</span>
              <span className="stat-card__label">Remboursements ({formatCents(refunds.totalCents)})</span>
            </div>
          </div>
        </section>
      </Card>
    </main>
  );
}
