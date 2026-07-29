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
 *   patins, terrain de sport, soulier"), d'abord avec des icônes illustrées
 *   (`components/sport-icons.tsx`, conservé dans le dépôt mais plus utilisé
 *   ici), PUIS remplacée le même jour par une bannière photo pleine largeur
 *   ("Je veux une grande image, pas des petites icônes" / "Image de fond
 *   plein écran (bandeau)") : `public/images/sports-banner.png`, image
 *   d'équipement sportif générée par Frédéric (sans visage, sans logo de
 *   marque visible), affichée via `next/image` (`fill`) avec un scrim pour
 *   la lisibilité du texte superposé. Écart assumé vis-à-vis de DESIGN.md §6
 *   / BRIEF §5 (illustration uniquement) : photo d'ÉQUIPEMENT seul, aucune
 *   personne -- ne déclenche donc pas le risque "photo de mineur" que ces
 *   règles visent à éviter ; incohérence de style avec le reste du site
 *   (SVG plat) signalée à Frédéric, qui a choisi de conserver la photo
 *   (voir docs/DECISIONS.md).
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
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProductCard } from '@/components/product-card';
import { ScrollReveal } from '@/components/scroll-reveal';
import { Scoreboard, type ScoreboardItem } from '@/components/scoreboard';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, listPublicProducts } from '@/lib/catalog/products';
import {
  IconShoppingBag,
  IconCoins,
  IconTrophy,
  IconLeaf,
  IconBadgePercent,
  IconTruck,
  IconShieldCheck,
  IconCheck,
  IconZap,
} from '@/components/icons';

type IconComponent = (props: { className?: string }) => JSX.Element;

const HOW_IT_WORKS: { title: string; text: string; icon: IconComponent }[] = [
  {
    icon: IconShoppingBag,
    title: 'Achète dans la boutique',
    text: "Choisis un produit ou un pack, puis l'athlète, l'équipe ou le club que tu veux encourager.",
  },
  {
    icon: IconCoins,
    title: 'Le crédit est calculé',
    text: 'Une fois ton paiement confirmé, le crédit de financement est calculé automatiquement selon le produit.',
  },
  {
    icon: IconTrophy,
    title: "L'athlète est financé",
    text: 'Le crédit est attribué et visible directement sur le profil public du bénéficiaire.',
  },
];

const SCOREBOARD_ITEMS: ScoreboardItem[] = [
  { target: 15, suffix: ' %', label: 'de chaque achat versé au bénéficiaire choisi' },
  { target: 100, suffix: ' %', label: 'du crédit calculé remis intégralement, jamais partagé avec la plateforme' },
  { target: 0, suffix: ' $', label: 'de frais cachés — le pourcentage annoncé est le pourcentage versé' },
];

