/**
 * Icônes illustrées de sports/équipements -- accueil, section "Pour tous les
 * sports" (demande explicite du 2026-07-10 : raquette, bâton, patins,
 * terrain, soulier). Purement décoratives (`aria-hidden`), même langage
 * visuel que `DecorativeMedal`/`HeroAnimation`
 * (app/(public)/page.tsx) : traits stylisés aux couleurs de la marque,
 * AUCUNE photo, AUCUN visage -- conforme à BRIEF-REFONTE-ACCUEIL.md §5
 * (illustration uniquement, jamais de photographie de personne, ce qui
 * règle définitivement la question de l'image des mineurs).
 */

export interface SportIconProps {
  className?: string;
}

export function HockeyStickIcon({ className }: SportIconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="18" fill="var(--color-primary-tint)" />
      <path
        d="M15 9 L15 25 Q15 28 18 28 L27 28"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="28.5" cy="29.5" r="2.2" fill="var(--color-accent)" />
    </svg>
  );
}

export function SoccerIcon({ className }: SportIconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="18" fill="var(--color-primary-tint)" />
      <path d="M9 27 Q20 32 31 27" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="16" r="7.5" fill="none" stroke="var(--color-primary)" strokeWidth="2" />
      <path
        d="M20 9.8 L22.6 13.6 L20 17.2 L17.4 13.6 Z M13.5 16.2 L17.4 13.6 M26.5 16.2 L22.6 13.6 M17 21.5 L20 17.2 L23 21.5"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RacketIcon({ className }: SportIconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="18" fill="var(--color-primary-tint)" />
      <ellipse cx="19" cy="14.5" rx="8" ry="9" fill="none" stroke="var(--color-primary)" strokeWidth="2.2" />
      <path d="M19 23.3 L19 31.5" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M13.2 14.5 H24.8 M19 6.8 V22 M15.7 8.6 Q19 14.5 15.7 20.4 M22.3 8.6 Q19 14.5 22.3 20.4"
        stroke="var(--color-accent)"
        strokeWidth="0.9"
        fill="none"
      />
    </svg>
  );
}

export function SkateIcon({ className }: SportIconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="18" fill="var(--color-primary-tint)" />
      <path
        d="M10 23 Q10 15 17.5 14.5 L26.5 15.5 Q29.5 16 29.5 19.5 L28.5 24 L11 24 Z"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 27.5 H31" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function ShoeIcon({ className }: SportIconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="18" fill="var(--color-primary-tint)" />
      <path
        d="M9 24.5 Q9 18.5 15 17.5 L23 15.5 Q27.5 14.5 30.5 18.5 Q32 20.5 30.5 22.5 L29.5 25.5 H10 Q9 25.5 9 24.5 Z"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M15 17.5 L16.6 21.8 M19.2 16.7 L20.6 21.8 M23 15.5 L24.2 21.8"
        stroke="var(--color-accent)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M9.5 25.5 H30.5" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
