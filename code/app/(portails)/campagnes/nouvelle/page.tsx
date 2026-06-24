/**
 * Assistant de création de campagne en étapes (Tâche 1.6.B1 — refonte de la
 * Tâche 1.7). Server Component, piloté par `?etape=` (1 à 6,
 * `lib/campaigns/draft.ts`) : chaque étape est son propre `<form>` natif
 * (CLAUDE.md section 6, aucun Client Component) — « Continuer » sauvegarde
 * l'étape ET avance (`actions.ts`), « Revenir » est un simple lien vers
 * `?etape=N-1` (l'étape précédente a déjà été enregistrée en avançant, donc
 * rien à perdre — critère « retour arrière sans perte »).
 *
 * Reprise multi-appareil (critère d'acceptation) : si `?etape` est absent au
 * chargement, on reprend `current_step` du brouillon existant
 * (`campaign_drafts`, table liée à `auth.uid()`) plutôt qu'un état local au
 * navigateur — la même session sur un autre appareil retombe au même endroit.
 *
 * Brouillon jamais public (critère d'acceptation) : un brouillon ne vit que
 * dans `campaign_drafts`, jamais dans `campaigns` — aucune ligne `campaigns`
 * n'existe avant l'étape finale (« recap »), donc rien à exposer par
 * accident sur `v_public_campaign`.
 *
 * Bloc B — principe (docs/prompts/phase-1-6.md) : « le responsable ne touche
 * JAMAIS aux règles de crédit ni aux taux ». La section « Règle de crédit »
 * de la Tâche 1.7 est donc retirée de cet assistant (voir docs/DECISIONS.md) ;
 * `buildCampaignInputFromDraft` (lib/campaigns/draft.ts) force `creditRule:
 * null` à la création réelle.
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, listPublicProducts } from '@/lib/catalog/products';
import { loadCampaignWizardOptions, type ManagedAthleteOption, type ManagedClubOption, type ManagedTeamOption } from '@/lib/campaigns/manager-scope';
import type { CampaignInput } from '@/lib/campaigns/create-campaign';
import {
  CAMPAIGN_DRAFT_STEP_LABELS,
  clampStepQueryParam,
  createSupabaseCampaignDraftRepo,
  previousStepId,
  stepIdFromIndex,
  stepIndexFromStepId,
  type CampaignDraftData,
} from '@/lib/campaigns/draft';
import { applyCampaignDefaults } from '@/lib/campaigns/defaults';
import {
  createSupabaseBeneficiaryPreviewRepo,
  loadBeneficiaryPreviewIdentity,
  type BeneficiaryPreviewIdentity,
} from '@/lib/public/preview';
import { buildDraftPreviewCampaignSection } from '@/lib/campaigns/draft-preview';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PublicProfileView } from '@/components/public-profile-view';
import { WizardProgress } from '@/components/wizard/wizard-progress';
import { WizardNav } from '@/components/wizard/wizard-nav';
import {
  saveTypeNomStepAction,
  saveBeneficiaireStepAction,
  saveObjectifDatesStepAction,
  saveParticipantsStepAction,
  savePacksStepAction,
  addAthletesBulkAction,
  createCampaignFromDraftAction,
  discardDraftAction,
} from './actions';

const NOUVELLE_CAMPAGNE_PATH = '/campagnes/nouvelle';

const TYPE_LABELS: Record<CampaignInput['type'], string> = {
  team: 'Équipe',
  club: 'Club',
  athlete: 'Athlète',
  event: 'Événement',
  annual: 'Annuelle',
  reorder: 'Réapprovisionnement',
};

const BENEFICIARY_TYPE_LABELS: Record<CampaignInput['beneficiaryType'], string> = {
  athlete: 'Athlète',
  team: 'Équipe',
  club: 'Club',
};

interface NouvelleCampagnePageProps {
  /** `succes`/`?succes=` (Tâche 1.7) a disparu à la Tâche 1.6.B3 :
   * l'activation redirige désormais vers l'écran de démarrage dédié
   * (`/campagnes/[campaignId]/demarrage`, voir actions.ts), qui remplace
   * entièrement ce qu'affichait l'ancien message de succès ici. */
  searchParams: { etape?: string; erreur?: string; retour?: string; info?: string };
}