const ENGAGEMENTS: { title: string; text: string; icon: IconComponent }[] = [
  {
    icon: IconLeaf,
    title: 'Produits québécois',
    text: 'Nos produits ménagers écoresponsables sont fabriqués au Québec.',
  },
  {
    icon: IconBadgePercent,
    title: 'Le pourcentage annoncé, toujours',
    text: 'Le crédit affiché sur chaque produit est versé intégralement, sans exception.',
  },
  {
    icon: IconTruck,
    title: 'Livraison groupée',
    text: "Les commandes d'une même campagne sont regroupées pour simplifier la distribution à l'équipe.",
  },
  {
    icon: IconShieldCheck,
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
            <p className="home-hero__lead">
              Chaque achat sur notre boutique génère un crédit de financement versé directement à
              l&apos;athlète, l&apos;équipe ou le club que tu choisis d&apos;encourager — tous les
              sports et toutes les catégories, récréatif ou compétitif.
            </p>
            <div className="entry-buttons">
              <Button href="/trouver" variant="primary" size="lg">
                Encourager un athlète
              </Button>
              <Button href="/campagnes/nouvelle" variant="outline" size="lg">
                Lancer une campagne
              </Button>
            </div>
            <ul className="home-hero__stats">
              <li>
                <b>15 %</b>
                <span>reversé au bénéficiaire choisi</span>
              </li>
              <li>
                <b>100 %</b>
                <span>du crédit, jamais partagé</span>
              </li>
              <li>
                <b>15 min</b>
                <span>pour lancer une campagne</span>
              </li>
            </ul>
          </div>
          <div className="home-hero__art">
            <div className="home-impact" aria-hidden="true">
              <div className="home-impact__head">
                <span className="home-impact__avatar">LR</span>
                <span>
                  <b>Les Rapides U13</b>
                  <span>Hockey · Saint-Jérôme</span>
                </span>
              </div>
              <div className="home-impact__bar">
                <i />
              </div>
              <div className="home-impact__row">
                <span>Objectif de campagne</span>
                <b>3 400 $ / 5 000 $</b>
              </div>
              <div className="home-impact__badge home-impact__badge--a">
                <span
                  className="home-impact__badge-ic"
                  style={{ background: 'var(--color-primary-tint)', color: 'var(--color-primary)' }}
                >
                  <IconShoppingBag />
                </span>
                <span>
                  <small>Achat confirmé</small>
                  <b>+ 18,00 $</b>
                </span>
              </div>
              <div className="home-impact__badge home-impact__badge--b">
                <span
                  className="home-impact__badge-ic"
                  style={{ background: 'var(--color-accent-tint)', color: 'var(--color-accent)' }}
                >
                  <IconCheck />
                </span>
                <span>
                  <small>Crédit attribué</small>
                  <b>Automatique</b>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pour tous les sports (réintroduite le 2026-07-10 -- voir docblock en
          tête de fichier). Bandeau photo pleine largeur, texte superposé sur
          un scrim. Audience : parent. */}
      <section className="home-section home-sports-banner">
        <Image
          src="/images/sports-banner.png"
          alt=""
          aria-hidden="true"
          fill
          sizes="100vw"
          className="home-sports-banner__image"
          priority={false}
        />
        <div className="home-sports-banner__scrim" aria-hidden="true" />
        <ScrollReveal className="page page--wide stack stack--sm home-sports-banner__content">
          <h2>Pour tous les sports, toutes les catégories</h2>
          <p className="home-section__lead">
            Ligue récréative ou compétitive, peu importe le sport pratiqué — la plateforme
            s&apos;adapte à n&apos;importe quelle équipe, club ou athlète.
          </p>
        </ScrollReveal>
      </section>

      {/* 2. Comment ça fonctionne (audience : parent) */}
      <section className="home-section">
        <ScrollReveal className="page page--wide stack">
          <span className="home-eyebrow">Comment ça fonctionne</span>
          <h2>Trois étapes, aucun casse-tête</h2>
          <ul className="feature-grid">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.title}>
                <Card padded className="feature-card">
                  <item.icon className="feature-card__icon" />
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
          <span className="home-eyebrow">Notre engagement chiffré</span>
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
      <section className="home-section home-section--products">
        <ScrollReveal className="page page--wide stack">
          <span className="home-eyebrow">Produits vedettes</span>
          <h2>Chaque carte affiche le crédit généré</h2>
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
        <ScrollReveal className="page page--wide home-teams__grid">
          <div className="stack stack--sm">
            <span className="home-eyebrow">Pour les équipes</span>
            <h2>Pour les équipes et les responsables</h2>
            <p className="home-section__lead">
              Décris ton équipe, choisis tes produits, lance ta campagne — le crédit de financement
              est calculé et attribué automatiquement à chaque achat de tes partisans.
            </p>
            <p className="home-teams__promise">
              <IconZap />
              Campagne créée en 15 minutes
            </p>
            <ol className="home-teams__steps">
              <li>Décris ton équipe et ton objectif de campagne.</li>
              <li>Choisis les produits qui financent ta campagne.</li>
              <li>Partage ton lien — chaque achat génère le crédit automatiquement.</li>
            </ol>
            <Button href="/campagnes/nouvelle" variant="primary" size="lg">
              Lancer ma campagne en 15 minutes
            </Button>
          </div>
          <div className="home-teams__mock" aria-hidden="true">
            <div className="home-teams__mock-row">
              <span>Les Rapides U13 — Campagne</span>
              <b>Active</b>
            </div>
            <div className="home-teams__mock-row">
              <span>Marie L. · Pack Saison</span>
              <b>+ 18,00 $</b>
            </div>
            <div className="home-teams__mock-row">
              <span>David T. · Trio ménager</span>
              <b>+ 6,75 $</b>
            </div>
            <div className="home-teams__mock-row">
              <span>Sophie R. · Pack Saison</span>
              <b>+ 18,00 $</b>
            </div>
            <div className="home-teams__mock-row home-teams__mock-row--total">
              <span>Total crédité cette semaine</span>
              <b>136,50 $</b>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* 6. Engagements (audience : club + tous) — remplace la section
          "témoignages vide" (brief §9.6). */}
      <section className="home-section home-section--alt">
        <ScrollReveal className="page page--wide stack">
          <span className="home-eyebrow">Nos engagements</span>
          <h2>Pourquoi te faire confiance</h2>
          <ul className="feature-grid">
            {ENGAGEMENTS.map((item) => (
              <li key={item.title}>
                <Card padded className="feature-card">
                  <item.icon className="feature-card__icon" />
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
          <span className="home-eyebrow">Questions fréquentes</span>
          <h2>Tout ce que tu veux savoir</h2>
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
