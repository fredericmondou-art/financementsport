/**
 * Politique de confidentialité (Tâche 1.4b.5). Gabarit de base, PAS un texte
 * juridique définitif -- voir l'avertissement affiché en haut de page et
 * docs/DECISIONS.md. Couvre honnêtement ce que la plateforme fait
 * réellement aujourd'hui (CLAUDE.md sections 2 et 5) : aucune affirmation
 * sur une certification ou un statut juridique qui ne serait pas vérifié.
 */
import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Quelles données sont collectées, pourquoi, et comment elles sont protégées.',
};

export default function ConfidentialitePage(): JSX.Element {
  return (
    <main className="page">
      <div className="page-header">
        <h1>Politique de confidentialité</h1>
      </div>

      <Alert variant="warning" title="Gabarit à faire valider juridiquement">
        Ce texte est un gabarit de base rédigé pour la version 1 de la plateforme. Il DOIT être révisé
        par un professionnel du droit (notamment au regard de la Loi 25 du Québec et des règles
        applicables aux données de mineurs) avant tout lancement commercial réel. Ne pas le considérer
        comme juridiquement définitif.
      </Alert>

      <div className="legal-content">
        <section>
          <h2>Données que nous collectons</h2>
          <p>
            Compte (nom, courriel, mot de passe géré par notre fournisseur d&apos;authentification),
            informations de commande et de livraison, profils d&apos;athlètes/équipes/clubs créés sur la
            plateforme, et — lors d&apos;un paiement — les données traitées par notre fournisseur de
            paiement (Stripe). Nous ne stockons jamais les numéros de carte de paiement nous-mêmes.
          </p>
        </section>

        <section>
          <h2>Données concernant des mineurs</h2>
          <p>
            Un profil d&apos;athlète peut concerner une personne mineure. Par défaut, le profil complet
            (« Standard ») est visible publiquement, mais chaque champ sensible peut être masqué
            individuellement par le responsable du profil (option « masquer »), et nous visons à
            respecter cette préférence partout où le profil est affiché publiquement. La publication
            d&apos;un profil de mineur requiert le consentement d&apos;un parent ou tuteur. Une demande de
            suppression ou de correction des données d&apos;un mineur peut être adressée via la{' '}
            <a href="/contact">page Contact</a>.
          </p>
        </section>

        <section>
          <h2>Où sont stockées les données</h2>
          <p>
            Base de données et fichiers : Supabase. Paiements : Stripe. Courriels transactionnels :
            SendGrid. Hébergement de l&apos;application : Vercel. Chacun de ces fournisseurs a ses propres
            engagements de sécurité et de confidentialité.
          </p>
        </section>

        <section>
          <h2>Tes droits</h2>
          <p>
            Tu peux demander l&apos;accès, la correction ou la suppression de tes données personnelles en
            nous écrivant via la <a href="/contact">page Contact</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
