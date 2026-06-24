/**
 * Test d'intégration (Tâche 1.6) : chargement des données de page publique
 * (athlète/équipe/club) via des repos en mémoire — même convention que
 * `tests/integration/cart.test.ts` (réseau vers *.supabase.co bloqué dans ce
 * bac à sable). Couvre en particulier le respect de `hide_amounts`
 * (CLAUDE.md section 5 : ne jamais exposer un montant masqué) et le choix de
 * la campagne la plus pertinente quand plusieurs campagnes actives ciblent
 * le même bénéficiaire.
 */
import { describe, expect, it } from 'vitest';
import {
  loadPublicAthleteProfile,
  loadPublicClubProfile,
  loadPublicTeamProfile,
  type PublicAthleteRow,
  type PublicClubRow,
  type PublicProfileRepo,
  type PublicTeamRow,
} from '@/lib/public/profile';
import { loadOwnerCampaignSection } from '@/lib/athletes/profile';
import type { PublicCampaignRow } from '@/lib/public/campaign-progress';
import type { ProductRepo, ProductRow } from '@/lib/catalog/products';
import type { BeneficiaryType, VCampaignProgressView } from '@/lib/db/types';

function makeAthlete(overrides: Partial<PublicAthleteRow> = {}): PublicAthleteRow {
  return {
    id: 'athlete-1',
    team_id: null,
    first_name: 'Camille',
    last_name: 'Tremblay',
    display_name: 'Camille T.',
    slug: 'camille-t',
    sport: 'Soccer',
    city: 'Québec',
    photo_url: null,
    personal_message: null,
    hide_amounts: false,
    show_team_only: false,
    ...overrides,
  };
}

function makeTeam(overrides: Partial<PublicTeamRow> = {}): PublicTeamRow {
  return {
    id: 'team-1',
    club_id: null,
    name: 'Les Faucons',
    slug: 'les-faucons',
    sport: 'Soccer',
    category: 'U12',
    logo_url: null,
    city: 'Québec',
    province: 'QC',
    ...overrides,
  };
}