export default async function NouvelleCampagnePage({
  searchParams,
}: NouvelleCampagnePageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'team_manager' && user.role !== 'club_admin' && user.role !== 'platform_admin') {
    return (
      <main className="page">
        <div className="page-header">
          <h1>Nouvelle campagne</h1>
        </div>
        <Alert variant="error">
          Seul un responsable d&apos;équipe, un administrateur de club ou un administrateur de la
          plateforme peut créer une campagne.
        </Alert>
      </main>
    );
  }

  const supabase = createSupabaseServerClient();
  const draftRepo = createSupabaseCampaignDraftRepo(supabase);
  const [draft, { teams, clubs, athletes }, products] = await Promise.all([
    draftRepo.getDraft(user.id),
    loadCampaignWizardOptions(supabase, user),
    listPublicProducts({}, createSupabaseProductRepo(supabase)),
  ]);

  const data: CampaignDraftData = applyCampaignDefaults(draft?.data ?? {}, { teams, clubs, athletes, products });
  const stepIndex =
    searchParams.etape !== undefined
      ? clampStepQueryParam(searchParams.etape)
      : draft
        ? stepIndexFromStepId(draft.currentStepId)
        : 1;
  const stepId = stepIdFromIndex(stepIndex);
  const backStepId = previousStepId(stepId);
  const backHref = backStepId ? `${NOUVELLE_CAMPAGNE_PATH}?etape=${stepIndexFromStepId(backStepId)}` : undefined;

  // Navigation « corriger en un clic » depuis le récapitulatif (Tâche
  // 1.6.B3) : un lien « Modifier » sur le récapitulatif ajoute `&retour=recap`
  // à l'URL de l'étape visée. Une fois cette étape ré-enregistrée, on revient
  // directement ici plutôt que d'avancer à l'étape suivante (voir
  // `saveStepAndAdvance`, actions.ts) — repris dans un champ caché par chaque
  // étape ci-dessous.
  const returnTo = searchParams.retour === 'recap' ? 'recap' : undefined;

  // L'aperçu fidèle de la page publique (et son identité bénéficiaire) n'est
  // nécessaire qu'à l'étape récapitulatif — inutile de faire cet aller-retour
  // Supabase supplémentaire sur les 5 autres étapes.
  const previewIdentity: BeneficiaryPreviewIdentity | null =
    stepId === 'recap'
      ? await loadBeneficiaryPreviewIdentity(
          data.beneficiaryType,
          data.beneficiaryId,
          createSupabaseBeneficiaryPreviewRepo(supabase),
        )
      : null;

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Nouvelle campagne</h1>
        <p>Une décision à la fois : moins de 15 minutes pour une campagne active.</p>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}
      {searchParams.info ? <Alert variant="info">{searchParams.info}</Alert> : null}

      <WizardProgress currentStepId={stepId} />

      {draft ? (
        <form action={discardDraftAction} className="form__actions form__actions--end">
          <Button type="submit" variant="outline">
            Recommencer le brouillon
          </Button>
        </form>
      ) : null}

      <Card>
        {stepId === 'type_nom' ? <TypeNomStep data={data} backHref={backHref} returnTo={returnTo} /> : null}
        {stepId === 'beneficiaire' ? (
          <BeneficiaireStep data={data} teams={teams} clubs={clubs} backHref={backHref} returnTo={returnTo} />
        ) : null}
        {stepId === 'objectif_dates' ? (
          <ObjectifDatesStep data={data} backHref={backHref} returnTo={returnTo} />
        ) : null}
        {stepId === 'participants' ? (
          <ParticipantsStep data={data} athletes={athletes} backHref={backHref} returnTo={returnTo} />
        ) : null}
        {stepId === 'packs' ? (
          <PacksStep data={data} products={products} backHref={backHref} returnTo={returnTo} />
        ) : null}
        {stepId === 'recap' ? (
          <RecapStep
            data={data}
            teams={teams}
            clubs={clubs}
            athletes={athletes}
            products={products}
            backHref={backHref}
            previewIdentity={previewIdentity}
          />
        ) : null}
      </Card>
    </main>
  );
}

/** `<input type="datetime-local">` n'accepte que `YYYY-MM-DDTHH:mm` ; même
 * simplification de fuseau que `actions.ts#toIsoOrNull` (fuseau du serveur
 * traité comme local, cohérent avec le Québec, CLAUDE.md section 2) —
 * uniquement pour préremplir l'affichage, aucune incidence sur la donnée
 * stockée (toujours l'ISO d'origine tant que ce champ n'est pas resoumis). */
