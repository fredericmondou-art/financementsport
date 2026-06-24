/**
 * Écran « prochaines actions » affiché immédiatement après l'activation
 * d'une campagne (Tâche 1.6.B3) -- remplace l'ancien message `?succes=`
 * (Tâche 1.7) qui se contentait d'une bannière sur la page de l'assistant.
 * Le cahier demande un écran de DÉMARRAGE avec au moins 3-4 actions
 * concrètes ; cette page en propose 6 : partager le lien, envoyer le
 * message aux parents (déjà rédigé, copiable), télécharger l'affiche texte
 * simple (1.6.B3), télécharger les codes QR (1.5.1), télécharger les
 * affiches PDF complètes avec QR/photo/prix (1.5.2), et suivre les ventes.
 *
 * Autorisation : aucune vérification applicative ici -- la policy RLS
 * `campaigns_select_scoped` (migration 0003) n'autorise déjà la lecture
 * d'une `campaigns.Row` qu'à la responsable qui l'a créée, à
 * l'administratrice du club/équipe concerné, ou à l'administration de la
 * plateforme (voir docs/DECISIONS.md). Si la requête ne renvoie rien, soit
 * la campagne n'existe pas, soit cette utilisatrice n'y a pas droit -- les
 * deux cas sont traités identiquement par `notFound()`, comme partout
 * ailleurs dans le projet (jamais de distinction "n'existe pas" vs "accès
 * refusé", qui fuiterait de l'information).
 *
 * `(campaignId)` plutôt que `(id)` (légère divergence du chemin littéral du
 * cahier, voir docs/DECISIONS.md) : cohérent avec le reste du projet, qui
 * nomme toujours ses segments dynamiques d'après l'entité (`[slug]`,
 * `[athleteSlug]`, `[orderId]`), jamais `[id]` générique.
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
import { computeCampaignProgress } from '@/lib/public/campaign-progress';
import { getPublicAppUrl } from '@/lib/env';
import { formatCents } from '@/lib/format-cents';
import type { CampaignsTable } from '@/lib/db/types';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CopyButton } from '@/components/copy-button';

interface DemarragePageProps {
  params: { campaignId: string };
}

type CampaignRow = CampaignsTable['Row'];

export default async function DemarragePage({ params }: DemarragePageProps): Promise<JSX.Element> {
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

  const [identity, progressRow] = await Promise.all([
    loadBeneficiaryPreviewIdentity(
      campaign.beneficiary_type,
      campaign.beneficiary_id,
      createSupabaseBeneficiaryPreviewRepo(supabase),
    ),
    supabase
      .from('v_campaign_progress')
      .select('*')
      .eq('campaign_id', campaign.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as { raised_cents: number } | null;
      }),
  ]);

  const publicUrl = identity
    ? `${getPublicAppUrl()}${buildBeneficiaryPublicPath(campaign.beneficiary_type, identity.slug)}`
    : null;
  const parentMessage =
    identity && publicUrl
      ? buildParentMessage({ beneficiaryName: identity.name, campaignName: campaign.name, publicUrl })
      : null;
  const mailHref = publicUrl
    ? `mailto:?subject=${encodeURIComponent(`Encouragez ${identity?.name ?? campaign.name}`)}&body=${encodeURIComponent(
        parentMessage ?? publicUrl,
      )}`
    : undefined;
  // Partage direct Messenger (lien profond mobile) : aucune app Facebook
  // n'est configurée côté plateforme (pas d'`app_id` Graph API) -- décision
  // autonome (voir docs/DECISIONS.md), ce lien fonctionne sur un appareil où
  // Messenger est installé et se dégrade silencieusement ailleurs (le bouton
  // "Copier le lien" reste toujours la solution universelle).
  const messengerHref = publicUrl ? `fb-messenger://share/?link=${encodeURIComponent(publicUrl)}` : undefined;

  const raisedCents = progressRow?.raised_cents ?? 0;
  const progress = computeCampaignProgress(raisedCents, campaign.goal_cents);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Campagne lancée !</h1>
        <p>
          <strong>{campaign.name}</strong> est maintenant active et visible publiquement.
        </p>
      </div>

      <Alert variant="success">
        Votre campagne est en ligne. Voici les prochaines actions pour démarrer la collecte.
      </Alert>

      <Card>
        <section className="stack stack--sm">
          <h2>1. Partager le lien</h2>
          {publicUrl ? (
            <>
              <p className="demarrage__link">{publicUrl}</p>
              <div className="form__actions">
                <CopyButton textToCopy={publicUrl} variant="primary">
                  Copier le lien
                </CopyButton>
                <Button href={mailHref ?? '#'} variant="outline">
                  Envoyer par courriel
                </Button>
                <Button href={messengerHref ?? '#'} variant="outline">
                  Envoyer sur Messenger
                </Button>
              </div>
            </>
          ) : (
            <Alert variant="error">
              Bénéficiaire introuvable sur la page publique -- impossible de générer le lien à
              partager pour l&apos;instant.
            </Alert>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>2. Envoyer le message aux parents</h2>
          <p>Rien à rédiger : copiez-collez directement ce message déjà prêt.</p>
          {parentMessage ? (
            <>
              <pre className="demarrage__message-preview">{parentMessage}</pre>
              <CopyButton textToCopy={parentMessage} variant="primary">
                Copier le message
              </CopyButton>
            </>
          ) : (
            <Alert variant="info">Le message sera disponible dès que le lien public ci-dessus l&apos;est.</Alert>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>3. Télécharger l&apos;affiche</h2>
          <p>Une affiche imprimable avec le nom, le message et le lien de la campagne.</p>
          <Button href={`/campagnes/${campaign.id}/demarrage/affiche`} variant="outline">
            Voir et imprimer l&apos;affiche
          </Button>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>4. Télécharger les codes QR</h2>
          <p>Un code QR scannable par campagne et par athlète participant, en PNG ou en PDF.</p>
          <Button href={`/campagnes/${campaign.id}/qr`} variant="outline">
            Voir et télécharger les codes QR
          </Button>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>5. Télécharger les affiches</h2>
          <p>
            Affiches prêtes à imprimer ou à partager (formats lettre, carré, story) avec photo,
            objectif, prix des forfaits et un code QR scannable.
          </p>
          <Button href={`/campagnes/${campaign.id}/affiches`} variant="outline">
            Voir et télécharger les affiches
          </Button>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>6. Suivre les ventes</h2>
          <p>
            {formatCents(raisedCents)} amassés
            {progress.goalCents !== null ? ` sur un objectif de ${formatCents(progress.goalCents)}` : ''}
            {progress.isGoalExceeded ? ' — objectif dépassé !' : ''}
          </p>
          {progress.percent !== null ? (
            <ProgressBar percent={progress.percent} label="Progression de la campagne" />
          ) : null}
        </section>
      </Card>
    </main>
  );
}
