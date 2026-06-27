/**
 * Annuaire public "Trouver un athlète" (Tâche 1.4b.2). Recherche par
 * formulaire GET natif (pas de JS) sur `?q=` -- même choix que le menu
 * mobile/FAQ (voir docs/DECISIONS.md). Lien "Encourager" de chaque carte
 * réutilise exactement le même `href` que la page profil individuelle
 * (`/boutique?beneficiaryType=athlete&beneficiaryId=...`, voir
 * app/(public)/[athleteSlug]/page.tsx) pour rester cohérent avec le flux
 * existant.
 */
import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { loadAthleteDirectory } from '@/lib/public/athlete-directory';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = {
  title: 'Trouver un athlète',
  description: 'Découvre les athlètes à soutenir et encourage celui ou celle de ton choix.',
};

export default async function TrouverPage({
  searchParams,
}: {
  searchParams: { q?: string };
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const athletes = await loadAthleteDirectory(supabase, searchParams.q);

  return (
    <main className="page page--wide stack">
      <div className="page-header">
        <h1>Trouver un athlète</h1>
        <p>Découvre les athlètes inscrits sur la plateforme et choisis qui encourager.</p>
      </div>

      <form className="form form--wide" role="search">
        <div className="form__row">
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Nom, sport ou ville..."
            aria-label="Rechercher un athlète"
          />
          <Button type="submit" variant="outline">
            Rechercher
          </Button>
        </div>
      </form>

      {athletes.length === 0 ? (
        searchParams.q ? (
          <EmptyState title="Aucun athlète ne correspond à cette recherche." actionHref="/trouver" actionLabel="Voir tous les athlètes">
            Essayez un autre nom, sport ou ville.
          </EmptyState>
        ) : (
          <EmptyState title="Aucun athlète public pour le moment." actionHref="/boutique" actionLabel="Découvrir la boutique">
            Revenez bientôt, ou explorez la boutique en attendant.
          </EmptyState>
        )
      ) : (
        <ul className="product-grid">
          {athletes.map((athlete) => (
            <li key={athlete.id}>
              <Card>
                <h3>{athlete.display_name}</h3>
                <div className="product-card__meta">
                  {athlete.sport ? <Badge variant="info">{athlete.sport}</Badge> : null}
                  {athlete.city ? <Badge>{athlete.city}</Badge> : null}
                </div>
                <Button href={`/${athlete.slug}`} variant="outline" fullWidth>
                  Voir le profil
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
