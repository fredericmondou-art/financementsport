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
 */
import type { CampaignDraftData } from './draft';
import type { ManagedAthleteOption, ManagedClubOption, ManagedTeamOption } from './manager-scope';

export interface CampaignDefaultsOptions {
  teams: ManagedTeamOption[];
  clubs: ManagedClubOption[];
  athletes: ManagedAthleteOption[];
  products: Array<{ id: string; name: string }>;
}

/** Durée par défaut d'une campagne sans dates choisies : assez longue pour ne
 * pas forcer un retour précipité sur l'assistant, assez courte pour rester
 * une « campagne » au sens normal plutôt qu'une permanence. */
export const DEFAULT_CAMPAIGN_DURATION_DAYS = 60;

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
): Pick<CampaignDraftData, 'goalCents' | 'startsAt' | 'endsAt'> {
  const now = new Date();
  const end = new Date(now.getTime() + DEFAULT_CAMPAIGN_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return {
    goalCents: data.goalCents,
    startsAt: data.startsAt ?? now.toISOString(),
    endsAt: data.endsAt ?? end.toISOString(),
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
    ...defaultObjectifDates(data),
    ...defaultParticipants(data, options),
    ...defaultPacks(data, options),
  };
}

export type { ManagedAthleteOption, ManagedClubOption, ManagedTeamOption };
