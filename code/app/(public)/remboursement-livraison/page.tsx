/**
 * Politique de remboursement et de livraison (Tâche 1.4b.5). Gabarit de
 * base -- voir l'avertissement en haut de page et docs/DECISIONS.md. Décrit
 * honnêtement les limites actuelles (pas de remboursement automatisé en
 * V1, voir CLAUDE.md section 10) plutôt que de promettre un processus qui
 * n'existe pas encore.
 */
import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Remboursement et livraison',
  description: 'Comment fonctionnent la livraison et les demandes de remboursement.',
};

export default function RemboursementLivraisonPage(): JSX.Element {
  return (
    <main className="page">
      <div className="page-header">
        <h1>Remboursement et livraison</h1>
      </div>

      <Alert variant="warning" title="Gabarit à faire valider juridiquement">
        Ce texte est un gabarit de base rédigé pour la version 1 de la plateforme. Il DOIT être révisé
        par un professionnel du droit avant tout lancement commercial réel. Ne pas le considérer comme
        juridiquement définitif.
      </Alert>

      <div className="legal-content">
        <section>
          <h2>Livraison</h2>
          <p>
            Une commande est livrée à une seule adresse, même lorsque l&apos;achat soutient plusieurs
            bénéficiaires à la fois. Les délais de livraison sont indiqués dans la confirmation de
            commande envoyée par courriel.
          </p>
        </section>

        <section>
          <h2>Remboursement</h2>
          <p>
            En version 1, les demandes de remboursement sont traitées au cas par cas par notre équipe,
            et non par un processus automatisé. Si un remboursement est accordé, le crédit de financement
            déjà attribué au bénéficiaire est ajusté en conséquence et l&apos;ajustement est conservé dans
            l&apos;historique du crédit.
          </p>
        </section>

        <section>
          <h2>Faire une demande</h2>
          <p>
            Pour signaler un problème de livraison ou demander un remboursement, écris-nous via la{' '}
            <a href="/contact">page Contact</a> en indiquant ton numéro de commande.
          </p>
        </section>
      </div>
    </main>
  );
}
