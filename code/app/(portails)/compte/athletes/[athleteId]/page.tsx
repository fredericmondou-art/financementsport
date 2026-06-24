/**
 * Page d'édition du profil athlète (Tâche 1.6.C1, docs/prompts/phase-1-6.md)
 * — un parent/tuteur (ou l'athlète majeur lui-même) complète facilement le
 * profil : message personnel, photo, sport, ville. La section
 * « Confidentialité » (champs `hide_*` + consentement parental) n'est rendue
 * que si `canEditHiddenAthleteFields` (lib/auth/permissions.ts) est vraie
 * pour l'utilisateur courant -- un gérant d'équipe/club qui arrive ici via un
 * lien direct peut donc compléter le profil (champs non sensibles) sans
 * jamais voir ni modifier les réglages de confidentialité ou le
 * consentement, réservés au tuteur/à l'athlète majeur/à `platform_admin`
 * (même distinction que dans `updateAthlete`, qui refuserait silencieusement
 * tout `hide_*` envoyé sans cette permission -- défense en profondeur).
 *
 * « Objectif personnel » du cahier des charges (décision autonome, voir
 * docs/DECISIONS.md, Tâche 1.6.C1) : affiché en LECTURE SEULE depuis la
 * campagne active de l'athlète (`lib/athletes/profile.ts#loadOwnerCampaignSection`)
 * plutôt qu'un nouveau champ dupliqué -- l'objectif lui-même reste réglé par
 * le gérant d'équipe/club lors de la création de la campagne (assistant,
 * Tâche 1.6.B1).
 *
 * Autorisation de lecture : `getAthlete` (lib/entities/athletes.ts) applique
 * déjà `can(user, 'read', ...)` -- mêmes règles que partout ailleurs (tuteur,
 * athlète majeur, gérant d'équipe/club dans son périmètre, ou
 * `platform_admin`). `NotFoundError` -> `notFound()` ; toute autre erreur
 * (permission refusée) -> retour à la liste avec un message, sans révéler si
 * l'athlète existe (même traitement que le reste du projet).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getAthlete, createSupabaseAthleteRepo, isAthletePubliclyVisible } from '@/lib/entities/athletes';
import { canEditHiddenAthleteFields } from '@/lib/auth/permissions';
import { loadOwnerCampaignSection } from '@/lib/athletes/profile';
import { NotFoundError, PermissionError } from '@/lib/entities/errors';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import { ProgressBar } from '@/components/ui/progress-bar';
import { updateAthleteProfileAction } from './actions';

interface EditAthletePageProps {
  params: { athleteId: string };
  searchParams: { erreur?: string; avis?: string };
}

function HiddenToggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}): JSX.Element {
  return (
    <div className="checkbox-row">
      {/* Le checkbox AVANT le hidden : `FormData.get()` renvoie la première
       * valeur du nom -- coché, les deux sont envoyés ("true" puis "false")
       * et "true" gagne ; décoché, seul le hidden ("false") est envoyé. */}
      <input type="checkbox" id={name} name={name} value="true" defaultChecked={defaultChecked} />
      <input type="hidden" name={name} value="false" />
      <label htmlFor={name}>{label}</label>
    </div>
  );
}

