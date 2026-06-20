/**
 * Route API catalogue (Tâche 1.2). Mince : authentification (admin
 * seulement pour l'écriture) + délégation à `lib/catalog/products.ts` +
 * traduction d'erreur (CLAUDE.md section 6).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { createProduct, createSupabaseProductRepo, listPublicProducts } from '@/lib/catalog/products';
import { toErrorResponse } from '@/lib/http/api-error-response';

/**
 * GET /api/products — catalogue public. Aucune authentification requise
 * (achat invité). Query params : `categoryId`, `kind`, `sort`
 * (`price_asc`|`price_desc`|`credit_desc`|`popularity`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const query = {
      categoryId: params.has('categoryId') ? params.get('categoryId') : undefined,
      kind: params.get('kind') ?? undefined,
      sort: params.get('sort') ?? undefined,
    };
    const supabase = createSupabaseServerClient();
    const products = await listPublicProducts(query, createSupabaseProductRepo(supabase));
    return NextResponse.json({ products });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/products — création, réservée à platform_admin. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const product = await createProduct(user, body, createSupabaseProductRepo(supabase));
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
