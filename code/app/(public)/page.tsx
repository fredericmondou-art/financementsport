/**
 * Page d'accueil (Tâche 1.6, enrichie Tâche 1.4b.2 : « confiance et
 * finitions visuelles », refondue Tâche V4 : « la vitrine chaleureuse »,
 * cahier docs/prompts/07-prompts-refonte-visuelle.md). Le `<h1>`, le lien
 * "Voir la boutique" et le texte de l'exemple chiffré restent EXACTEMENT
 * inchangés (voir tests/e2e/home.spec.ts et accueil-confiance.spec.ts) --
 * tout le reste est nouveau ou réorganisé en sections à fonds alternés pour
 * donner du rythme à une page jugée « squelettique ».
 *
 * Trois portes d'entrée (cahier 1.4b.2, conservées) :
 * - "Trouver un athlète" → /trouver (annuaire public, voir
 *   lib/public/athlete-directory.ts). Nom accessible UNIQUE sur la page --
 *   voir la correction apportée à components/nav/site-footer.tsx (Tâche V4,
 *   docs/DECISIONS.md) pour la raison.
 * - "Lancer une campagne" → /campagnes/nouvelle (redirige vers /login si non
 *   connecté, comportement déjà existant). Un second appel à l'action vers la
 *   même page existe en bas (section clubs) mais porte un texte DIFFÉRENT
 *   (« Créer une campagne maintenant ») pour ne pas dupliquer ce nom
 *   accessible et casser tests/e2e/accueil-confiance.spec.ts (requêtes en
 *   mode strict Playwright, sans `.first()`).
 * - "Voir la boutique" → /boutique (inchangé).
 *
 * Exemple chiffré (cahier 1.4b.2 : "concret et honnête") : inchangé, repris
 * du produit réellement seedé "Pack Saison" (supabase/seed.sql).
 *
 * Sports desservis : `athletes.sport`/`teams.sport` sont des champs LIBRES en
 * base (supabase/seed.sql ne seed qu'un seul sport, "hockey") -- il n'existe
 * aucune liste fermée de sports "supportés". Présenter une liste fermée
 * aurait été trompeur ; le texte insiste donc sur "tous les sports" et ne
 * cite que des exemples illustratifs, jamais une liste exhaustive ou un
 * partenariat fédératif qui n'existe pas.
 *
 * Imagerie (DESIGN.md §6, point sensible mineurs) : aucune vraie photo de
 * banque n'est utilisée ici -- aucune source de photo libre de droits
 * vérifiée n'était disponible dans cette session (pas d'accès réseau pour
 * sourcer/valider une licence). Pour ne JAMAIS risquer de faire passer une
 * image trouvée au hasard pour une "vraie" photo, la section héros et les
 * cartes utilisent des illustrations SVG décoratives (formes organiques aux
 * couleurs de la marque), conformes à l'option "LIANT" de DESIGN.md §6.
 * Décision autonome journalisée dans docs/DECISIONS.md (Tâche V4) ; de vraies
 * photos pourront remplacer ces illustrations dès qu'une source libre de
 * droits aura été choisie et validée.
 *
 * Témoignages : aucun témoignage nominatif n'existe à ce jour -- afficher une
 * fausse citation serait plus trompeur qu'utile (cahier 1.4b.2 : "jamais de
 * témoignages fictifs"). La section "Confiance" reste honnête sur ce point et
 * pointe plutôt vers les pages de confiance réelles (liens, cahier V4).
 */
import Link from 'next/link';
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

const SPORT_EXAMPLES = ['Hockey', 'Soccer', 'Gymnastique', 'Natation', 'Basketball', 'Athlétisme'];

const TRUST_LINKS = [
  { href: '/a-propos', label: 'En savoir plus sur la plateforme' },
  { href: '/remboursement-livraison', label: 'Notre politique de remboursement et livraison' },
  { href: '/confidentialite', label: 'Notre politique de confidentialité' },
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

/** Médaillon décoratif réutilisé dans le héros et les cartes "Comment ça fonctionne". */
function DecorativeMedal({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="20" r="14" fill="var(--color-primary-tint)" stroke="var(--color-primary)" strokeWidth="2" />
      <path
        d="M24 12.5l2.6 5.2 5.7.8-4.1 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.1-4 5.7-.8z"
        fill="var(--color-primary)"
      />
      <path d="M17 31l-4 12 11-4 11 4-4-12" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage(): JSX.Element {
  return (
    <main className="home">
      <section className="home-hero">
        <div className="page page--wide home-hero__inner">
          <div className="home-hero__content stack stack--sm">
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
          <div className="home-hero__art" aria-hidden="true">
            <DecorativeMedal className="home-hero__medal" />
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="page page--wide stack stack--sm">
          <h2>Pour tous les sports, toutes les catégories</h2>
          <p className="home-section__lead">
            Ligue récréative ou compétitive, peu importe le sport pratiqué — la plateforme
            s&apos;adapte à n&apos;importe quelle équipe, club ou athlète.
          </p>
          <ul className="sport-chips">
            {SPORT_EXAMPLES.map((sport) => (
              <li key={sport} className="sport-chip">
                {sport}
              </li>
            ))}
            <li className="sport-chip sport-chip--more">et plus encore</li>
          </ul>
        </div>
      </section>

      <section className="home-section home-section--alt">
        <div className="page page--wide stack stack--sm">
          <h2>Un exemple concret</h2>
          <Card padded>
            <dl className="costed-example">
              <dt>Achat d&apos;un Pack Saison (120,00 $)</dt>
              <dd>18,00 $ versés au bénéficiaire choisi</dd>
            </dl>
          </Card>
        </div>
      </section>

      <section className="home-section">
        <div className="page page--wide stack">
          <h2>Comment ça fonctionne</h2>
          <ul className="feature-grid">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.title}>
                <Card padded className="feature-card">
                  <DecorativeMedal className="feature-card__icon" />
                  <p className="feature-card__step">{item.step}</p>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-section home-section--alt">
        <div className="page page--wide stack stack--sm">
          <h2>Confiance</h2>
          <Card padded>
            <p>
              Les premières campagnes sont en cours : les témoignages de bénéficiaires et de
              familles seront ajoutés ici dès que des campagnes seront menées à terme.
            </p>
          </Card>
          <ul className="trust-links">
            {TRUST_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-section">
        <div className="page page--wide stack stack--sm">
          <h2>Questions fréquentes</h2>
          <div className="faq">
            {FAQ.map((item) => (
              <details key={item.question} className="faq__item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta">
        <div className="page page--wide home-cta__inner stack stack--sm">
          <h2>Vous gérez une équipe ou un club ?</h2>
          <p>
            Crée un compte responsable et lance ta campagne en quelques étapes — chaque achat de
            tes partisans génère automatiquement le crédit de financement.
          </p>
          <Button href="/campagnes/nouvelle" variant="primary">
            Créer une campagne maintenant
          </Button>
        </div>
      </section>
    </main>
  );
}
