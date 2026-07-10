import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Bricolage_Grotesque, Archivo, Figtree } from 'next/font/google';
import { SiteHeader } from '@/components/nav/site-header';
import { SiteFooter } from '@/components/nav/site-footer';
import { getPublicAppUrl } from '@/lib/env';
import './globals.css';

/**
 * Polices auto-hébergées par Next.js (`next/font/google`) : aucune requête
 * externe au navigateur du visiteur (performance + confidentialité), voir
 * docs/DESIGN.md section 2. Les variables CSS qu'elles exposent sont
 * consommées par `app/globals.css` (--font-heading / --font-body), jamais
 * référencées en dur ailleurs.
 *
 * Archivo/Figtree (PLAN-DESIGN-REFONTE-ACCUEIL.md, brief page d'accueil) :
 * chargées ici (racine) plutôt que localement à l'accueil, seule façon
 * d'utiliser `next/font/google` sans requête réseau supplémentaire ; leur
 * usage reste néanmoins SCOPÉ à `.home` dans `app/globals.css` (voir
 * --font-display/--font-metric/--font-body-alt) -- le reste du site continue
 * d'utiliser Bricolage Grotesque/Inter sans aucun changement, ce brief étant
 * encore un brouillon non fusionné dans docs/DESIGN.md.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-bricolage',
  display: 'swap',
});
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});
const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-figtree',
  display: 'swap',
});

const siteName = 'Plateforme de financement sportif';
const siteDescription = 'Boutique, financement et gestion pour athlètes, équipes et clubs.';

/**
 * `metadataBase` + Open Graph par défaut (Tâche 1.4.5). Sert de base à
 * toutes les pages : celles qui ne définissent pas leur propre
 * `generateMetadata` (ex. boutique, panier, comptes) héritent de ce titre
 * générique ; les pages publiques athlète/équipe/club et l'accueil
 * surchargent `title`/`description`/`openGraph` via leur propre export
 * `generateMetadata`/`metadata` (voir ces fichiers). `metadataBase` est ce
 * qui permet à Next.js de construire des URLs absolues pour les images
 * Open Graph à partir de chemins relatifs — indispensable pour qu'un lien
 * partagé sur Messenger/Facebook affiche un aperçu correct (section 54 du
 * cahier des charges), ce que Facebook/Messenger n'arrivent pas à résoudre
 * eux-mêmes depuis une URL relative.
 */
export const metadata: Metadata = {
  metadataBase: new URL(getPublicAppUrl()),
  title: {
    default: siteName,
    template: `%s — ${siteName}`,
  },
  description: siteDescription,
  openGraph: {
    type: 'website',
    locale: 'fr_CA',
    siteName,
    title: siteName,
    description: siteDescription,
  },
  twitter: {
    card: 'summary',
    title: siteName,
    description: siteDescription,
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${bricolage.variable} ${archivo.variable} ${figtree.variable}`}
    >
      <body>
        <SiteHeader />
        {/*
          `id` ciblé par le lien d'évitement (« skip link ») du
          `SiteHeader` — ajouté ici plutôt que dans chaque page pour ne
          toucher à aucun contenu existant (Tâche 1.4.3 ne change que la
          coquille de navigation, pas les pages elles-mêmes ; voir
          docs/DECISIONS.md).
        */}
        <div id="contenu-principal">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
