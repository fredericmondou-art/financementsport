/**
 * Page « Mes athlètes » (Tâche 1.6.C1, docs/prompts/phase-1-6.md) — point
 * d'entrée pour qu'un parent/tuteur (ou un athlète majeur lui-même) retrouve
 * les profils qu'il gère et accède à leur édition.
 *
 * Volontairement limité aux athlètes où l'utilisateur est `guardian_id` ou
 * `user_id` (voir `lib/athletes/profile.ts#createSupabaseMyAthletesRepo`) —
 * PAS le périmètre plus large d'un gérant d'équipe/club (`can(user,'update',
 * ...)`, lib/auth/permissions.ts), qui dispose déjà de son propre portail de
 * gestion. Un gérant qui clique un lien d'édition reçu autrement reste
 * capable de modifier les champs non sensibles (voir
 * app/(portails)/compte/athletes/[athleteId]/page.tsx) — seule CETTE liste
 * reste un tableau de bord personnel « parent », pas un outil de gestion
 * d'équipe (décision autonome, voir docs/DECISIONS.md).
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseMyAthletesRepo } from '@/lib/athletes/profile';
import { isAthletePubliclyVisible } from '@/lib/entities/athletes';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default async function MyAthletesPage(): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const athletes = await createSupabaseMyAthletesRepo(supabase).listAthletesManagedByUser(user.id);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Mes athlètes</h1>
      </div>

      {athletes.length === 0 ? (
        <Alert variant="info">
          Aucun athlète sous votre responsabilité pour le moment. Si votre enfant a été inscrit par
          un gérant d&apos;équipe ou de club, demandez-lui de vous rattacher comme tuteur.
        </Alert>
      ) : (
        <div className="stack">
          {athletes.map((athlete) => {
            const publiclyVisible = isAthletePubliclyVisible(athlete);
            return (
              <Card key={athlete.id}>
                <div className="stack stack--sm">
                  <h2>
                    {athlete.first_name} {athlete.last_name}
                  </h2>
                  <div className="public-profile__meta">
                    {athlete.is_minor ? <Badge>Mineur</Badge> : null}
                    {publiclyVisible ? (
                      <Badge variant="success">Page publique active</Badge>
                    ) : (
                      <Badge variant="warning">Page publique non visible</Badge>
                    )}
                  </div>
                  {athlete.is_minor && !athlete.parental_consent_at ? (
                    <p>
                      Le consentement parental n&apos;a pas encore été donné — la page publique de cet
                      athlète reste invisible tant qu&apos;il n&apos;est pas accordé.
                    </p>
                  ) : null}
                  <div className="form__actions">
                    <Button href={`/compte/athletes/${athlete.id}`} variant="outline" size="sm">
                      Modifier le profil
                    </Button>
                    <Button href={`/compte/athletes/${athlete.id}/suivi`} variant="outline" size="sm">
                      Voir mon suivi
                    </Button>
                    {publiclyVisible ? (
                      <Button href={`/${athlete.slug}`} variant="outline" size="sm">
                        Voir la page publique
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
