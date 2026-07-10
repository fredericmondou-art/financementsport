'use client';

/**
 * Élément signature de l'accueil : le "scoreboard" façon tableau indicateur
 * d'aréna (BRIEF-REFONTE-ACCUEIL.md §7). Décompte/montée animée au premier
 * passage dans le viewport -- nouvelle exception Client Component (voir
 * components/scroll-reveal.tsx pour la justification IntersectionObserver,
 * docs/DECISIONS.md).
 *
 * Contenu : uniquement des libellés honnêtes (brief §7/§12 -- "en
 * pré-lancement, utiliser des libellés honnêtes plutôt que des statistiques
 * inventées"), voir les items passés depuis app/(public)/page.tsx.
 *
 * Accessibilité/mouvement : le rendu serveur affiche déjà la valeur FINALE
 * (aucun flash "0" sans JS). Si `prefers-reduced-motion` est actif ou que
 * IntersectionObserver est indisponible, aucune animation ne démarre --
 * comportement identique au rendu serveur, pas de dégradation.
 */
import { useEffect, useRef, useState } from 'react';

export interface ScoreboardItem {
  /** Valeur numérique finale (ex. 15 pour "15 %"). */
  target: number;
  /** Affiché après le nombre (ex. " %"). */
  suffix: string;
  label: string;
}

export interface ScoreboardProps {
  items: ScoreboardItem[];
}

const ANIMATION_MS = 1200;

export function Scoreboard({ items }: ScoreboardProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [values, setValues] = useState<number[]>(() => items.map((item) => item.target));

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    let frame: number;
    const animate = () => {
      setValues(items.map(() => 0));
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - start) / ANIMATION_MS, 1);
        setValues(items.map((item) => Math.round(item.target * progress)));
        if (progress < 1) {
          frame = requestAnimationFrame(step);
        }
      };
      frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            animate();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // items est une constante définie par l'appelant (voir page d'accueil) --
    // volontairement exclu des dépendances pour ne relancer l'observateur
    // qu'une seule fois par montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="scoreboard__grid">
      {items.map((item, index) => (
        <div key={item.label} className="scoreboard__item">
          <p className="scoreboard__value">
            {values[index]}
            {item.suffix}
          </p>
          <p className="scoreboard__label">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export default Scoreboard;
