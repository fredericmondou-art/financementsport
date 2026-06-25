/**
 * Détail des versements d'une campagne (Tâche 1.5.10, docs/prompts/
 * phase-1-5.md, section 37 -- « tâche financière sensible »).
 *
 * Affiche, pour CHAQUE bénéficiaire de la campagne : le montant dû calculé
 * (`amount_cents`, somme BRUTE des crédits actifs -- voir l'en-tête de
 * `lib/payouts/calculate.ts`), la retenue de frais (`fee_held_cents`), le
 * montant NET à verser (`computeNetPayableCents`), le statut courant, la
 * preuve de paiement le cas échéant, et un historique complet des
 * changements de statut (`payout_status_log`).
 *
 * Deux familles d'action, toutes deux réservées à `platform_admin`
 * (`can(user, 'update', { type: 'payout' })` -- `accounting` reste LECTURE
 * SEULE, voir `tests/unit/permissions.test.ts`, décision déjà en place avant
 * cette tâche, non remise en cause) :
 *   - « Calculer les versements » : `recalculatePayoutsAction` --
 *     idempotent, voir `lib/payouts/calculate.ts`.
 *   - Une transition de statut par versement (`advancePayoutStatusAction`) :
 *     le <select> n'offre que les statuts suivants VALIDES (miroir client de
 *     `VALID_PAYOUT_STATUS_TRANSITIONS`, revalidé côté serveur par
 *     `advance_payout_status`, migration 0019). Les champs `proofUrl`/
 *     `note`/montants sont optionnels au niveau HTML (un Server Component ne
 *     peut pas conditionner leur affichage sur le <select> sans JS client) --
 *     la validation RÉELLE (preuve obligatoire pour `paid`, raison+montant
 *     obligatoires pour `adjusted`) vit entièrement dans
 *     `lib/payouts/workflow.ts` + la fonction Postgres gardée.
 *
 * Même garde de page que `app/(admin)/versements/page.tsx` --
 * `can(user, 'read', { type: 'payout' })` pour la simple consultation
 * (`accounting` y a accès), `notFound()` sinon.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { can } from '@/lib/auth/permissions';
import { loadBeneficiaryLabels } from '@/lib/cart/beneficiary-labels';
import { computeNetPayableCents } from '@/lib/payouts/calculate';
import { payoutStatusLabelFr, VALID_PAYOUT_STATUS_TRANSITIONS } from '@/lib/payouts/workflow';
import type { CampaignsTable, PayoutsTable, PayoutStatus } from '@/lib/db/types';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { recalculatePayoutsAction, advancePayoutStatusAction } from './actions';

export const metadata = {
  title: 'Versements -- détail',
};

type CampaignRow = CampaignsTable['Row'];
type PayoutRow = PayoutsTable['Row'];

interface PayoutStatusLogRow {
  id: string;
  payout_id: string;
  from_status: PayoutStatus;
  to_status: PayoutStatus;
  changed_by: string | null;
  note: string | null;
  changed_at: string;
}

interface VersementsDetailPageProps {
  params: { campaignId: string };
  searchParams: { erreur?: string; avis?: string };
}

const CAMPAIGN_STATUSES_ELIGIBLE_FOR_PAYOUT_CALCULATION = new Set(['closed', 'paid']);

export default async function VersementsDetailPage({
  params,
  searchParams,
}: VersementsDetailPageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!can(user, 'read', { type: 'payout' })) {
    notFound();
  }
  const canWrite = can(user, 'update', { type: 'payout' });

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

  const { data: payoutsData, error: payoutsError } = await supabase
    .from('payouts')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: true });
  if (payoutsError) throw payoutsError;
  const payouts = (payoutsData ?? []) as PayoutRow[];

  const beneficiaryLabels = await loadBeneficiaryLabels(
    supabase,
    payouts.map((p) => ({ beneficiaryType: p.beneficiary_type, beneficiaryId: p.beneficiary_id })),
  );

  const payoutIds = payouts.map((p) => p.id);
  let history: PayoutStatusLogRow[] = [];
  if (payoutIds.length > 0) {
    const { data: historyData, error: historyError } = await supabase
      .from('payout_status_log')
      .select('id, payout_id, from_status, to_status, changed_by, note, changed_at')
      .in('payout_id', payoutIds)
      .order('changed_at', { ascending: false });
    if (historyError) throw historyError;
    history = (historyData ?? []) as PayoutStatusLogRow[];
  }

  const changedByIds = [...new Set(history.map((h) => h.changed_by).filter((id): id is string => id !== null))];
  const changedByNames = new Map<string, string>();
  if (changedByIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', changedByIds);
    if (profileError) throw profileError;
    for (const row of (profileRows as Array<{ id: string; full_name: string | null }>) ?? []) {
      if (row.full_name) changedByNames.set(row.id, row.full_name);
    }
  }

  const historyByPayout = new Map<string, PayoutStatusLogRow[]>();
  for (const entry of history) {
    const list = historyByPayout.get(entry.payout_id) ?? [];
    list.push(entry);
    historyByPayout.set(entry.payout_id, list);
  }

  const isEligibleForCalculation = CAMPAIGN_STATUSES_ELIGIBLE_FOR_PAYOUT_CALCULATION.has(campaign.status);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Versements -- {campaign.name}</h1>
        <p>
          Statut de la campagne : <strong>{campaign.status === 'paid' ? 'Payée' : campaign.status}</strong>
        </p>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}
      {searchParams.avis ? <Alert variant="success">{searchParams.avis}</Alert> : null}

      <Card>
        <section className="stack stack--sm">
          <h2>Calcul</h2>
          {!isEligibleForCalculation ? (
            <p className="muted">
              Le calcul des versements n&apos;est disponible qu&apos;après la clôture de la campagne.
            </p>
          ) : !canWrite ? (
            <p className="muted">Lecture seule -- seul un administrateur de la plateforme peut déclencher le calcul.</p>
          ) : (
            <>
              <p className="muted">
                Recalcule le montant dû de chaque bénéficiaire à partir de ses crédits actifs. Idempotent : un
                versement déjà validé/payé/fermé n&apos;est jamais modifié par cette action (seul un ajustement
                explicite, avec raison, peut corriger un versement validé).
              </p>
              <form action={recalculatePayoutsAction}>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <Button type="submit" variant="primary">
                  Calculer les versements
                </Button>
              </form>
            </>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Versements ({payouts.length})</h2>
          {payouts.length === 0 ? (
            <p className="muted">Aucun versement calculé pour le moment.</p>
          ) : (
            <div className="stack">
              {payouts.map((payout) => {
                const label = beneficiaryLabels.get(`${payout.beneficiary_type}:${payout.beneficiary_id}`) ?? 'Bénéficiaire inconnu';
                const netCents = computeNetPayableCents(payout);
                const validNextStatuses = VALID_PAYOUT_STATUS_TRANSITIONS[payout.status];
                const payoutHistory = historyByPayout.get(payout.id) ?? [];

                return (
                  <Card key={payout.id} className="stack stack--sm">
                    <div className="table-wrap">
                      <table className="table">
                        <tbody>
                          <tr>
                            <th>Bénéficiaire</th>
                            <td>{label}</td>
                          </tr>
                          <tr>
                            <th>Montant dû (brut)</th>
                            <td>{formatCents(payout.amount_cents)}</td>
                          </tr>
                          <tr>
                            <th>Retenue de frais</th>
                            <td>{formatCents(payout.fee_held_cents)}</td>
                          </tr>
                          <tr>
                            <th>Montant net à verser</th>
                            <td>
                              <strong>{formatCents(netCents)}</strong>
                            </td>
                          </tr>
                          <tr>
                            <th>Statut</th>
                            <td>{payoutStatusLabelFr(payout.status)}</td>
                          </tr>
                          <tr>
                            <th>Preuve de paiement</th>
                            <td>
                              {payout.proof_url ? (
                                <a href={payout.proof_url} target="_blank" rel="noreferrer noopener">
                                  Voir la preuve
                                </a>
                              ) : (
                                '--'
                              )}
                            </td>
                          </tr>
                          <tr>
                            <th>Payé le</th>
                            <td>{payout.paid_at ? new Date(payout.paid_at).toLocaleString('fr-CA') : '--'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {canWrite && validNextStatuses.length > 0 ? (
                      <form action={advancePayoutStatusAction} className="stack stack--sm">
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <input type="hidden" name="currentStatus" value={payout.status} />
                        <input type="hidden" name="existingProofUrl" value={payout.proof_url ?? ''} />

                        <label htmlFor={`nextStatus-${payout.id}`}>Nouveau statut</label>
                        <select id={`nextStatus-${payout.id}`} name="nextStatus" required defaultValue="">
                          <option value="" disabled>
                            -- choisir --
                          </option>
                          {validNextStatuses.map((status) => (
                            <option key={status} value={status}>
                              {payoutStatusLabelFr(status)}
                            </option>
                          ))}
                        </select>

                        <label htmlFor={`proofUrl-${payout.id}`}>
                          Preuve de paiement (URL) -- obligatoire pour passer à « Payé »
                        </label>
                        <input id={`proofUrl-${payout.id}`} name="proofUrl" type="url" placeholder="https://..." />

                        <label htmlFor={`newAmountCents-${payout.id}`}>
                          Nouveau montant en centimes -- obligatoire pour « Ajusté »
                        </label>
                        <input
                          id={`newAmountCents-${payout.id}`}
                          name="newAmountCents"
                          type="number"
                          min={0}
                          step={1}
                          placeholder={String(payout.amount_cents)}
                        />

                        <label htmlFor={`newFeeHeldCents-${payout.id}`}>
                          Nouvelle retenue de frais en centimes (facultatif, « Ajusté » seulement)
                        </label>
                        <input
                          id={`newFeeHeldCents-${payout.id}`}
                          name="newFeeHeldCents"
                          type="number"
                          min={0}
                          step={1}
                          placeholder={String(payout.fee_held_cents)}
                        />

                        <label htmlFor={`note-${payout.id}`}>
                          Note / raison -- obligatoire pour « Ajusté »
                        </label>
                        <textarea id={`note-${payout.id}`} name="note" rows={2} />

                        <Button type="submit" variant="primary" size="sm">
                          Appliquer la transition
                        </Button>
                      </form>
                    ) : null}

                    {payoutHistory.length > 0 ? (
                      <details>
                        <summary>Historique ({payoutHistory.length})</summary>
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Changement</th>
                                <th>Par</th>
                                <th>Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {payoutHistory.map((entry) => (
                                <tr key={entry.id}>
                                  <td>{new Date(entry.changed_at).toLocaleString('fr-CA')}</td>
                                  <td>
                                    {payoutStatusLabelFr(entry.from_status)} &rarr; {payoutStatusLabelFr(entry.to_status)}
                                  </td>
                                  <td>{entry.changed_by ? changedByNames.get(entry.changed_by) ?? entry.changed_by : '--'}</td>
                                  <td>{entry.note ?? '--'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </Card>

      <div className="form__actions">
        <Button href="/versements" variant="outline">
          Retour à la liste des campagnes
        </Button>
      </div>
    </main>
  );
}
