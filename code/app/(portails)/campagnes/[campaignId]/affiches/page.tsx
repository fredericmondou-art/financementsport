/**
 * Page de téléchargement des affiches d'une campagne (Tâche 1.5.2).
 *
 * Même pattern d'authentification/autorisation que
 * `app/(portails)/campagnes/[campaignId]/qr/page.tsx` (Tâche 1.5.1,
 * CLAUDE.md section 9 -- cohérence entre tâches) : `getCurrentUser()` +
 * redirection si non connectée, requête RLS-scoped (policy
 * `campaigns_select_scoped`) + `notFound()` si absente/non autorisée.
 *
 * Une seule affiche par campagne (celle du bénéficiaire DIRECT de la
 * campagne -- athlète, équipe OU club, selon `campaigns.beneficiary_type`),
 * dans les 3 formats demandés par le cahier. Contrairement aux codes QR de
 * la Tâche 1.5.1, le cahier de la Tâche 1.5.2 ne demande pas explicitement
 * une affiche PAR ATHLÈTE PARTICIPANT -- décision documentée dans
 * docs/DECISIONS.md (Tâche 1.5.2) : portée volontairement alignée sur le
 * texte du cahier, à étendre si un besoin réel d'affiches individuelles par
 * athlète apparaît.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseBeneficiaryPreviewRepo, loadBeneficiaryPreviewIdentity } from '@/lib/public/preview';
import type { CampaignsTable } from '@/lib/db/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Affiches de la campagne',
};

interface AffichesPageProps {
  params: { campaignId: string };
}

type CampaignRow = CampaignsTable['Row'];

const FORMAT_LABELS: Record<'lettre' | 'carre' | 'story', { title: string; description: string }> = {
  lettre: {
    title: 'Format lettre (impression)',
    description: 'Format 8,5 x 11 po, prêt à imprimer pour un babillard ou un vestiaire.',
  },
  carre: {
    title: 'Format carré (réseaux sociaux)',
    description: 'Format carré 1:1, idéal pour une publication Facebook ou Instagram.',
  },
  story: {
    title: 'Format story (9:16)',
    description: 'Format vertical 9:16, idéal pour une story Instagram ou Facebook.',
  },
};

export default async function AffichesPage({ params }: AffichesPageProps): Promise<JSX.Element> {
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

  const identity = await loadBeneficiaryPreviewIdentity(
    campaign.beneficiary_type,
    campaign.beneficiary_id,
    createSupabaseBeneficiaryPreviewRepo(supabase),
  );

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Affiches -- {campaign.name}</h1>
        <p>
          Une affiche prête à imprimer ou à partager, avec photo (si autorisée), objectif, prix des
          forfaits et un code QR scannable.
        </p>
      </div>

      {identity === null ? (
        <Card>
          <p>Bénéficiaire introuvable -- impossible de générer l&apos;affiche pour l&apos;instant.</p>
        </Card>
      ) : (
        <>
          <Card>
            <section className="stack stack--sm">
              <h2>{identity.name}</h2>
              {identity.imageUrl ? (
                // Aperçu simple ; l'image réelle de l'affiche est intégrée
                // par l'API au moment du téléchargement.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={identity.imageUrl} alt={identity.name} width={120} height={120} />
              ) : null}
              {identity.bodyText ? <p>{identity.bodyText}</p> : null}
            </section>
          </Card>

          {(['lettre', 'carre', 'story'] as const).map((format) => (
            <Card key={format}>
              <section className="stack stack--sm">
                <h2>{FORMAT_LABELS[format].title}</h2>
                <p>{FORMAT_LABELS[format].description}</p>
                <div className="form__actions">
                  <Button href={`/api/campagnes/${campaign.id}/affiches/${format}`} variant="primary">
                    Télécharger en PDF
                  </Button>
                </div>
              </section>
            </Card>
          ))}
        </>
      )}

      <div className="hide-print">
        <Button href={`/campagnes/${campaign.id}/demarrage`} variant="outline">
          Retour à l&apos;écran de démarrage
        </Button>
      </div>
    </main>
  );
}
