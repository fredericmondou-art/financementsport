import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Outfit } from 'next/font/google';
import { SiteHeader } from '@/components/nav/site-header';
import { SiteFooter } from '@/components/nav/site-footer';
import './globals.css';

/**
 * Polices auto-hébergées par Next.js (`next/font/google`) : aucune requête
 * externe au navigateur du visiteur (performance + confidentialité), voir
 * docs/DESIGN.md section 2. Les variables CSS qu'elles exposent sont
 * consommées par `app/globals.css` (--font-heading / --font-body), jamais
 * référencées en dur ailleurs.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Plateforme de financement sportif',
  description: 'Boutique, financement et gestion pour athlètes, équipes et clubs.',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable}`}>
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