function isoToDatetimeLocalValue(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 16);
}

function formatDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

interface StepProps {
  data: CampaignDraftData;
  backHref?: string;
  /** `'recap'` quand cette étape a été ouverte depuis le lien « Modifier »
   * du récapitulatif (Tâche 1.6.B3) — reporté dans un champ caché du
   * formulaire pour que l'action de sauvegarde sache renvoyer ici plutôt que
   * d'avancer à l'étape suivante (voir `saveStepAndAdvance`, actions.ts). */
  returnTo?: 'recap';
}

/** Champ caché commun à toutes les étapes — voir `StepProps.returnTo`. */
function ReturnToField({ returnTo }: { returnTo?: 'recap' }): JSX.Element | null {
  return returnTo ? <input type="hidden" name="retour" value={returnTo} /> : null;
}

/** « Continuer » par défaut, mais « Enregistrer et revenir au récapitulatif »
 * quand l'étape a été ouverte depuis « Modifier » — pour que le bouton
 * annonce honnêtement où il mène (Tâche 1.6.B3, critère « correction en un
 * clic »). */
function continueLabelFor(returnTo: 'recap' | undefined, defaultLabel = 'Continuer'): string {
  return returnTo === 'recap' ? 'Enregistrer et revenir au récapitulatif' : defaultLabel;
}

function TypeNomStep({ data, backHref, returnTo }: StepProps): JSX.Element {
  return (
    <form action={saveTypeNomStepAction} className="form form--wide stack">
      <ReturnToField returnTo={returnTo} />
      <section className="stack stack--sm">
        <h2>{CAMPAIGN_DRAFT_STEP_LABELS.type_nom}</h2>

        <Field label="Nom de la campagne" required>
          <input type="text" name="name" required maxLength={200} defaultValue={data.name ?? ''} />
        </Field>

        <Field label="Type de campagne" required>
          <select name="type" required defaultValue={data.type ?? 'team'}>
            <option value="team">Équipe</option>
            <option value="club">Club</option>
            <option value="athlete">Athlète</option>
            <option value="event">Événement</option>
            <option value="annual">Annuelle</option>
            <option value="reorder">Réapprovisionnement</option>
          </select>
        </Field>

        <Field label="Message public (optionnel)">
          <textarea name="publicMessage" maxLength={2000} defaultValue={data.publicMessage ?? ''} />
        </Field>
      </section>

      <WizardNav backHref={backHref} continueLabel={continueLabelFor(returnTo)} />
    </form>
  );
}

interface BeneficiaireStepProps extends StepProps {
  teams: ManagedTeamOption[];
  clubs: ManagedClubOption[];
}

function BeneficiaireStep({ data, teams, clubs, backHref, returnTo }: BeneficiaireStepProps): JSX.Element {
  return (
    <form action={saveBeneficiaireStepAction} className="form form--wide stack">
      <ReturnToField returnTo={returnTo} />
      <section className="stack stack--sm">
        <h2>{CAMPAIGN_DRAFT_STEP_LABELS.beneficiaire}</h2>
        <p>
          Pour un bénéficiaire équipe/club, l&apos;identifiant doit être identique à celui de
          l&apos;équipe ou du club rattaché ci-dessous.
        </p>

        <h3>Vos équipes</h3>
        {teams.length === 0 ? (
          <Alert variant="info">Aucune équipe gérée.</Alert>
        ) : (
          <ul>
            {teams.map((team) => (
              <li key={team.id}>
                {team.name} — identifiant : <code>{team.id}</code>
              </li>
            ))}
          </ul>
        )}

        <h3>Vos clubs</h3>
        {clubs.length === 0 ? (
          <Alert variant="info">Aucun club géré.</Alert>
        ) : (
          <ul>
            {clubs.map((club) => (
              <li key={club.id}>
                {club.name} — identifiant : <code>{club.id}</code>
              </li>
            ))}
          </ul>
        )}

        <div className="form__row">
          <Field label="Identifiant de l'équipe rattachée (optionnel)">
            <input type="text" name="teamId" placeholder="UUID" defaultValue={data.teamId ?? ''} />
          </Field>

          <Field label="Identifiant du club rattaché (optionnel)">
            <input type="text" name="clubId" placeholder="UUID" defaultValue={data.clubId ?? ''} />
          </Field>
        </div>

        <div className="form__row">
          <Field label="Type de bénéficiaire" required>
            <select name="beneficiaryType" required defaultValue={data.beneficiaryType ?? 'team'}>
              <option value="team">Équipe</option>
              <option value="club">Club</option>
              <option value="athlete">Athlète</option>
            </select>
          </Field>

          <Field label="Identifiant du bénéficiaire" required>
            <input
              type="text"
              name="beneficiaryId"
              required
              placeholder="UUID"
              defaultValue={data.beneficiaryId ?? ''}
            />
          </Field>
        </div>
      </section>

      <WizardNav backHref={backHref} continueLabel={continueLabelFor(returnTo)} />
    </form>
  );
}

