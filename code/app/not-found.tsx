/**
 * Page 404 globale (Tâche 1.4.5). S'affiche pour toute route inexistante,
 * y compris un slug athlète/équipe/club introuvable (`notFound()` dans les
 * pages publiques — Tâche 1.6) ou un identifiant de produit/commande
 * inconnu. En français, soignée, et avec un retour clair vers l'accueil
 * (critère d'acceptation Tâche 1.4.5 : « Les pages 404/500 sont soignées et
 * en français »).
 */
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotFound(): JSX.Element {
  return (
    <main className="page">
      <Card>
        <div className="error-state">
          <p className="error-state__icon" aria-hidden="true">
            🔍
          </p>
          <h1 className="error-state__title">Page introuvable</h1>
          <p>
            La page que vous cherchez n&rsquo;existe pas ou n&rsquo;est plus disponible. Vérifiez le lien
            ou retournez à l&rsquo;accueil.
          </p>
          <Button href="/">Retour à l&rsquo;accueil</Button>
        </div>
      </Card>
    </main>
  );
}
