import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseProductRepo, getProduct, updateProduct } from '@/lib/catalog/products';
import { toErrorResponse } from '@/lib/http/api-error-response';

/**
 * GET /api/products/:productId — public si le produit est actif, sinon
 * réservé à platform_admin (voir `getProduct` dans
 * `lib/catalog/products.ts`). Pas de 401 forcé : un visiteur non
 * authentifié peut consulter un produit actif (achat invité).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { productId: string } },
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    const supabase = createSupabaseServerClient();
    const product = await getProduct(user, params.productId, createSupabaseProductRepo(supabase));
    return NextResponse.json({ product });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/products/:productId — mise à jour, réservée à platform_admin. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { productId: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createSupabaseServerClient();
    const product = await updateProduct(
      user,
      params.productId,
      body,
      createSupabaseProductRepo(supabase),
    );
    return NextResponse.json({ product });
  } catch (error) {
    return toErrorResponse(error);
  }
}
