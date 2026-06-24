/**
 * Affiche imprimable d'une campagne (Tâche 1.6.B3, action « Télécharger
 * l'affiche » de l'écran de démarrage). Même pattern que
 * `app/(portails)/compte/commandes/[orderId]/recu/page.tsx` : page HTML
 * normale + `<PrintButton>` (window.print()), aucune librairie PDF -- voir
 * docs/DECISIONS.md pour la justification déjà actée à la Tâche 1.6.A3.
 *
 * Portée volontairement réduite à du texte (nom, message, lien) -- PAS
 * d'image de code QR scannable : `lib/campaigns/qr-codes.ts` ne génère que
 * la donnée du code QR, son rendu visuel est explicitement différé (voir
 * commentaire de ce fichier et docs/DECISIONS.md). Le lien complet, affiché
 * en gros, reste donc l'unique moyen d'accès depuis cette affiche pour
 * l'instant.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  buildBeneficiaryPublicPath,
  createSupabaseBeneficiaryPreviewRepo,
  loadBeneficiaryPreviewIdentity,
} from '@/lib/public/preview';
import { buildParentMessage } from '@/lib/campaigns/demarrage-message';
import { getPublicAppUrl } from '@/lib/env';
import type { CampaignsTable } from '@/lib/db/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrintButton } from '@/components/print-button';

export const metadata = {
  title: 'Affiche de campagne',
};

interface AffichePageProps {
  params: { campaignId: string };
}

type CampaignRow = CampaignsTable['Row'];

export default async function AffichePage({ params }: AffichePageProps): Promise<JSX.Element> {
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
  const publicUrl = identity
    ? `${getPublicAppUrl()}${buildBeneficiaryPublicPath(campaign.beneficiary_type, identity.slug)}`
    : null;
  const message =
    identity && publicUrl
      ? buildParentMessage({ beneficiaryName: identity.name, campaignName: campaign.name, publicUrl })
      : null;

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Affiche -- {campaign.name}</h1>
        <PrintButton variant="outline">Imprimer / Enregistrer en PDF</PrintButton>
      </div>

      {publicUrl === null ? (
        <Card>
          <p>Bénéficiaire introuvable -- impossible de générer l&apos;affiche pour l&apos;instant.</p>
        </Card>
      ) : (
        <Card>
          <div className="poster">
            <h2 className="poster__title">{campaign.name}</h2>
            {campaign.public_message ? <p className="poster__message">{campaign.public_message}</p> : null}
            {message ? <p className="poster__message">{message}</p> : null}
            <p className="poster__url">{publicUrl}</p>
          </div>
        </Card>
      )}

      <div className="hide-print">
        <Button href={`/campagnes/${campaign.id}/demarrage`} variant="outline">
          Retour à l&apos;écran de démarrage
        </Button>
      </div>
    </main>
  );
}
