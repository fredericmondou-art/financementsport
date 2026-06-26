/**
 * Page « À propos » (Tâche 1.4b.5). Contenu honnête uniquement : aucun fait
 * d'entreprise inventé (équipe, date de fondation, adresse...). Les champs
 * non connus à ce jour sont explicitement marqués « à compléter » plutôt que
 * remplis par une donnée plausible mais fausse — voir docs/DECISIONS.md.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'À propos',
  description: "La mission de la plateforme et comment fonctionne le financement.",
};

export default function AProposPage(): JSX.Element {
  return (
    <main className="page">
      <div className="page-header">
        <h1>À propos</h1>
        <p>Pourquoi cette plateforme existe, et comment elle fonctionne.</p>
      </div>

      <div className="legal-content">
        <section>
          <h2>Notre mission</h2>
          <p>
            Nous aidons les athlètes, équipes et clubs sportifs jeunesse à financer leurs activités.
            Chaque achat fait sur la boutique génère un crédit, calculé automatiquement, qui est versé
            au bénéficiaire choisi par l&apos;acheteur — un athlète, une équipe ou un club, selon la
            campagne.
          </p>
        </section>

        <section>
          <h2>Comment fonctionne le financement</h2>
          <p>
            Les versements sont traités manuellement par notre équipe à partir des montants calculés par
            la plateforme : aucune somme n&apos;est transférée automatiquement à ce jour. Cette étape
            manuelle nous permet de vérifier chaque versement avant qu&apos;il ne soit effectué.
          </p>
        </section>

        <section>
          <h2>L&apos;entreprise</h2>
          <p>Plateforme établie au Québec, Canada. Transactions en dollars canadiens (CAD).</p>
          <p>
            <em>
              Raison sociale, numéro d&apos;entreprise et autres détails légaux : à compléter par
              l&apos;équipe avant le lancement public.
            </em>
          </p>
        </section>

        <section>
          <h2>Une question ?</h2>
          <p>
            Écris-nous via la <a href="/contact">page Contact</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
