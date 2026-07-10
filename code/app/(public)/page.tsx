/**
 * Page d'accueil — refonte (BRIEF-REFONTE-ACCUEIL.md +
 * docs/PLAN-DESIGN-REFONTE-ACCUEIL.md, brouillon non fusionné dans
 * docs/DESIGN.md tant que non validé). Remplace la structure de la Tâche V4
 * (« vitrine chaleureuse ») par les 8 sections proposées par le brief :
 * hero → comment ça fonctionne → scoreboard d'impact → produits vedettes →
 * pour les équipes → engagements → appel aux clubs → FAQ.
 *
 * Textes VERROUILLÉS par des tests existants, inchangés ici :
 * - `<h1>` exact (tests/e2e/home.spec.ts)
 * - lien "Voir la boutique" (tests/e2e/home.spec.ts,
 *   tests/e2e/accueil-confiance.spec.ts, tests/unit/ui-button.test.tsx) —
 *   déplacé du hero vers "Produits vedettes" (brief : 2 CTA max au hero),
 *   toujours présent une seule fois sur la page.
 * - lien "Lancer une campagne" du hero, redirection /login si non authentifié
 *   (tests/e2e/accueil-confiance.spec.ts) — inchangé. Les DEUX autres CTA
 *   menant aussi à /campagnes/nouvelle (sections "Pour les équipes"/"Appel
 *   aux clubs") portent des textes différents pour ne jamais dupliquer ce
 *   nom accessible (Playwright `getByRole` en mode strict).
 * - exemple chiffré Pack Saison (120,00 $ → 18,00 $) et structure FAQ
 *   `.faq__item` (tests/e2e/accueil-confiance.spec.ts) — inchangés,
 *   déplacés dans "Produits vedettes" (le premier) et conservés en dernière
 *   section (la seconde).
 *
 * Renommages VALIDÉS par Frédéric le 2026-07-10 (voir
 * docs/PLAN-DESIGN-REFONTE-ACCUEIL.md §6 et docs/QUESTIONS.md) :
 * - lien "Trouver un athlète" → "Encourager un athlète" (même destination
 *   /trouver) — tests/e2e/accueil-confiance.spec.ts mis à jour en même temps.
 * - CTA clubs "Créer une campagne maintenant" → "Devenir club partenaire"
 *   (même destination /campagnes/nouvelle -- aucun parcours B2B séparé
 *   n'existe encore en V1, voir docs/DECISIONS.md).
 *
 * Écarts assumés par rapport au libellé littéral du brief (voir
 * docs/DECISIONS.md pour le détail) :
 * - "Produits vedettes" : le brief cite des produits fictifs (détergent,
 *   tablettes, sacs) qui n'existent PAS dans le catalogue réel (voir
 *   supabase/seed.sql -- seuls des "packs" existent). Affiche les 3 VRAIS
 *   produits les plus généreux en crédit (`listPublicProducts`,
 *   `sort: 'credit_desc'`) plutôt que d'inventer un catalogue.
 * - Section "Tous les sports" (Tâche V4) retirée initialement pour suivre
 *   strictement les 8 sections du brief, puis RÉINTRODUITE le 2026-07-10 à
 *   la demande explicite de Frédéric ("images de sports, raquette, bâton,
 *   patins, terrain de sport, soulier") -- juste après le hero, avec des
 *   icônes illustrées (`components/sport-icons.tsx`) plutôt que de simples
 *   puces texte, pour répondre à la demande sans réintroduire de photo
 *   (voir DESIGN.md §6, imagerie/mineurs -- même logique que HeroAnimation).
 * - Ton : uniformisé en tutoiement partout (corrige une incohérence
 *   pré-existante -- l'ancien hero utilisait "vous", le bas de page "tu" --
 *   conforme à docs/DESIGN.md §7, validé 2026-06-27).
 *
 * Nouveaux Client Components (justifiés, voir docs/DECISIONS.md) :
 * `components/scroll-reveal.tsx` (révélation au scroll par section) et
 * `components/scoreboard.tsx` (élément signature, décompte animé) --
 * IntersectionObserver n'a pas d'équivalent Server Component. Les deux
 * respectent `prefers-reduced-motion` et dégradent proprement sans JS
 * (contenu visible/valeur finale par défaut).
 *
 * Imagerie (DESIGN.md §6, point sensible mineurs) : toujours aucune photo,
 * uniquement de l'illustration SVG (voir `HeroAnimation`, animée en CSS pur
 * -- reste un Server Component, aucune dépendance JS/vidéo).
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProductCard } from '@/components/product-card';
import { ScrollReveal } from '@/components/scroll-reveal';
import { Scoreboard, type ScoreboardItem } from '@/components/scoreboard';
import {
  HockeyStickIcon,
  RacketIcon,
  ShoeIcon,
  SkateIcon,
  SoccerIcon,
  type SportIconProps,
} from '@/components/sport-icons';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, listPublicProducts } from '@/lib/catalog/products';

const SPORTS: Array<{ Icon: (props: SportIconProps) => JSX.Element; label: string }> = [
  { Icon: HockeyStickIcon, label: 'Hockey' },
  { Icon: SoccerIcon, label: 'Soccer' },
  { Icon: RacketIcon, label: 'Tennis' },
  { Icon: SkateIcon, label: 'Patinage' },
  { Icon: ShoeIcon, label: 'Course à pied' },
];

const HOW_IT_WORKS = [
  {
    title: 'Achète dans la boutique',
    text: "Choisis un produit ou un pack, puis l'athlète, l'équipe ou le club que tu veux encourager.",
  },
  {
    title: 'Le crédit est calculé',
    text: 'Une fois ton paiement confirmé, le crédit de financement est calculé automatiquement selon le produit.',
  },
  {
    title: "L'athlète est financé",
    text: 'Le crédit est attribué et visible directement sur le profil public du bénéficiaire.',
  },
];

const SCOREBOARD_ITEMS: ScoreboardItem[] = [
  { target: 15, suffix: ' %', label: 'de chaque achat versé au bénéficiaire choisi' },
  { target: 100, suffix: ' %', label: 'du crédit calculé remis intégralement, jamais partagé avec la plateforme' },
];

const ENGAGEMENTS = [
  {
    title: 'Produits québécois',
    text: 'Nos produits ménagers écoresponsables sont fabriqués au Québec.',
  },
  {
    title: 'Le pourcentage annoncé, toujours',
    text: 'Le crédit affiché sur chaque produit est versé intégralement, sans exception.',
  },
  {
    title: 'Livraison groupée',
    text: "Les commandes d'une même campagne sont regroupées pour simplifier la distribution à l'équipe.",
  },
  {
    title: 'Protection des données des mineurs',
    text: "Les profils d'athlètes mineurs respectent des règles de confidentialité strictes, dès la conception.",
  },
];

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

/** Médaillon décoratif réutilisé pour "Comment ça fonctionne" et "Engagements". */
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

