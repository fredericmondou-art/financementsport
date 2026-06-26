/**
 * Page d'accueil (Tâche 1.6, enrichie Tâche 1.4b.2 : « confiance et
 * finitions visuelles »). Le `<h1>` et le lien "Voir la boutique" restent
 * EXACTEMENT inchangés (voir tests/e2e/home.spec.ts) -- tout le reste est
 * nouveau ou réorganisé.
 *
 * Trois portes d'entrée (cahier 1.4b.2) :
 * - "Trouver un athlète" → /trouver (annuaire public créé à cette même
 *   tâche, voir lib/public/athlete-directory.ts et docs/DECISIONS.md : ce
 *   bouton n'avait nulle part où mener avant, aucune page de découverte
 *   n'existait).
 * - "Lancer une campagne" → /campagnes/nouvelle (redirige vers /login si
 *   non connecté, comportement déjà existant de cette page).
 * - "Voir la boutique" → /boutique (inchangé).
 *
 * Exemple chiffré (cahier 1.4b.2 : "concret et honnête") : repris
 * directement du produit réellement seedé "Pack Saison" (supabase/seed.sql,
 * 12000 cents de prix / 1800 cents de crédit fixe) -- pas un chiffre
 * inventé pour l'occasion.
 *
 * Témoignages : aucun témoignage nominatif n'existe à ce jour -- afficher
 * une fausse citation serait plus trompeur qu'utile (cahier 1.4b.2 :
 * "jamais de témoignages fictifs"). Section neutre qui annonce que de vrais
 * témoignages viendront, plutôt que masquée complètement, pour ne pas
 * laisser un trou silencieux dans la page.
 */
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const HOW_IT_WORKS = [
  {
    step: 'Étape 1',
    title: 'Choisis un bénéficiaire',
    text: "Trouve un athlète, une équipe ou un club que tu veux encourager.",
  },
  {
    step: 'Étape 2',
    title: 'Achète dans la boutique',
    text: 'Choisis un produit ou un pack — chacun indique le crédit de financement qu’il génère.',
  },
  {
    step: 'Étape 3',
    title: 'Le crédit est attribué',
    text: 'Une fois le paiement confirmé, le crédit est calculé et attribué automatiquement.',
  },
  {
    step: 'Étape 4',
    title: 'Suis l’impact',
    text: 'Le total amassé est visible directement sur le profil public du bénéficiaire.',
  },
];

const FAQ = [
  {
    question: 'Comment le montant du crédit est-il calculé ?',
    answer:
      'Chaque produit ou pack indique son crédit de financement avant l’achat. Le montant exact dépend des règles définies pour le produit ou pour la campagne en cours.',
  },
  {
    question: 'Quand le bénéficiaire reçoit-il l’argent ?',
    answer:
      'Le crédit est attribué dès que le paiement est confirmé. Le versement réel à l’équipe, au club ou à la famille de l’athlète est traité manuellement par notre équipe.',
  },
  {
    question: 'Puis-je choisir qui reçoit le crédit de mon achat ?',
    answer:
      'Oui. Tu choisis le bénéficiaire avant ou pendant ton achat, et tu peux même répartir un même achat entre plusieurs bénéficiaires depuis ton panier.',
  },
  {
    question: 'Je gère une équipe ou un club, comment je commence ?',
    answer:
      'Crée un compte responsable, puis lance une campagne en quelques étapes depuis « Lancer une campagne ».',
  },
];

export default function HomePage(): JSX.Element {
  return (
    <main className="page page--wide stack">
      <div className="hero">
        <h1>Achetez vos essentiels. Financez le sport des jeunes.</h1>
        <p>
          Chaque achat sur notre boutique génère un crédit de financement versé directement à
          l&apos;athlète, l&apos;équipe ou le club que vous choisissez d&apos;encourager.
        </p>
        <div className="entry-buttons">
          <Button href="/trouver" variant="primary">
            Trouver un athlète
          </Button>
          <Button href="/campagnes/nouvelle" variant="outline">
            Lancer une campagne
          </Button>
          <Button href="/boutique" variant="accent">
            Voir la boutique
          </Button>
        </div>
      </div>

      <section className="stack stack--sm">
        <h2>Un exemple concret</h2>
        <Card padded>
          <dl className="costed-example">
            <dt>Achat d&apos;un Pack Saison (120,00 $)</dt>
            <dd>18,00 $ versés au bénéficiaire choisi</dd>
          </dl>
        </Card>
      </section>

      <section className="stack">
        <h2>Comment ça fonctionne</h2>
        <ul className="feature-grid">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.title}>
              <Card padded className="feature-card">
                <p className="feature-card__step">{item.step}</p>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack stack--sm">
        <h2>Ce qu&apos;en disent les athlètes et les familles</h2>
        <Card padded>
          <p>
            Les premières campagnes sont en cours : les témoignages de bénéficiaires et de familles
            seront ajoutés ici dès que des campagnes seront menées à terme.
          </p>
        </Card>
      </section>

      <section className="stack stack--sm">
        <h2>Questions fréquentes</h2>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.question} className="faq__item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