export default async function EditAthletePage({ params, searchParams }: EditAthletePageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const repo = createSupabaseAthleteRepo(supabase);

  let athlete;
  try {
    athlete = await getAthlete(user, params.athleteId, repo);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    const message = error instanceof PermissionError ? error.message : 'Une erreur est survenue.';
    redirect(`/compte/athletes?erreur=${encodeURIComponent(message)}`);
  }

  const canEditHidden = canEditHiddenAthleteFields(user, {
    guardianId: athlete.guardian_id,
    athleteUserId: athlete.user_id,
  });
  const publiclyVisible = isAthletePubliclyVisible(athlete);
  const campaignSection = await loadOwnerCampaignSection(supabase, athlete.id);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>
          {athlete.first_name} {athlete.last_name}
        </h1>
        <p>Complétez le profil public de cet athlète.</p>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}
      {searchParams.avis ? <Alert variant="success">{searchParams.avis}</Alert> : null}

      <Card>
        <section className="stack stack--sm">
          <h2>Objectif de campagne</h2>
          {campaignSection ? (
            <>
              <p>{campaignSection.campaign.name}</p>
              {campaignSection.progress.goalCents !== null ? (
                <>
                  <p>
                    {formatCents(campaignSection.progress.raisedCents)} amassés sur un objectif de{' '}
                    {formatCents(campaignSection.progress.goalCents)}
                  </p>
                  <ProgressBar percent={campaignSection.progress.percent ?? 0} label="Progression de la campagne" />
                </>
              ) : (
                <p>Cette campagne est active, sans objectif défini.</p>
              )}
            </>
          ) : (
            <Alert variant="info">
              Aucune campagne active pour le moment. L&apos;objectif est réglé par le gérant
              d&apos;équipe ou de club lors de la création d&apos;une campagne.
            </Alert>
          )}
        </section>
      </Card>

      <Card>
        <form action={updateAthleteProfileAction} className="form form--wide stack">
          <input type="hidden" name="athleteId" value={athlete.id} />

          <Field label="Message personnel (optionnel)" hint="Affiché sur la page publique, sous le nom.">
            <textarea name="personalMessage" maxLength={2000} defaultValue={athlete.personal_message ?? ''} />
          </Field>

          <Field
            label="Photo (URL, optionnel)"
            hint="Lien vers une image déjà hébergée ailleurs (ex. réseau social, service de partage de photos)."
          >
            <input type="url" name="photoUrl" defaultValue={athlete.photo_url ?? ''} />
          </Field>

          <div className="form__row">
            <Field label="Sport (optionnel)">
              <input type="text" name="sport" maxLength={80} defaultValue={athlete.sport ?? ''} />
            </Field>
            <Field label="Ville (optionnel)">
              <input type="text" name="city" maxLength={120} defaultValue={athlete.city ?? ''} />
            </Field>
          </div>

          {canEditHidden ? (
            <section className="stack stack--sm">
              <h2>Confidentialité</h2>
              <p>
                Ces réglages contrôlent ce qui est visible sur la page publique de{' '}
                {athlete.first_name}.
              </p>

              <HiddenToggle name="hideLastName" label="Masquer le nom de famille" defaultChecked={athlete.hide_last_name} />
              <HiddenToggle name="hidePhoto" label="Masquer la photo" defaultChecked={athlete.hide_photo} />
              <HiddenToggle name="hideCity" label="Masquer la ville" defaultChecked={athlete.hide_city} />
              <HiddenToggle
                name="hideAmounts"
                label="Masquer les montants amassés"
                defaultChecked={athlete.hide_amounts}
              />
              <HiddenToggle
                name="showTeamOnly"
                label="N'afficher que dans la page de l'équipe (aucune page individuelle)"
                defaultChecked={athlete.show_team_only}
              />

              {athlete.is_minor ? (
                <>
                  <input
                    type="hidden"
                    name="parentalConsentAtOriginal"
                    value={athlete.parental_consent_at ?? ''}
                  />
                  <div className="checkbox-row">
                    <input
                      type="checkbox"
                      id="parentalConsentGiven"
                      name="parentalConsentGiven"
                      value="true"
                      defaultChecked={athlete.parental_consent_at !== null}
                    />
                    <input type="hidden" name="parentalConsentGiven" value="false" />
                    <label htmlFor="parentalConsentGiven">
                      J&apos;autorise, en tant que parent/tuteur, la publication de ce profil.
                    </label>
                  </div>
                  <p>
                    Sans ce consentement, la page publique de {athlete.first_name} reste invisible,
                    même si le profil est par ailleurs complété (point soumis à révision juridique
                    avant mise en production, voir CLAUDE.md section 2).
                  </p>
                </>
              ) : null}
            </section>
          ) : null}

          <div className="form__actions">
            <Button type="submit" variant="primary">
              Enregistrer
            </Button>
            <Button href="/compte/athletes" variant="outline">
              Annuler
            </Button>
          </div>
        </form>
      </Card>

      <div className="form__actions">
        {athlete.is_minor && !athlete.parental_consent_at ? (
          <Badge variant="warning">Page publique non visible (consentement manquant)</Badge>
        ) : null}
        {publiclyVisible ? (
          <Button href={`/${athlete.slug}`} variant="outline">
            Voir la page publique
          </Button>
        ) : null}
      </div>
    </main>
  );
}
