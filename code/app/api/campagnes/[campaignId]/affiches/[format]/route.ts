/**
 * GET /api/campagnes/[campaignId]/affiches/[format] -- téléchargement de
 * l'affiche PDF d'une campagne (Tâche 1.5.2), dans l'un des 3 formats
 * (`lettre` / `carre` / `story`, voir `lib/posters/generate.ts`).
 *
 * Même posture RLS que `/api/qr/[code]/{png,pdf}` (Tâche 1.5.1) : client
 * serveur standard (clé anon, RLS appliquée) -- la policy
 * `campaigns_select_scoped` (migration 0003) limite déjà la lecture de la
 * campagne au gérant/admin concerné, aucune re-vérification de rôle
 * dupliquée ici (CLAUDE.md : la policy RLS est la source de vérité).
 *
 * Le QR intégré à l'affiche réutilise le code `qr_codes`
 * (`target_type = 'campaign'`) déjà créé à l'activation de la campagne
 * (Tâche 1.7 / 1.5.1) -- jamais une nouvelle URL non traçable : un scan
 * depuis une affiche imprimée doit compter comme n'importe quel autre scan
 * (`resolve_and_count_qr_scan`, migration 0012).
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  buildBeneficiaryPublicPath,
  createSupabaseBeneficiaryPreviewRepo,
  loadBeneficiaryPreviewIdentity,
} from '@/lib/public/preview';
import { calculateOrderCredits } from '@/lib/credits/calculate';
import type { CreditRuleRow } from '@/lib/credits/resolve-rule';
import {
  buildPosterContent,
  generatePosterPdfBuffer,
  POSTER_FORMATS,
  type PosterFormat,
  type PosterPackInput,
} from '@/lib/posters/generate';
import { getPublicAppUrl } from '@/lib/env';
import type { CampaignsTable, ProductsTable } from '@/lib/db/types';

interface RouteParams {
  params: { campaignId: string; format: string };
}

type CampaignRow = CampaignsTable['Row'];
type ProductRow = ProductsTable['Row'];

function isPosterFormat(value: string): value is PosterFormat {
  return (POSTER_FORMATS as readonly string[]).includes(value);
}

/** Tente de télécharger l'image d'une URL -- `null` en cas d'échec (réseau,
 * format non géré, hôte injoignable) : une photo manquante ne doit jamais
 * faire échouer le téléchargement de toute l'affiche. */
async function tryFetchImageBytes(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  if (!isPosterFormat(params.format)) {
    notFound();
  }
  const format = params.format;

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
  if (!identity) {
    notFound();
  }

  // `hide_amounts` n'existe que sur `athletes` -- lu seulement pour ce type
  // de bénéficiaire (voir `lib/posters/generate.ts#buildPosterContent`).
  let hideAmounts = false;
  if (campaign.beneficiary_type === 'athlete') {
    const { data: athleteRow, error: athleteError } = await supabase
      .from('athletes')
      .select('hide_amounts')
      .eq('id', campaign.beneficiary_id)
      .maybeSingle();
    if (athleteError) throw athleteError;
    hideAmounts = (athleteRow as { hide_amounts: boolean } | null)?.hide_amounts ?? false;
  }

  const { data: qrRow, error: qrError } = await supabase
    .from('qr_codes')
    .select('code')
    .eq('target_type', 'campaign')
    .eq('target_id', campaign.id)
    .maybeSingle();
  if (qrError) throw qrError;
  const qrTargetUrl = (qrRow as { code: string } | null)
    ? `${getPublicAppUrl()}/api/qr/${(qrRow as { code: string }).code}`
    : `${getPublicAppUrl()}${buildBeneficiaryPublicPath(campaign.beneficiary_type, identity.slug)}`;

  const { data: productsData, error: productsError } = await supabase
    .from('products')
    .select('*')
    .eq('kind', 'pack')
    .eq('is_active', true);
  if (productsError) throw productsError;
  const packProducts = (productsData ?? []) as ProductRow[];

  const { data: ruleRows, error: rulesError } = await supabase
    .from('credit_rules')
    .select('*')
    .or(`campaign_id.eq.${campaign.id},campaign_id.is.null`);
  if (rulesError) throw rulesError;
  const rules = (ruleRows ?? []) as CreditRuleRow[];
  const isCampaignActive = campaign.status === 'active';

  const packs: PosterPackInput[] = packProducts.map((product) => {
    const result = calculateOrderCredits({
      lines: [
        {
          productId: product.id,
          quantity: 1,
          unitPriceCents: product.price_cents,
          fixedCreditCents: product.fixed_credit_cents,
        },
      ],
      campaignId: campaign.id,
      isCampaignActive,
      rules,
      beneficiaries: [],
    });
    return {
      name: product.name,
      priceCents: product.price_cents,
      creditCents: result.lineCredits[0]?.creditCents ?? 0,
    };
  });

  const photoImageBytes = await tryFetchImageBytes(identity.imageUrl);

  const content = buildPosterContent(
    {
      kind: campaign.beneficiary_type,
      name: identity.name,
      imageUrl: identity.imageUrl,
      bodyText: identity.bodyText,
      hideAmounts,
    },
    { name: campaign.name, goalCents: campaign.goal_cents, endsAt: campaign.ends_at },
    packs,
    qrTargetUrl,
  );

  const pdf = await generatePosterPdfBuffer(content, format, photoImageBytes);

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="affiche-${format}-${campaign.slug}.pdf"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
