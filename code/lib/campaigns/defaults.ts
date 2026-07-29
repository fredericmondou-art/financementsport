/**
 * Défauts intelligents de l'assistant de campagne (Tâche 1.6.B2, voir
 * docs/prompts/phase-1-6.md) : « Une campagne valide doit pouvoir être créée
 * en acceptant tous les défauts. » Pur, sans I/O — calcule seulement des
 * valeurs de repli à partir des options déjà chargées par la page
 * (`loadCampaignWizardOptions`, lib/campaigns/manager-scope.ts).
 *
 * Ne complète QUE les champs absents (`data.x === undefined`) : un choix déjà
 * fait par le gestionnaire à une étape précédente n'est jamais écrasé —
 * propriété indispensable pour que « retour arrière sans perte » (Tâche
 * 1.6.B1) continue de s'appliquer même avec des défauts actifs. Ces valeurs
 * ne sont que des `defaultValue` HTML (voir page.tsx) : un brouillon ne
 * contient réellement un champ qu'une fois l'étape soumise (« Continuer »),
 * jamais une valeur deviné que le gestionnaire n'a pas vue passer.
 *
 * Aucune RÈGLE DE CRÉDIT ici (principe du Bloc B, voir lib/campaigns/
 * draft.ts) : ce module ne touche jamais à `creditRule`.
 *
 * Décision autonome (voir docs/DECISIONS.md) : quand un gestionnaire gère à
 * la fois une équipe ET un club, le défaut préfère l'équipe (périmètre plus
 * étroit, plus simple à raisonner) — accepter tous les défauts reste une
 * campagne valide dans les deux cas, ce n'est qu'un choix de priorité.
 *
 * P.3 (SPEC-PARAMETRES-PLATEFORME.md, R1/R2) : la durée par défaut était
 * auparavant une constante fixe (60 jours), qui violerait désormais R1 (max
 * configurable, 21 jours par défaut). Les défauts de date/livraison sont
 * maintenant sourcés depuis `parametres_plateforme` (`campagne_duree_jours.
 * defaut`, `campagne_delai_livraison_jours_max`), chargés par l'appelant
 * (`lib/parametres.ts`, qui a besoin d'un `SupabaseClient` — ce module reste
 * pur/synchrone, voir `CampaignDefaultsOptions.campaignDurationDefaultDays`/
 * `deliveryDelayMaxDays`) et transmis via `options`, PAS lus ici directement.
 * `DEFAULT_CAMPAIGN_DURATION_DAYS`/`DEFAULT_DELIVERY_DELAY_DAYS` ci-dessous
 * ne sont plus que des replis si l'appelant ne fournit pas ces options
 * (ex. anciens tests) -- alignés sur `PARAMETRES_DEFAUT` (lib/parametres.ts)
 * pour rester cohérents par défaut.
 */
import type { CampaignDraftData } from './draft';
import type { ManagedAthleteOption, ManagedClubOption, ManagedTeamOption } from './manager-scope';

export interface CampaignDefaultsOptions {
  teams: ManagedTeamOption[];
  clubs: ManagedClubOption[];
  athletes: ManagedAthleteOption[];
  products: Array<{ id: string; name: string }>;
  /** P.3 : `parametres.campagne_duree_jours.defaut` -- durée par défaut
   * (jours) d'une campagne sans dates choisies. Repli : voir
   * `DEFAULT_CAMPAIGN_DURATION_DAYS`. */
  campaignDurationDefaultDays?: number;
  /** P.3 : `parametres.campagne_delai_livraison_jours_max` -- utilisé pour
   * borner (jamais dépasser) le délai de livraison par défaut proposé.
   * Repli : voir `DEFAULT_DELIVERY_DELAY_DAYS`. */
  deliveryDelayMaxDays?: number;
  /** P.6 (SPEC-PARAMETRES-PLATEFORME.md, R6) :
   * `parametres.campagne_objectif_athlete_suggere.defaut` -- objectif
   * pré-rempli quand le gestionnaire n'en a pas encore choisi un. Absent en
   * environnement de test qui ne fournit pas cette option : le champ reste
   * alors vide comme avant P.6 (règle "souple", aucune valeur imposée). */
  objectifSuggereDefautCents?: number;
}

/** Repli si `options.campaignDurationDefaultDays` est absent -- aligné sur
 * `PARAMETRES_DEFAUT.campagne_duree_jours.defaut` (lib/parametres.ts). */
export const DEFAULT_CAMPAIGN_DURATION_DAYS = 14;

