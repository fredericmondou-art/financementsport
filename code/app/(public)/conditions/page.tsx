/**
 * Conditions d'utilisation (Tâche 1.4b.5). Gabarit de base -- voir
 * l'avertissement en haut de page et docs/DECISIONS.md. Décrit le
 * fonctionnement réel (achats, crédits, versements manuels en V1) sans
 * affirmer de garanties que la plateforme ne tient pas.
 */
import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: 'Les règles applicables aux achats et au financement sur la plateforme.',
};

export default function ConditionsPage(): JSX.Element {
  return (
    <main className="page">
      <div className="page-header">
        <h1>Conditions d&apos;utilisation</h1>
      </div>

      <Alert variant="warning" title="Gabarit à faire valider juridiquement">
        Ce texte est un gabarit de base rédigé pour la version 1 de la plateforme. Il DOIT être révisé
        par un professionnel du droit avant tout lancement commercial réel. Ne pas le considérer comme
        juridiquement définitif.
      </Alert>

      <div className="legal-content">
        <section>
          <h2>Achats</h2>
          <p>
            Les prix affichés sont en dollars canadiens (CAD) et n&apos;incluent pas les taxes, calculées
            au moment du paiement (TPS et TVQ, selon les taux en vigueur). Le paiement est traité par
            Stripe.
          </p>
        </section>

        <section>
          <h2>Crédits de financement</h2>
          <p>
            Chaque achat éligible génère un crédit calculé automatiquement selon les règles propres à la
            campagne ou au produit acheté, et attribué au bénéficiaire choisi (athlète, équipe ou club).
            Le crédit n&apos;est attribué qu&apos;une fois le paiement confirmé.
          </p>
        </section>

        <section>
          <h2>Versement aux bénéficiaires</h2>
          <p>
            En version 1, les versements aux bénéficiaires sont traités manuellement par notre équipe, à
            partir des montants calculés par la plateforme. Les délais de versement peuvent donc varier.
          </p>
        </section>

        <section>
          <h2>Comptes et campagnes</h2>
          <p>
            La création d&apos;une campagne de financement nécessite un compte responsable d&apos;équipe ou de
            club. Une campagne peut être suspendue ou annulée en cas d&apos;utilisation abusive de la
            plateforme.
          </p>
        </section>

        <section>
          <h2>Questions</h2>
          <p>
            Pour toute question sur ces conditions, écris-nous via la <a href="/contact">page Contact</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
