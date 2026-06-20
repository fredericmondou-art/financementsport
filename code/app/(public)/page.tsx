/**
 * Page d'accueil (Tâche 1.6) : remplace le placeholder "en construction".
 * Contenu statique (pas de lecture base de données) : un slogan, une
 * explication du fonctionnement, et un appel à l'action vers la boutique.
 * Détail de mise en page hors du texte mandaté par le cahier des charges
 * laissé à ma discrétion — voir docs/DECISIONS.md.
 */
import Link from 'next/link';

export default function HomePage(): JSX.Element {
  return (
    <main>
      <h1>Achetez vos essentiels. Financez le sport des jeunes.</h1>
      <p>
        Chaque achat sur notre boutique génère un crédit de financement versé directement à
        l&apos;athlète, l&apos;équipe ou le club que vous choisissez d&apos;encourager.
      </p>

      <p>
        <Link href="/boutique">Voir la boutique</Link>
      </p>

      <section>
        <h2>Comment ça fonctionne</h2>
        <ol>
          <li>Choisissez un athlète, une équipe ou un club à encourager.</li>
          <li>Achetez un produit ou un pack dans notre boutique.</li>
          <li>Un crédit de financement est calculé et attribué automatiquement.</li>
          <li>Suivez l&apos;impact de votre achat directement sur le profil public du bénéficiaire.</li>
        </ol>
      </section>
    </main>
  );
}