function makeClub(overrides: Partial<PublicClubRow> = {}): PublicClubRow {
  return {
    id: 'club-1',
    name: 'Club Sportif Laval',
    slug: 'club-sportif-laval',
    description: null,
    logo_url: null,
    city: 'Laval',
    province: 'QC',
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<PublicCampaignRow>): PublicCampaignRow {
  return {
    id: overrides.id ?? 'campaign-1',
    type: 'team',
    name: 'Campagne annuelle',
    slug: 'campagne-annuelle',
    public_message: 'Encouragez-nous !',
    beneficiary_type: 'team',
    beneficiary_id: 'team-1',
    goal_cents: 100000,
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: '2026-12-31T00:00:00Z',
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: overrides.id ?? 'product-1',
    kind: 'pack',
    category_id: null,
    name: 'Pack encouragement',
    slug: 'pack-encouragement',
    description: null,
    image_url: null,
    price_cents: 2000,
    fixed_credit_cents: 500,
    is_taxable: true,
    stock_quantity: 10,
    lead_time_days: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

interface FakeProfileFixtures {
  athletes?: PublicAthleteRow[];
  teams?: PublicTeamRow[];
  clubs?: PublicClubRow[];
  campaigns?: PublicCampaignRow[];
  progressByCampaignId?: Map<string, number>;
  campaignProductIdsByCampaignId?: Map<string, string[]>;
}

function createFakeProfileRepo(fixtures: FakeProfileFixtures = {}): PublicProfileRepo {
  const athletes = fixtures.athletes ?? [];
  const teams = fixtures.teams ?? [];
  const clubs = fixtures.clubs ?? [];
  const campaigns = fixtures.campaigns ?? [];
  const progressByCampaignId = fixtures.progressByCampaignId ?? new Map();
  const campaignProductIdsByCampaignId = fixtures.campaignProductIdsByCampaignId ?? new Map();

  return {
    async getAthleteBySlug(slug) {
      return athletes.find((a) => a.slug === slug) ?? null;
    },
    async getTeamBySlug(slug) {
      return teams.find((t) => t.slug === slug) ?? null;
    },
    async getClubBySlug(slug) {
      return clubs.find((c) => c.slug === slug) ?? null;
    },
    async listActiveCampaignsForBeneficiary(beneficiaryType: BeneficiaryType, beneficiaryId: string) {
      return campaigns.filter(
        (c) => c.beneficiary_type === beneficiaryType && c.beneficiary_id === beneficiaryId,
      );
    },
    async getCampaignProgress(campaignId) {
      if (!progressByCampaignId.has(campaignId)) {
        return null;
      }
      const row: VCampaignProgressView['Row'] = {
        campaign_id: campaignId,
        goal_cents: campaigns.find((c) => c.id === campaignId)?.goal_cents ?? null,
        raised_cents: progressByCampaignId.get(campaignId) ?? 0,
      };
      return row;
    },
    async getCampaignProductIds(campaignId) {
      return campaignProductIdsByCampaignId.get(campaignId) ?? [];
    },
  };
}

function createFakeProductRepo(products: ProductRow[]): ProductRepo {
  return {
    async isSlugTaken() {
      return false;
    },
    async insertProduct() {
      throw new Error('non utilisé dans ce test');
    },
    async getProductById(id) {
      return products.find((p) => p.id === id) ?? null;
    },
    async updateProduct() {
      throw new Error('non utilisé dans ce test');
    },
    async listActiveProducts() {
      return products.filter((p) => p.is_active);
    },
    async getUnitsSoldByProductId() {
      return new Map();
    },
  };
}

// `supabase` n'est jamais utilisé : tous les repos sont injectés explicitement.
const unusedSupabaseClient = null as unknown as Parameters<typeof loadPublicAthleteProfile>[0];

describe('loadPublicAthleteProfile', () => {
  it('retourne null si le slug ne correspond à aucun athlète (page appelle notFound())', async () => {
    const repo = createFakeProfileRepo();
    const result = await loadPublicAthleteProfile(
      unusedSupabaseClient,
      'inconnu',
      repo,
      createFakeProductRepo([]),
    );
    expect(result).toBeNull();
  });

  it('retourne le profil avec campaignSection null si aucune campagne active ne cible l’athlète', async () => {
    const athlete = makeAthlete();
    const repo = createFakeProfileRepo({ athletes: [athlete] });
    const result = await loadPublicAthleteProfile(
      unusedSupabaseClient,
      athlete.slug,
      repo,
      createFakeProductRepo([]),
    );
    expect(result?.campaignSection).toBeNull();
  });

  it('calcule la progression à partir de la campagne active ciblant directement l’athlète', async () => {
    const athlete = makeAthlete();
    const campaign = makeCampaign({
      id: 'c1',
      beneficiary_type: 'athlete',
      beneficiary_id: athlete.id,
      goal_cents: 10000,
    });
    const repo = createFakeProfileRepo({
      athletes: [athlete],
      campaigns: [campaign],
      progressByCampaignId: new Map([['c1', 2500]]),
    });
    const result = await loadPublicAthleteProfile(
      unusedSupabaseClient,
      athlete.slug,
      repo,
      createFakeProductRepo([]),
    );
    expect(result?.campaignSection?.progress).toEqual({
      raisedCents: 2500,
      goalCents: 10000,
      percent: 25,
      isGoalExceeded: false,
    });
  });

  it('masque les montants quand hide_amounts est vrai (ne fuite jamais le montant réel)', async () => {
    const athlete = makeAthlete({ hide_amounts: true });
    const campaign = makeCampaign({
      id: 'c1',
      beneficiary_type: 'athlete',
      beneficiary_id: athlete.id,
      goal_cents: 10000,
    });
    const repo = createFakeProfileRepo({
      athletes: [athlete],
      campaigns: [campaign],
      progressByCampaignId: new Map([['c1', 9999]]),
    });
    const result = await loadPublicAthleteProfile(
      unusedSupabaseClient,
      athlete.slug,
      repo,
      createFakeProductRepo([]),
    );
    expect(result?.campaignSection?.progress).toEqual({
      raisedCents: 0,
      goalCents: null,
      percent: null,
      isGoalExceeded: false,
    });
  });

  it('expose show_team_only sur le profil (la page, pas ce loader, décide d’appeler notFound())', async () => {
    const athlete = makeAthlete({ show_team_only: true });
    const repo = createFakeProfileRepo({ athletes: [athlete] });
    const result = await loadPublicAthleteProfile(
      unusedSupabaseClient,
      athlete.slug,
      repo,
      createFakeProductRepo([]),
    );
    expect(result?.profile.show_team_only).toBe(true);
  });

  it('limite les packs recommandés à la curation de la campagne active quand elle existe', async () => {
    const athlete = makeAthlete();
    const campaign = makeCampaign({
      id: 'c1',
      beneficiary_type: 'athlete',
      beneficiary_id: athlete.id,
    });
    const curated = makeProduct({ id: 'curated', fixed_credit_cents: 100 });
    const autre = makeProduct({ id: 'autre', fixed_credit_cents: 9999 });
    const repo = createFakeProfileRepo({
      athletes: [athlete],
      campaigns: [campaign],
      progressByCampaignId: new Map([['c1', 0]]),
      campaignProductIdsByCampaignId: new Map([['c1', ['curated']]]),
    });
    const result = await loadPublicAthleteProfile(
      unusedSupabaseClient,
      athlete.slug,
      repo,
      createFakeProductRepo([curated, autre]),
    );
    expect(result?.recommendedProducts.map((p) => p.id)).toEqual(['curated']);
  });
});

describe('loadPublicTeamProfile', () => {
  it('retourne null pour un slug inconnu', async () => {
    const repo = createFakeProfileRepo();
    const result = await loadPublicTeamProfile(
      unusedSupabaseClient,
      'inconnue',
      repo,
      createFakeProductRepo([]),
    );
    expect(result).toBeNull();
  });

  it('n’applique aucun masquage de montants (teams n’a pas de champ hide_amounts)', async () => {
    const team = makeTeam();
    const campaign = makeCampaign({
      id: 'c1',
      beneficiary_type: 'team',
      beneficiary_id: team.id,
      goal_cents: 5000,
    });
    const repo = createFakeProfileRepo({
      teams: [team],
      campaigns: [campaign],
      progressByCampaignId: new Map([['c1', 1000]]),
    });
    const result = await loadPublicTeamProfile(
      unusedSupabaseClient,
      team.slug,
      repo,
      createFakeProductRepo([]),
    );
    expect(result?.campaignSection?.progress.raisedCents).toBe(1000);
  });
});

describe('loadPublicClubProfile', () => {
  it('retourne null pour un slug inconnu', async () => {
    const repo = createFakeProfileRepo();
    const result = await loadPublicClubProfile(
      unusedSupabaseClient,
      'inconnu',
      repo,
      createFakeProductRepo([]),
    );
    expect(result).toBeNull();
  });

  it('retombe sur le catalogue actif complet pour les packs recommandés sans campagne curée', async () => {
    const club = makeClub();
    const repo = createFakeProfileRepo({ clubs: [club] });
    const product = makeProduct({ id: 'p1' });
    const result = await loadPublicClubProfile(
      unusedSupabaseClient,
      club.slug,
      repo,
      createFakeProductRepo([product]),
    );
    expect(result?.recommendedProducts.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('loadOwnerCampaignSection (Tâche 1.6.C1 — vue privée du tuteur)', () => {
  it('retourne null si aucune campagne active ne cible l’athlète', async () => {
    const repo = createFakeProfileRepo();
    const result = await loadOwnerCampaignSection(unusedSupabaseClient, 'athlete-1', repo);
    expect(result).toBeNull();
  });

  it('calcule la progression à partir de la campagne active ciblant directement l’athlète', async () => {
    const campaign = makeCampaign({
      id: 'c1',
      beneficiary_type: 'athlete',
      beneficiary_id: 'athlete-1',
      goal_cents: 10000,
    });
    const repo = createFakeProfileRepo({
      campaigns: [campaign],
      progressByCampaignId: new Map([['c1', 2500]]),
    });
    const result = await loadOwnerCampaignSection(unusedSupabaseClient, 'athlete-1', repo);
    expect(result?.progress).toEqual({
      raisedCents: 2500,
      goalCents: 10000,
      percent: 25,
      isGoalExceeded: false,
    });
  });

  it(
    'retourne quand même l’objectif de campagne pour un athlète mineur SANS consentement parental ' +
      '— contrairement à loadPublicAthleteProfile (v_public_athlete exclut ces mineurs), ce loader ' +
      'ne lit jamais la table/vue `athletes` : le tuteur doit voir l’objectif de son enfant avant ' +
      'même de donner ce consentement, sinon il ne pourrait jamais comprendre pourquoi la page ' +
      'publique reste invisible',
    async () => {
      // Aucun `athletes` fourni au repo — ce loader ne dépend d'aucune ligne
      // athlète (ni de `v_public_athlete`, qui filtrerait ce mineur), donc
      // l'absence de fixture athlète ne doit pas l'empêcher de fonctionner.
      const campaign = makeCampaign({
        id: 'c1',
        beneficiary_type: 'athlete',
        beneficiary_id: 'mineur-sans-consentement',
        goal_cents: 5000,
      });
      const repo = createFakeProfileRepo({
        campaigns: [campaign],
        progressByCampaignId: new Map([['c1', 1000]]),
      });
      const result = await loadOwnerCampaignSection(unusedSupabaseClient, 'mineur-sans-consentement', repo);
      expect(result?.campaign.id).toBe('c1');
      expect(result?.progress.raisedCents).toBe(1000);
    },
  );

  it('n’applique jamais de masquage des montants (hide_amounts ne s’applique qu’au public)', async () => {
    // Même si l'athlète réel a `hide_amounts: true`, ce loader ne lit pas ce
    // champ du tout (il n'a même pas accès à la ligne athlète) : le montant
    // réel est toujours retourné au tuteur.
    const campaign = makeCampaign({
      id: 'c1',
      beneficiary_type: 'athlete',
      beneficiary_id: 'athlete-masque',
      goal_cents: 5000,
    });
    const repo = createFakeProfileRepo({
      campaigns: [campaign],
      progressByCampaignId: new Map([['c1', 4999]]),
    });
    const result = await loadOwnerCampaignSection(unusedSupabaseClient, 'athlete-masque', repo);
    expect(result?.progress.raisedCents).toBe(4999);
    expect(result?.progress.goalCents).toBe(5000);
  });
});
