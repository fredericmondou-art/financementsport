'use client';

/**
 * Révélation au scroll (fade + léger déplacement), section par section --
 * brief BRIEF-REFONTE-ACCUEIL.md §8 : "jamais chaotiques", jamais par
 * élément individuel. Nouvelle exception Client Component (voir
 * components/ui/modal.tsx et components/beneficiary-split.tsx pour les
 * précédentes, docs/DECISIONS.md) -- IntersectionObserver n'a pas
 * d'équivalent Server Component.
 *
 * Dégradation sans JS : le contenu est visible par défaut (classe `.reveal`,
 * voir app/globals.css). La classe "cachée" (`.reveal--pending`) n'est
 * ajoutée qu'après le montage côté client ET seulement si le navigateur
 * supporte IntersectionObserver ET si `prefers-reduced-motion` n'est PAS
 * actif -- sinon le contenu reste visible en permanence (aucune animation),
 * conforme à "l'obligatoire" du brief.
 *
 * Révélation unique (pas de va-et-vient au re-scroll) : l'observateur se
 * déconnecte dès la première intersection.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
}

export function ScrollReveal({ children, className }: ScrollRevealProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'static' | 'pending' | 'visible'>('static');

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      return;
    }

    setState('pending');
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState('visible');
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const revealClass =
    state === 'pending' ? 'reveal reveal--pending' : state === 'visible' ? 'reveal reveal--visible' : 'reveal';

  return (
    <div ref={ref} className={[revealClass, className ?? ''].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export default ScrollReveal;
