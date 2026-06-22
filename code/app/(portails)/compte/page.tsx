import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { logoutAction } from '../../(auth)/login/actions';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Page protégée de démonstration pour la Tâche 0.3 (sert aussi de cible au
 * test e2e signup → login → page protégée). Sera enrichie en Phase 1.5
 * (dashboard équipe/club/admin selon le rôle).
 *
 * Habillage Tâche 1.4.4 : Card/Badge/Button du système de design,
 * présentation uniquement — `data-testid="user-role"` reste sur le même
 * paragraphe, texte inchangé (voir tests/e2e/auth.spec.ts).
 */
export default async function ComptePage(): Promise<JSX.Element> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="page">
      <div className="page-header">
        <h1>Mon compte</h1>
      </div>
      <Card>
        <div className="stack stack--sm">
          <p data-testid="user-role">
            Rôle : <Badge variant="info">{user.role}</Badge>
          </p>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Se déconnecter
            </Button>
          </form>
        </div>
      </Card>
    </main>
  );
}
