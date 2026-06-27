/**
 * Page de téléchargement du code QR d'une campagne (Tâche 1.5.1).
 *
 * Même pattern d'authentification/autorisation que
 * `demarrage/page.tsx`/`demarrage/affiche/page.tsx` (CLAUDE.md section 9 --
 * cohérence entre tâches) : `getCurrentUser()` + redirection si non
 * connectée, requête RLS-scoped (policy `campaigns_select_scoped`) +
 * `notFound()` si absente/non autorisée -- aucune distinction entre
 * "campagne inexistante" et "accès refusé".
 *
 * Le cahier (Tâche 1.5.1, critère d'acceptation) demande explicitement de
 * pouvoir télécharger le QR d'un ATHLÈTE -- pas seulement celui de la
 * campagne. À l'activation (`lib/campaigns/create-campaign.ts`), un QR est
 * créé pour la campagne ET un par athlète PARTICIPANT
 * (`target_type = 'athlete'`, via `campaign_participants`) -- cette page
 * liste donc le QR de la campagne, puis un QR par participant.
 *
 * Chaque ligne `qr_codes` est en outre protégée par la policy
 * `qr_codes_scoped` (migration 0003) : même si la page affichait par erreur
 * un code d'une autre campagne, le téléchargement PNG/PDF
 * (`app/api/qr/[code]/{png,pdf}/route.ts`) le bloquerait via RLS.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import type { CampaignsTable } from '@/lib/db/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Codes QR de la campagne',
};

interface QrPageProps {
  params: { campaignId: string };
}

type CampaignRow = CampaignsTable['Row'];

interface QrCodeRow {
  code: string;
  scan_count: number;
  target_type: string;
  target_id: string | null;
}

interface DisplayedQr {
  code: string;
  scanCount: number;
  label: string;
}

export default async function CampagneQrPage({ params }: QrPageProps): Promise<JSX.Element> {
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

  const { data: participantsData, error: participantsError } = await supabase
    .from('campaign_participants')
    .select('athlete_id, athletes(first_name, last_name)')
    .eq('campaign_id', campaign.id);
  if (participantsError) throw participantsError;
  const participants = (participantsData ?? []) as unknown as Array<{
    athlete_id: string;
    athletes: { first_name: string; last_name: string } | null;
  }>;
  const athleteNameById = new Map(
    participants.map((row) => [row.athlete_id, row.athletes ? `${row.athletes.first_name} ${row.athletes.last_name}` : 'Athlète']),
  );
  const athleteIds = participants.map((row) => row.athlete_id);

  const { data: qrData, error: qrError } = await supabase
    .from('qr_codes')
    .select('code, scan_count, target_type, target_id')
    .or(
      [
        `and(target_type.eq.campaign,target_id.eq.${campaign.id})`,
        athleteIds.length > 0 ? `and(target_type.eq.athlete,target_id.in.(${athleteIds.join(',')}))` : null,
      ]
        .filter(Boolean)
        .join(','),
    );
  if (qrError) throw qrError;
  const qrRows = (qrData ?? []) as QrCodeRow[];

  const displayed: DisplayedQr[] = qrRows
    .map((row) => ({
      code: row.code,
      scanCount: row.scan_count,
      label:
        row.target_type === 'campaign'
          ? `Campagne -- ${campaign.name}`
          : `Athlète -- ${athleteNameById.get(row.target_id ?? '') ?? 'Athlète'}`,
      // Le QR « campagne » s'affiche toujours en premier.
      sortKey: row.target_type === 'campaign' ? 0 : 1,
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey: _sortKey, ...rest }) => rest);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Codes QR -- {campaign.name}</h1>
        <p>Un code par campagne et par athlète participant. Téléchargez-les pour vos affiches et dépliants.</p>
      </div>

      {displayed.length === 0 ? (
        <Card>
          <p>Les codes QR apparaîtront ici une fois la campagne prête.</p>
        </Card>
      ) : (
        displayed.map((qr) => (
          <Card key={qr.code}>
            <section className="stack stack--sm">
              <h2>{qr.label}</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- image
                  générée dynamiquement, pas un asset statique optimisable */}
              <img src={`/api/qr/${qr.code}/png`} alt={`Code QR -- ${qr.label}`} width={240} height={240} />
              <p>{qr.scanCount} scan(s) jusqu&apos;à présent.</p>
              <div className="form__actions">
                <Button href={`/api/qr/${qr.code}/png`} variant="primary">
                  Télécharger en PNG
                </Button>
                <Button href={`/api/qr/${qr.code}/pdf`} variant="outline">
                  Télécharger en PDF (format lettre)
                </Button>
              </div>
            </section>
          </Card>
        ))
      )}

      <div className="hide-print">
        <Button href={`/campagnes/${campaign.id}/demarrage`} variant="outline">
          Retour à l&apos;écran de démarrage
        </Button>
      </div>
    </main>
  );
}