function ObjectifDatesStep({ data, backHref, returnTo }: StepProps): JSX.Element {
  return (
    <form action={saveObjectifDatesStepAction} className="form form--wide stack">
      <ReturnToField returnTo={returnTo} />
      <section className="stack stack--sm">
        <h2>{CAMPAIGN_DRAFT_STEP_LABELS.objectif_dates}</h2>

        <div className="form__row">
          <Field label="Objectif (en cents, optionnel)">
            <input type="number" name="goalCents" min={0} step={1} defaultValue={data.goalCents ?? ''} />
          </Field>

          <Field label="Date de début" required>
            <input
              type="datetime-local"
              name="startsAt"
              required
              defaultValue={isoToDatetimeLocalValue(data.startsAt)}
            />
          </Field>

          <Field label="Date de fin (optionnel)">
            <input
              type="datetime-local"
              name="endsAt"
              defaultValue={isoToDatetimeLocalValue(data.endsAt)}
            />
          </Field>
        </div>
      </section>

      <WizardNav backHref={backHref} continueLabel={continueLabelFor(returnTo)} />
    </form>
  );
}

interface ParticipantsStepProps extends StepProps {
  athletes: ManagedAthleteOption[];
}

function ParticipantsStep({ data, athletes, backHref, returnTo }: ParticipantsStepProps): JSX.Element {
  const selected = new Set(data.participantAthleteIds ?? []);
  return (
    <form action={saveParticipantsStepAction} className="form form--wide stack">
      <ReturnToField returnTo={returnTo} />
      <section className="stack stack--sm">
        <h2>{CAMPAIGN_DRAFT_STEP_LABELS.participants}</h2>

        {data.teamId ? (
          <form action={addAthletesBulkAction} className="stack stack--sm form__subsection">
            <input type="hidden" name="teamId" value={data.teamId} />
            <Field label="Ajouter des athlètes en lot (un par ligne : Prénom Nom, ou Prénom, Nom, Catégorie)">
              <textarea
                name="pastedList"
                rows={4}
                placeholder={'Jean Tremblay\nMarie, Gagnon, Natation'}
              />
            </Field>
            <div className="form__actions">
              <Button type="submit" variant="outline">
                Ajouter la liste collée
              </Button>
            </div>
          </form>
        ) : (
          <Alert variant="info">
            Choisissez d&apos;abord une équipe à l&apos;étape « Bénéficiaire » pour ajouter des
            athlètes en lot.
          </Alert>
        )}

        {athletes.length === 0 ? (
          <Alert variant="info">Aucun athlète disponible dans votre périmètre.</Alert>
        ) : (
          <div className="checkbox-list">
            {athletes.map((athlete) => (
              <div key={athlete.id} className="checkbox-row">
                <input
                  type="checkbox"
                  id={`participant-${athlete.id}`}
                  name="participantAthleteIds"
                  value={athlete.id}
                  defaultChecked={selected.has(athlete.id)}
                />
                <label htmlFor={`participant-${athlete.id}`}>
                  {athlete.firstName} {athlete.lastName}
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      <WizardNav backHref={backHref} continueLabel={continueLabelFor(returnTo)} />
    </form>
  );
}

interface PacksStepProps extends StepProps {
  products: Array<{ id: string; name: string }>;
}

function PacksStep({ data, products, backHref, returnTo }: PacksStepProps): JSX.Element {
  const selected = new Set(data.productIds ?? []);
  return (
    <form action={savePacksStepAction} className="form form--wide stack">
      <ReturnToField returnTo={returnTo} />
      <section className="stack stack--sm">
        <h2>{CAMPAIGN_DRAFT_STEP_LABELS.packs}</h2>
        {products.length === 0 ? (
          <Alert variant="info">Aucun pack actif au catalogue.</Alert>
        ) : (
          <div className="checkbox-list">
            {products.map((product) => (
              <div key={product.id} className="checkbox-row">
                <input
                  type="checkbox"
                  id={`product-${product.id}`}
                  name="productIds"
                  value={product.id}
                  defaultChecked={selected.has(product.id)}
                />
                <label htmlFor={`product-${product.id}`}>{product.name}</label>
              </div>
            ))}
          </div>
        )}
      </section>

      <WizardNav backHref={backHref} continueLabel={continueLabelFor(returnTo)} />
    </form>
  );
}

interface RecapStepProps extends StepProps {
  teams: ManagedTeamOption[];
  clubs: ManagedClubOption[];
  athletes: ManagedAthleteOption[];
  products: Array<{ id: string; name: string }>;
  /** `null` si l'étape « Bénéficiaire » n'a encore désigné personne, ou si le
   * bénéficiaire choisi n'a (plus) de ligne dans la vue publique
   * correspondante — l'aperçu affiche alors un message plutôt qu'un faux
   * profil (voir le rendu ci-dessous). */
  previewIdentity: BeneficiaryPreviewIdentity | null;
}

/** Lien « Modifier » d'une section du récapitulatif (Tâche 1.6.B3, critère
 * « correction en un clic ») : amène à l'étape concernée avec
 * `?retour=recap`, pour que « Enregistrer et revenir au récapitulatif »
 * ramène ici directement après la correction — voir `ReturnToField` et
 * `saveStepAndAdvance` (actions.ts). */
function ModifierLink({ stepNumber }: { stepNumber: number }): JSX.Element {
  return (
    <Button href={`${NOUVELLE_CAMPAGNE_PATH}?etape=${stepNumber}&retour=recap`} variant="outline" size="sm">
      Modifier
    </Button>
  );
}

function RecapStep({
  data,
  teams,
  clubs,
  athletes,
  products,
  backHref,
  previewIdentity,
}: RecapStepProps): JSX.Element {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const beneficiaryLabel = (() => {
    if (!data.beneficiaryType || !data.beneficiaryId) return null;
    if (data.beneficiaryType === 'team') return teamById.get(data.beneficiaryId)?.name ?? data.beneficiaryId;
    if (data.beneficiaryType === 'club') return clubById.get(data.beneficiaryId)?.name ?? data.beneficiaryId;
    const athlete = athleteById.get(data.beneficiaryId);
    return athlete ? `${athlete.firstName} ${athlete.lastName}` : data.beneficiaryId;
  })();

  const previewCampaignSection = buildDraftPreviewCampaignSection(data);
  const previewEncouragerHref =
    data.beneficiaryType && data.beneficiaryId
      ? `/boutique?beneficiaryType=${data.beneficiaryType}&beneficiaryId=${data.beneficiaryId}`
      : '/boutique';

  return (
    <form action={createCampaignFromDraftAction} className="form form--wide stack">
      <section className="stack stack--sm">
        <h2>{CAMPAIGN_DRAFT_STEP_LABELS.recap}</h2>
        <p>Vérifiez les informations avant de lancer la campagne — tout reste modifiable en un clic.</p>

        <div className="recap-section">
          <div className="recap-section__header">
            <h3>Type et nom</h3>
            <ModifierLink stepNumber={1} />
          </div>
          <dl className="recap-list">
            <dt>Nom</dt>
            <dd>{data.name ?? '—'}</dd>

            <dt>Type</dt>
            <dd>{data.type ? TYPE_LABELS[data.type] : '—'}</dd>

            {data.publicMessage ? (
              <>
                <dt>Message public</dt>
                <dd>{data.publicMessage}</dd>
              </>
            ) : null}
          </dl>
        </div>

        <div className="recap-section">
          <div className="recap-section__header">
            <h3>Bénéficiaire</h3>
            <ModifierLink stepNumber={2} />
          </div>
          <dl className="recap-list">
            <dt>Équipe</dt>
            <dd>{data.teamId ? teamById.get(data.teamId)?.name ?? data.teamId : '—'}</dd>

            <dt>Club</dt>
            <dd>{data.clubId ? clubById.get(data.clubId)?.name ?? data.clubId : '—'}</dd>

            <dt>Bénéficiaire</dt>
            <dd>
              {data.beneficiaryType ? BENEFICIARY_TYPE_LABELS[data.beneficiaryType] : '—'}
              {beneficiaryLabel ? ` — ${beneficiaryLabel}` : ''}
            </dd>
          </dl>
        </div>

        <div className="recap-section">
          <div className="recap-section__header">
            <h3>Objectif et dates</h3>
            <ModifierLink stepNumber={3} />
          </div>
          <dl className="recap-list">
            <dt>Objectif</dt>
            <dd>{data.goalCents != null ? `${(data.goalCents / 100).toFixed(2)} $` : 'Aucun objectif fixé'}</dd>

            <dt>Dates</dt>
            <dd>
              {formatDateTime(data.startsAt) ?? '—'}
              {data.endsAt ? ` → ${formatDateTime(data.endsAt)}` : ''}
            </dd>
          </dl>
        </div>

        <div className="recap-section">
          <div className="recap-section__header">
            <h3>Athlètes participants</h3>
            <ModifierLink stepNumber={4} />
          </div>
          <dl className="recap-list">
            <dt>Athlètes participants</dt>
            <dd>
              {data.participantAthleteIds && data.participantAthleteIds.length > 0
                ? data.participantAthleteIds
                    .map((id) => {
                      const athlete = athleteById.get(id);
                      return athlete ? `${athlete.firstName} ${athlete.lastName}` : id;
                    })
                    .join(', ')
                : 'Aucun'}
            </dd>
          </dl>
        </div>

        <div className="recap-section">
          <div className="recap-section__header">
            <h3>Packs inclus</h3>
            <ModifierLink stepNumber={5} />
          </div>
          <dl className="recap-list">
            <dt>Packs inclus</dt>
            <dd>
              {data.productIds && data.productIds.length > 0
                ? data.productIds.map((id) => productById.get(id)?.name ?? id).join(', ')
                : '—'}
            </dd>
          </dl>
        </div>

        <Alert variant="info">
          Le calcul du crédit suit les règles déjà en vigueur (produit ou campagne) — réglées par
          l&apos;administration. Vous verrez ici uniquement le montant amassé par votre campagne, pas
          les taux.
        </Alert>
      </section>

      <section className="stack stack--sm">
        <h2>Aperçu de la page publique</h2>
        <p>
          Voici exactement ce que verra une personne qui visite la page publique du bénéficiaire,
          dès l&apos;activation.
        </p>
        {previewIdentity ? (
          <Card>
            <PublicProfileView
              imageUrl={previewIdentity.imageUrl}
              imageAlt={previewIdentity.name}
              name={previewIdentity.name}
              badges={
                <>
                  {previewIdentity.sport ? <Badge variant="info">{previewIdentity.sport}</Badge> : null}
                  {previewIdentity.category ? <Badge>{previewIdentity.category}</Badge> : null}
                  {previewIdentity.city ? (
                    <Badge>{[previewIdentity.city, previewIdentity.province].filter(Boolean).join(', ')}</Badge>
                  ) : null}
                </>
              }
              bodyText={previewIdentity.bodyText}
              campaignSection={previewCampaignSection}
              encouragerHref={previewEncouragerHref}
              recommendedProducts={[]}
            />
          </Card>
        ) : (
          <Alert variant="info">
            Choisissez d&apos;abord un bénéficiaire (étape « Bénéficiaire ») pour voir l&apos;aperçu de
            sa page publique.
          </Alert>
        )}
      </section>

      <section className="stack stack--sm">
        <h2>Aperçu de l&apos;affiche</h2>
        <p>Une affiche imprimable (sans QR code pour l&apos;instant) sera disponible dès l&apos;activation.</p>
        <Card>
          <div className="poster poster--preview">
            <h3>{data.name ?? 'Nom de la campagne'}</h3>
            {data.publicMessage ? <p>{data.publicMessage}</p> : null}
            <p className="poster__url">Lien généré automatiquement à l&apos;activation</p>
          </div>
        </Card>
      </section>

      <WizardNav backHref={backHref} continueLabel="Lancer ma campagne" />
    </form>
  );
}
