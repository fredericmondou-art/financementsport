import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { logoutAction } from '../../(auth)/login/actions';

/**
 * Page protégée de démonstration pour la Tâche 0.3 (sert aussi de cible au
 * test e2e signup → login → page protégée). Sera enrichie en Phase 1.5
 * (dashboard équipe/club/admin selon le rôle).
 */
export default async function ComptePage(): Promise<JSX.Element> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main>
      <h1>Mon compte</h1>
      <p data-testid="user-role">Rôle : {user.role}</p>
      <form action={logoutAction}>
        <button type="submit">Se déconnecter</button>
      </form>
    </main>
  );
}