/** Délai (jours) entre la clôture par défaut et la date de livraison par
 * défaut proposée -- choix UX autonome (voir docs/DECISIONS.md) : la spec ne
 * définit pas de "defaut" pour `campagne_delai_livraison_jours_max` (seul un
 * maximum est configuré), donc ce module en choisit un raisonnable, borné
 * par `options.deliveryDelayMaxDays` pour ne jamais dépasser le plafond
 * configuré même s'il est un jour abaissé sous 7. */
export const DEFAULT_DELIVERY_DELAY_DAYS = 7;

function defaultTypeNom(
  data: CampaignDraftData,
  options: CampaignDefaultsOptions,
): Pick<CampaignDraftData, 'type' | 'name'> {
  const team = options.teams[0];
  const club = options.clubs[0];
  return {
    type: data.type ?? (team ? 'team' : club ? 'club' : 'team'),
    name: data.name ?? (team ? `Campagne — ${team.name}` : club ? `Campagne — ${club.name}` : undefined),
  };
}

function defaultBeneficiaire(
  data: CampaignDraftData,
  options: CampaignDefaultsOptions,
): Pick<CampaignDraftData, 'teamId' | 'clubId' | 'beneficiaryType' | 'beneficiaryId'> {
  const team = options.teams[0];
  const club = options.clubs[0];
  if (team) {
    return {
      teamId: data.teamId ?? team.id,
      clubId: data.clubId ?? team.clubId ?? null,
      beneficiaryType: data.beneficiaryType ?? 'team',
      beneficiaryId: data.beneficiaryId ?? team.id,
    };
  }
  if (club) {
    return {
      teamId: data.teamId ?? null,
      clubId: data.clubId ?? club.id,
      beneficiaryType: data.beneficiaryType ?? 'club',
      beneficiaryId: data.beneficiaryId ?? club.id,
    };
  }
  return {
    teamId: data.teamId,
    clubId: data.clubId,
    beneficiaryType: data.beneficiaryType,
    beneficiaryId: data.beneficiaryId,
  };
}

function defaultObjectifDates(
  data: CampaignDraftData,
  options: CampaignDefaultsOptions,
): Pick<CampaignDraftData, 'goalCents' | 'startsAt' | 'endsAt' | 'deliveryDate'> {
  const durationDays = options.campaignDurationDefaultDays ?? DEFAULT_CAMPAIGN_DURATION_DAYS;
  const deliveryDelayDays = Math.min(
    DEFAULT_DELIVERY_DELAY_DAYS,
    options.deliveryDelayMaxDays ?? DEFAULT_DELIVERY_DELAY_DAYS,
  );
  const now = new Date();
  const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const endsAt = data.endsAt ?? end.toISOString();
  const delivery = new Date(new Date(endsAt).getTime() + deliveryDelayDays * 24 * 60 * 60 * 1000);
  return {
    // P.6 (R6) : pré-rempli au montant suggéré si le gestionnaire n'a pas
    // encore choisi d'objectif -- `null` (objectif explicitement effacé par
    // le gestionnaire) reste `null`, seul `undefined` (jamais saisi) reçoit
    // le défaut. Piège évité ici : `??` traite `null` ET `undefined` comme
    // "absent", ce qui écraserait à tort un objectif volontairement effacé
    // -- on distingue donc explicitement les deux avec `!== undefined`.
    goalCents: data.goalCents !== undefined ? data.goalCents : options.objectifSuggereDefautCents,
    startsAt: data.startsAt ?? now.toISOString(),
    endsAt,
    deliveryDate: data.deliveryDate ?? delivery.toISOString(),
  };
}

function defaultParticipants(
  data: CampaignDraftData,
  options: CampaignDefaultsOptions,
): Pick<CampaignDraftData, 'participantAthleteIds'> {
  return {
    participantAthleteIds: data.participantAthleteIds ?? options.athletes.map((athlete) => athlete.id),
  };
}

function defaultPacks(
  data: CampaignDraftData,
  options: CampaignDefaultsOptions,
): Pick<CampaignDraftData, 'productIds'> {
  return {
    productIds: data.productIds ?? options.products.map((product) => product.id),
  };
}

/** Assemble les défauts de chaque étape sous les données déjà présentes (voir
 * en-tête de fichier — chaque fonction `defaultX` préserve déjà `data.x` si
 * présent ; cette fonction ne fait qu'assembler les sous-objets). */
export function applyCampaignDefaults(
  data: CampaignDraftData,
  options: CampaignDefaultsOptions,
): CampaignDraftData {
  return {
    ...data,
    ...defaultTypeNom(data, options),
    ...defaultBeneficiaire(data, options),
    ...defaultObjectifDates(data, options),
    ...defaultParticipants(data, options),
    ...defaultPacks(data, options),
  };
}

export type { ManagedAthleteOption, ManagedClubOption, ManagedTeamOption };