/**
 * Animation illustrée du hero (brief §6) : un sac d'achat qui se transforme
 * en médaille, boucle douce en CSS pur (voir app/globals.css,
 * .home-hero__animation-*) -- aucune vidéo, aucun JS, respecte
 * `prefers-reduced-motion` (saut à l'état final, aucune animation).
 */
function HeroAnimation({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r="92" fill="var(--color-primary-tint)" />
      <g className="home-hero__animation-sparkle">
        <path
          d="M158 52 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"
          fill="var(--color-primary-light)"
        />
      </g>
      <g className="home-hero__animation-bag">
        <path
          d="M82 86 v-10 a18 18 0 0 1 36 0 v10"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <rect
          x="70"
          y="86"
          width="60"
          height="54"
          rx="10"
          fill="var(--color-surface)"
          stroke="var(--color-primary)"
          strokeWidth="4"
        />
      </g>
      <g className="home-hero__animation-medal">
        <circle cx="100" cy="108" r="30" fill="var(--color-accent)" />
        <path
          d="M100 92 l6.5 13 14.5 2 -10.5 10 2.5 14.5 -12.5 -6.5 -12.5 6.5 2.5 -14.5 -10.5 -10 14.5 -2z"
          fill="var(--color-surface)"
        />
      </g>
    </svg>
  );
}

