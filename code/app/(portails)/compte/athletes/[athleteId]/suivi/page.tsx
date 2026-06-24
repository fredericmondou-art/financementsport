/**
 * Page de suivi de progression et de partage pour l'athlète (Tâche 1.6.C2,
 * docs/prompts/phase-1-6.md lignes 297-333). Critères d'acceptation : objectif,
 * montant amassé, nombre de supporters visibles ; partage du lien personnel
 * en un clic avec message pré-rédigé ; AUCUN palmarès/classement entre
 * athlètes (jamais affiché ici, ni dans `lib/athletes/profile.ts#loadAthleteSuivi`,
 * qui ne charge qu'UN athlète à la fois -- aucune donnée d'un autre bénéficiaire
 * ne transite par cette page).
 *
 * Réutilise les mêmes briques que l'écran de démarrage de campagne
 * (`app/(portails)/campagnes/[campaignId]/demarrage/page.tsx`, Tâche 1.6.B3) :
 * `CopyButton`, lien `mailto:`, lien profond Messenger -- voir ce fichier pour
 * le détail des décisions déjà prises sur ces mécanismes de partage
 * (notamment l'absence d'app Messenger configurée, docs/DECISIONS.md). QR
 * code volontairement absent : reporté à la Tâche 1.7 (décision déjà prise,
 * voir docs/DECISIONS.md), pas re-décidé ici.
 *
 * Autorisation : `getAthlete` (lib/entities/athletes.ts) applique déjà
 * `can(user, 'read', ...)` -- tuteur, athlète majeur lui-même, gérant
 * d'équipe/club dans son périmètre, ou `platform_admin`. Mobile-first : page
 * en une seule colonne (`stack`), mêmes composants déjà responsables que le
 * reste du portail compte -- aucune disposition multi-colonnes ajoutée ici.
 *
 * Communications mineurs : le message pré-rédigé
 * (`lib/athletes/share-message.ts#buildAthleteShareMessage`) est toujours à la
 * troisième personne, jamais signé au nom de l'enfant -- voir le commentaire
 * de ce fichier pour le lien avec le cadre parental (CLAUDE.md section 5).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getAthlete, createSupabaseAthleteRepo, isAthletePubliclyVisible } from '@/lib/entities/athletes';
import { loadAthleteSuivi } from '@/lib/athletes/profile';
import { buildAthleteShareMessage } from '@/lib/athletes/share-message';
import { NotFoundError, PermissionError } from '@/lib/entities/errors';
import { getPublicAppUrl } from '@/lib/env';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CopyButton } from '@/components/copy-button';

interface AthleteSuiviPageProps {
  params: { athleteId: string };
}

export default async function AthleteSuiviPage({ params }: AthleteSuiviPageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const athleteRepo = createSupabaseAthleteRepo(supabase);

  let athlete;
  try {
    athlete = await getAthlete(user, params.athleteId, athleteRepo);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    const message = error instanceof PermissionError ? error.message : 'Une erreur est survenue.';
    redirect(`/compte/athletes?erreur=${encodeURIComponent(message)}`);
  }

  const { campaignSection, supporterCount } = await loadAthleteSuivi(supabase, athlete.id);

  const publiclyVisible = isAthletePubliclyVisible(athlete);
  const publicUrl = publiclyVisible ? `${getPublicAppUrl()}/${athlete.slug}` : null;
  const shareMessage =
    publicUrl && campaignSection
      ? buildAthleteShareMessage({
          beneficiaryName: `${athlete.first_name} ${athlete.last_name}`,
          campaignName: campaignSection.campaign.name,
          publicUrl,
        })
      : null;
  const mailHref = publicUrl
    ? `mailto:?subject=${encodeURIComponent(`Encouragez ${athlete.first_name}`)}&body=${encodeURIComponent(
        shareMessage ?? publicUrl,
      )}`
    : undefined;
  const messengerHref = publicUrl ? `fb-messenger://share/?link=${encodeURIComponent(publicUrl)}` : undefined;

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>
          Suivi de {athlete.first_name} {athlete.last_name}
        </h1>
        <p>Progression de la campagne et outils de partage.</p>
      </div>

      <Card>
        <section className="stack stack--sm">
          <h2>Progression</h2>
          {campaignSection ? (
            <>
              <p>{campaignSection.campaign.name}</p>
              {campaignSection.progress.goalCents !== null ? (
                <>
                  <p>
                    {formatCents(campaignSection.progress.raisedCents)} amassés sur un objectif de{' '}
                    {formatCents(campaignSection.progress.goalCents)}
                    {campaignSection.progress.isGoalExceeded ? ' — objectif dépassé !' : ''}
                  </p>
                  <ProgressBar percent={campaignSection.progress.percent ?? 0} label="Progression de la campagne" />
                </>
              ) : (
                <p>{formatCents(campaignSection.progress.raisedCents)} amassés. Cette campagne n&apos;a pas d&apos;objectif défini.</p>
              )}
              <p>
                {supporterCount === 0
                  ? 'Aucun supporter pour l’instant.'
                  : supporterCount === 1
                    ? '1 supporter a déjà contribué.'
                    : `${supporterCount} supporters ont déjà contribué.`}
              </p>
            </>
          ) : (
            <Alert variant="info">
              Aucune campagne active pour le moment. L&apos;objectif et le suivi apparaîtront dès
              qu&apos;une campagne sera lancée pour {athlete.first_name}.
            </Alert>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Partager le lien personnel</h2>
          {!publiclyVisible ? (
            <Alert variant="info">
              La page publique de {athlete.first_name} n&apos;est pas encore visible (consentement
              parental requis pour un mineur) -- le partage sera disponible une fois le consentement
              donné depuis la page de modification du profil.
            </Alert>
          ) : (
            <>
              <p className="demarrage__link">{publicUrl}</p>
              <div className="form__actions">
                <CopyButton textToCopy={publicUrl ?? ''} variant="primary">
                  Copier le lien
                </CopyButton>
                <Button href={mailHref ?? '#'} variant="outline">
                  Envoyer par courriel
                </Button>
                <Button href={messengerHref ?? '#'} variant="outline">
                  Envoyer sur Messenger
                </Button>
              </div>
              {shareMessage ? (
                <>
                  <p>Rien à rédiger : copiez-collez directement ce message déjà prêt.</p>
                  <pre className="demarrage__message-preview">{shareMessage}</pre>
                  <CopyButton textToCopy={shareMessage} variant="primary">
                    Copier le message
                  </CopyButton>
                </>
              ) : null}
            </>
          )}
        </section>
      </Card>

      <div className="form__actions">
        <Button href={`/compte/athletes/${athlete.id}`} variant="outline">
          Modifier le profil
        </Button>
        {publiclyVisible ? (
          <Button href={`/${athlete.slug}`} variant="outline">
            Voir la page publique
          </Button>
        ) : null}
      </div>
    </main>
  );
}