export default async function HomePage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const featuredProducts = (
    await listPublicProducts({ sort: 'credit_desc' }, createSupabaseProductRepo(supabase))
  ).slice(0, 3);

  return (
    <main className="home">
      {/* 1. Hero (audience : parent/supporter) — visible immédiatement, pas
          de révélation au scroll. 2 CTA max (brief §6). */}
      <section className="home-hero">
        <div className="page page--wide home-hero__inner">
          <div className="home-hero__content stack stack--sm">
            <h1>Achetez vos essentiels. Financez le sport des jeunes.</h1>
            <p>
              Chaque achat sur notre boutique génère un crédit de financement versé directement à
              l&apos;athlète, l&apos;équipe ou le club que tu choisis d&apos;encourager — tous les
              sports et toutes les catégories, récréatif ou compétitif.
            </p>
            <p className="home-hero__fact">
              <span className="home-hero__fact-value">15 %</span>
              <span className="home-hero__fact-label">
                de chaque achat va à l&apos;athlète, l&apos;équipe ou le club choisi.
              </span>
            </p>
            <div className="entry-buttons">
              <Button href="/trouver" variant="primary" size="lg">
                Encourager un athlète
              </Button>
              <Button href="/campagnes/nouvelle" variant="outline" size="lg">
                Lancer une campagne
              </Button>
            </div>
          </div>
          <div className="home-hero__art" aria-hidden="true">
            <HeroAnimation className="home-hero__animation" />
          </div>
        </div>
      </section>

      {/* Pour tous les sports (réintroduite le 2026-07-10, icônes illustrées
          -- voir docblock en tête de fichier). Audience : parent. */}
      <section className="home-section">
        <ScrollReveal className="page page--wide stack stack--sm">
          <h2>Pour tous les sports, toutes les catégories</h2>
          <p className="home-section__lead">
            Ligue récréative ou compétitive, peu importe le sport pratiqué — la plateforme
            s&apos;adapte à n&apos;importe quelle équipe, club ou athlète.
          </p>
          <ul className="sport-chips">
            {SPORTS.map(({ Icon, label }) => (
              <li key={label} className="sport-chip">
                <Icon className="sport-chip__icon" />
                {label}
              </li>
            ))}
            <li className="sport-chip sport-chip--more">et plus encore</li>
          </ul>
        </ScrollReveal>
      </section>

      {/* 2. Comment ça fonctionne (audience : parent) */}
      <section className="home-section">
        <ScrollReveal className="page page--wide stack">
          <h2>Comment ça fonctionne</h2>
          <ul className="feature-grid">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.title}>
                <Card padded className="feature-card">
                  <DecorativeMedal className="feature-card__icon" />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </ScrollReveal>
      </section>

      {/* 3. Scoreboard d'impact (audience : tous) — élément signature,
          aplat sarcelle sombre (1 des 2 sur la page). */}
      <section className="home-section home-band--dark">
        <ScrollReveal className="page page--wide stack stack--sm">
          <h2>Scoreboard d&apos;impact</h2>
          <p className="home-section__lead">
            Des chiffres honnêtes : les premières campagnes sont en cours, alors on affiche ce
            qu&apos;on peut déjà garantir plutôt que d&apos;inventer des statistiques.
          </p>
          <Scoreboard items={SCOREBOARD_ITEMS} />
        </ScrollReveal>
      </section>

      {/* 4. Produits vedettes (audience : parent) — vrais produits du
          catalogue (les plus généreux en crédit), exemple chiffré conservé. */}
      <section className="home-section">
        <ScrollReveal className="page page--wide stack">
          <h2>Produits vedettes</h2>
          <p className="home-section__lead">
            Trois façons populaires de soutenir un athlète, une équipe ou un club — chaque carte
            indique exactement le crédit de financement qu&apos;elle génère.
          </p>
          {featuredProducts.length > 0 ? (
            <ul className="product-grid">
              {featuredProducts.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          ) : null}
          <Card padded className="home-products__example">
            <p>Concrètement, avec le Pack Saison (l&apos;option la plus généreuse) :</p>
            <dl className="costed-example">
              <dt>Achat d&apos;un Pack Saison (120,00 $)</dt>
              <dd>18,00 $ versés au bénéficiaire choisi</dd>
            </dl>
          </Card>
          <Button href="/boutique" variant="accent">
            Voir la boutique
          </Button>
        </ScrollReveal>
      </section>

      {/* 5. Pour les équipes (audience : responsable d'équipe) — aplat
          sarcelle sombre (2e et dernier). */}
      <section className="home-section home-band--dark">
        <ScrollReveal className="page page--wide stack stack--sm">
          <h2>Pour les équipes</h2>
          <p className="home-section__lead">
            Décris ton équipe, choisis tes produits, lance ta campagne — le crédit de financement
            est calculé et attribué automatiquement à chaque achat de tes partisans.
          </p>
          <p className="home-teams__promise">Campagne créée en 15 minutes</p>
          <ol className="home-teams__steps">
            <li>Décris ton équipe et ton objectif de campagne.</li>
            <li>Choisis les produits qui financent ta campagne.</li>
            <li>Partage ton lien — chaque achat génère le crédit automatiquement.</li>
          </ol>
          <Button href="/campagnes/nouvelle" variant="primary" size="lg">
            Lancer ma campagne en 15 minutes
          </Button>
        </ScrollReveal>
      </section>

      {/* 6. Engagements (audience : club + tous) — remplace la section
          "témoignages vide" (brief §9.6). */}
      <section className="home-section home-section--alt">
        <ScrollReveal className="page page--wide stack">
          <h2>Nos engagements</h2>
          <ul className="feature-grid">
            {ENGAGEMENTS.map((item) => (
              <li key={item.title}>
                <Card padded className="feature-card">
                  <DecorativeMedal className="feature-card__icon" />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </Card>
              </li>
            ))}
          </ul>
          <ul className="trust-links">
            {TRUST_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </ScrollReveal>
      </section>

      {/* 7. Appel aux clubs (audience : admin de club) — crédibilité B2B.
          "Devenir club partenaire" mène à /campagnes/nouvelle : aucun
          parcours d'inscription B2B séparé n'existe en V1 (voir
          docs/DECISIONS.md). */}
      <section className="home-cta">
        <ScrollReveal className="page page--wide home-cta__inner stack stack--sm">
          <h2>Tu es responsable d&apos;un club ?</h2>
          <p>
            Deviens partenaire pour donner à tes équipes et à tes athlètes un nouveau canal de
            financement : le crédit est calculé et attribué automatiquement à chaque achat de tes
            partisans.
          </p>
          <Button href="/campagnes/nouvelle" variant="primary">
            Devenir club partenaire
          </Button>
        </ScrollReveal>
      </section>

      {/* 8. FAQ — structure et contenu inchangés (verrouillés par
          tests/e2e/accueil-confiance.spec.ts). */}
      <section className="home-section">
        <ScrollReveal className="page page--wide stack stack--sm">
          <h2>Questions fréquentes</h2>
          <div className="faq">
            {FAQ.map((item) => (
              <details key={item.question} className="faq__item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </ScrollReveal>
      </section>
    </main>
  );
}
